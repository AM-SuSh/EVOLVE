//! File system integration: fd table, embedded read-only files, pipe fds (lab5).

use crate::config::{MAX_FD, MAX_PROCESS_NUM};
use crate::mm;
use crate::process::current_slot;
use crate::sync;
use os_fs::{EmbeddedFs, FileId};

/// Single read-only file table (shared with `os-fs` crate host tests).
static FS: EmbeddedFs = EmbeddedFs::default_fs();

/// Max bytes copied per `read` syscall (kernel stack buffer).
const MAX_READ_CHUNK: usize = 256;

#[derive(Clone, Copy)]
enum FdType {
    Regular {
        file_id: FileId,
        offset: usize,
    },
    PipeRead(usize),
    PipeWrite(usize),
}

struct FdTable {
    slots: [Option<FdType>; MAX_FD],
}

impl FdTable {
    const fn new() -> Self {
        Self {
            slots: [const { None }; MAX_FD],
        }
    }

    fn alloc(&mut self, ty: FdType) -> Option<usize> {
        for i in 0..MAX_FD {
            if self.slots[i].is_none() {
                self.slots[i] = Some(ty);
                return Some(i);
            }
        }
        None
    }
}

impl Clone for FdTable {
    fn clone(&self) -> Self {
        *self
    }
}

impl Copy for FdTable {}

static mut FD_TABLES: [FdTable; MAX_PROCESS_NUM] = [const { FdTable::new() }; MAX_PROCESS_NUM];

pub fn init() {
    init_process_fds(0);
}

pub fn init_process_fds(slot: usize) {
    unsafe {
        FD_TABLES[slot] = FdTable::new();
    }
}

fn find_file(path: &str) -> Option<FileId> {
    FS.open(path)
}

pub fn clone_fd_table(parent_slot: usize, child_slot: usize) {
    unsafe {
        FD_TABLES[child_slot] = FD_TABLES[parent_slot];
        for ty in FD_TABLES[child_slot].slots.iter().flatten() {
            match ty {
                FdType::PipeRead(id) => sync::pipe_add_refs(*id, true, false),
                FdType::PipeWrite(id) => sync::pipe_add_refs(*id, false, true),
                FdType::Regular { .. } => {}
            }
        }
    }
}

pub fn close_all_fds(slot: usize) {
    unsafe {
        for i in 0..MAX_FD {
            if let Some(ty) = FD_TABLES[slot].slots[i] {
                close_fd_type(ty);
            }
        }
        FD_TABLES[slot] = FdTable::new();
    }
}

fn close_fd_type(ty: FdType) {
    match ty {
        FdType::PipeRead(id) => sync::pipe_close_read(id),
        FdType::PipeWrite(id) => sync::pipe_close_write(id),
        FdType::Regular { .. } => {}
    }
}

pub fn alloc_pipe_fds(pipe_id: usize) -> Option<(usize, usize)> {
    let slot = current_slot();
    unsafe {
        let table = &mut FD_TABLES[slot];
        let read_fd = table.alloc(FdType::PipeRead(pipe_id))?;
        let write_fd = table.alloc(FdType::PipeWrite(pipe_id))?;
        Some((read_fd, write_fd))
    }
}

pub fn close_fd_pair(read_fd: usize, write_fd: usize) {
    let slot = current_slot();
    unsafe {
        if let Some(ty) = FD_TABLES[slot].slots[read_fd] {
            close_fd_type(ty);
        }
        if let Some(ty) = FD_TABLES[slot].slots[write_fd] {
            close_fd_type(ty);
        }
        FD_TABLES[slot].slots[read_fd] = None;
        FD_TABLES[slot].slots[write_fd] = None;
    }
}

fn read_user_str(ptr: *const u8, len: usize) -> Option<[u8; 32]> {
    if ptr.is_null() || len == 0 || len > 31 {
        return None;
    }
    mm::activate_current_user();
    let mut buf = [0u8; 32];
    unsafe {
        core::ptr::copy_nonoverlapping(ptr, buf.as_mut_ptr(), len);
    }
    mm::activate_kernel();
    Some(buf)
}

fn get_fd(slot: usize, fd: usize) -> Option<FdType> {
    unsafe { FD_TABLES[slot].slots.get(fd).and_then(|s| *s) }
}

fn set_fd_offset(slot: usize, fd: usize, offset: usize) {
    unsafe {
        if let Some(FdType::Regular { file_id, .. }) = FD_TABLES[slot].slots[fd] {
            FD_TABLES[slot].slots[fd] = Some(FdType::Regular { file_id, offset });
        }
    }
}

pub fn sys_openat(path: *const u8, path_len: usize, _flags: usize) -> isize {
    let name_buf = match read_user_str(path, path_len) {
        Some(b) => b,
        None => return -1,
    };
    let name = match core::str::from_utf8(&name_buf[..path_len]) {
        Ok(s) => s,
        Err(_) => return -1,
    };
    let file_id = match find_file(name) {
        Some(id) => id,
        None => return -1,
    };
    let slot = current_slot();
    unsafe {
        match FD_TABLES[slot].alloc(FdType::Regular {
            file_id,
            offset: 0,
        }) {
            Some(fd) => fd as isize,
            None => -1,
        }
    }
}

pub fn sys_read(fd: usize, buf: *mut u8, len: usize) -> isize {
    if buf.is_null() {
        return -1;
    }
    let slot = current_slot();
    let ty = match get_fd(slot, fd) {
        Some(t) => t,
        None => return -1,
    };
    match ty {
        FdType::PipeRead(pipe_id) => sync::pipe_read(pipe_id, buf, len),
        FdType::Regular { file_id, offset } => {
            let file_size = FS.size(file_id);
            if offset >= file_size {
                return 0;
            }
            let to_read = len.min(file_size - offset).min(MAX_READ_CHUNK);
            let mut kbuf = [0u8; MAX_READ_CHUNK];
            let n = FS.read_at(file_id, offset, &mut kbuf[..to_read]);
            if n == 0 {
                return 0;
            }
            mm::activate_current_user();
            unsafe {
                core::ptr::copy_nonoverlapping(kbuf.as_ptr(), buf, n);
            }
            mm::activate_kernel();
            set_fd_offset(slot, fd, offset + n);
            n as isize
        }
        FdType::PipeWrite(_) => -1,
    }
}

pub fn sys_close(fd: usize) -> isize {
    let slot = current_slot();
    unsafe {
        let ty = match FD_TABLES[slot].slots[fd] {
            Some(t) => t,
            None => return -1,
        };
        close_fd_type(ty);
        FD_TABLES[slot].slots[fd] = None;
    }
    0
}

pub fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize {
    let slot = current_slot();
    let ty = match get_fd(slot, fd) {
        Some(t) => t,
        None => return -1,
    };
    match ty {
        FdType::PipeWrite(pipe_id) => sync::pipe_write(pipe_id, buf, len),
        _ => -1,
    }
}
