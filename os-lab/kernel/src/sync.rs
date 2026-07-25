//! Synchronization primitives: spin mutex and pipe IPC (lab5).

use core::sync::atomic::{AtomicBool, Ordering};

use crate::cell::SyncUnsafeCell;
use crate::config::{MAX_PIPES, PIPE_BUFFER_SIZE};
use crate::mm;

/// Simple spin mutex for kernel teaching use.
pub struct SpinMutex<T> {
    lock: AtomicBool,
    data: core::cell::UnsafeCell<T>,
}

unsafe impl<T: Send> Sync for SpinMutex<T> {}
unsafe impl<T: Send> Send for SpinMutex<T> {}

impl<T> SpinMutex<T> {
    pub const fn new(data: T) -> Self {
        Self {
            lock: AtomicBool::new(false),
            data: core::cell::UnsafeCell::new(data),
        }
    }

    pub fn lock(&self) -> SpinMutexGuard<'_, T> {
        while self
            .lock
            .compare_exchange_weak(false, true, Ordering::Acquire, Ordering::Relaxed)
            .is_err()
        {}
        SpinMutexGuard { mutex: self }
    }
}

pub struct SpinMutexGuard<'a, T> {
    mutex: &'a SpinMutex<T>,
}

impl<T> Drop for SpinMutexGuard<'_, T> {
    fn drop(&mut self) {
        self.mutex.lock.store(false, Ordering::Release);
    }
}

impl<T> core::ops::Deref for SpinMutexGuard<'_, T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        unsafe { &*self.mutex.data.get() }
    }
}

impl<T> core::ops::DerefMut for SpinMutexGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        unsafe { &mut *self.mutex.data.get() }
    }
}

struct PipeInner {
    buffer: [u8; PIPE_BUFFER_SIZE],
    read_pos: usize,
    write_pos: usize,
    count: usize,
    write_closed: bool,
    read_refs: usize,
    write_refs: usize,
}

impl PipeInner {
    const fn new() -> Self {
        Self {
            buffer: [0; PIPE_BUFFER_SIZE],
            read_pos: 0,
            write_pos: 0,
            count: 0,
            write_closed: false,
            read_refs: 0,
            write_refs: 0,
        }
    }
}

struct Pipe {
    inner: SpinMutex<PipeInner>,
}

static PIPES: SyncUnsafeCell<[Option<Pipe>; MAX_PIPES]> =
    SyncUnsafeCell::new([const { None }; MAX_PIPES]);

pub fn init() {}

fn alloc_pipe_id() -> Option<usize> {
    PIPES.with(|pipes| {
        for (i, slot) in pipes.iter_mut().enumerate() {
            if slot.is_none() {
                *slot = Some(Pipe {
                    inner: SpinMutex::new(PipeInner::new()),
                });
                return Some(i);
            }
        }
        None
    })
}

pub fn pipe_add_refs(pipe_id: usize, read: bool, write: bool) {
    PIPES.with_ref(|pipes| {
        let pipe = pipes[pipe_id].as_ref().expect("pipe_add_refs");
        let mut inner = pipe.inner.lock();
        if read {
            inner.read_refs += 1;
        }
        if write {
            inner.write_refs += 1;
        }
    });
}

pub fn pipe_read(pipe_id: usize, buf: *mut u8, len: usize) -> isize {
    if buf.is_null() || len == 0 {
        return 0;
    }
    PIPES.with_ref(|pipes| {
        let pipe = pipes[pipe_id].as_ref().expect("pipe_read");
        let mut inner = pipe.inner.lock();
        if inner.count == 0 {
            if inner.write_closed {
                return 0;
            }
            return -1;
        }
        let to_read = len.min(inner.count);
        mm::activate_current_user();
        for i in 0..to_read {
            let pos = inner.read_pos;
            let byte = inner.buffer[pos];
            inner.read_pos = (pos + 1) % PIPE_BUFFER_SIZE;
            unsafe {
                core::ptr::write_volatile(buf.add(i), byte);
            }
        }
        mm::activate_kernel();
        inner.count -= to_read;
        to_read as isize
    })
}

pub fn pipe_write(pipe_id: usize, buf: *const u8, len: usize) -> isize {
    if buf.is_null() || len == 0 {
        return 0;
    }
    PIPES.with_ref(|pipes| {
        let pipe = pipes[pipe_id].as_ref().expect("pipe_write");
        let mut inner = pipe.inner.lock();
        if inner.write_closed {
            return -1;
        }
        mm::activate_current_user();
        let user_slice = unsafe { core::slice::from_raw_parts(buf, len) };
        let mut written = 0usize;
        for &byte in user_slice {
            if inner.count >= PIPE_BUFFER_SIZE {
                break;
            }
            let pos = inner.write_pos;
            inner.buffer[pos] = byte;
            inner.write_pos = (pos + 1) % PIPE_BUFFER_SIZE;
            inner.count += 1;
            written += 1;
        }
        mm::activate_kernel();
        written as isize
    })
}

pub fn pipe_close_read(pipe_id: usize) {
    PIPES.with_ref(|pipes| {
        let Some(pipe) = pipes[pipe_id].as_ref() else {
            return;
        };
        let mut inner = pipe.inner.lock();
        if inner.read_refs > 0 {
            inner.read_refs -= 1;
        }
        if inner.read_refs == 0 && inner.write_refs == 0 {
            drop(inner);
            PIPES.with(|pipes| {
                pipes[pipe_id] = None;
            });
        }
    });
}

pub fn pipe_close_write(pipe_id: usize) {
    PIPES.with_ref(|pipes| {
        let Some(pipe) = pipes[pipe_id].as_ref() else {
            return;
        };
        let mut inner = pipe.inner.lock();
        if inner.write_refs > 0 {
            inner.write_refs -= 1;
        }
        if inner.write_refs == 0 {
            inner.write_closed = true;
        }
        if inner.read_refs == 0 && inner.write_refs == 0 {
            drop(inner);
            PIPES.with(|pipes| {
                pipes[pipe_id] = None;
            });
        }
    });
}

fn write_user_i32_pair(ptr: *mut i32, read_fd: i32, write_fd: i32) -> bool {
    if ptr.is_null() {
        return false;
    }
    mm::activate_current_user();
    unsafe {
        core::ptr::write_volatile(ptr, read_fd);
        core::ptr::write_volatile(ptr.add(1), write_fd);
    }
    mm::activate_kernel();
    true
}

pub fn sys_pipe(fds: *mut i32) -> isize {
    let pipe_id = match alloc_pipe_id() {
        Some(id) => id,
        None => return -1,
    };
    let read_fd = match crate::fs::alloc_pipe_fds(pipe_id) {
        Some((r, w)) => (r, w),
        None => {
            PIPES.with(|pipes| {
                pipes[pipe_id] = None;
            });
            return -1;
        }
    };
    pipe_add_refs(pipe_id, true, true);
    if !write_user_i32_pair(fds, read_fd.0 as i32, read_fd.1 as i32) {
        crate::fs::close_fd_pair(read_fd.0, read_fd.1);
        pipe_close_read(pipe_id);
        pipe_close_write(pipe_id);
        return -1;
    }
    0
}
