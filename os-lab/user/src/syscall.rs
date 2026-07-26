//! User-space syscall wrappers (lab2+).
//!
//! Registers follow the RISC-V Linux ABI: `a7` = syscall number, `a0`–`a2` = arguments,
//! return value in `a0`.
//!
//! ## Lab4 teaching ABI (differs from full Linux)
//!
//! | Wrapper   | Syscall      | Arguments |
//! |-----------|--------------|-----------|
//! | `fork()`  | `SYS_CLONE`  | none (simplified fork, no flags) |
//! | `exec(s)` | `SYS_EXECVE` | `a0` = path pointer, `a1` = path **byte length**, `a2` = 0 |
//! | `waitpid` | `SYS_WAIT4`  | `a0` = pid, `a1` = exit-code pointer |
//! | `getpid`  | `SYS_GETPID` | none |
//!
//! `exec` passes path length in `a1` instead of an argv vector so the kernel can read
//! exactly `len` bytes and avoid mistaking adjacent rodata strings (e.g. `"hello"` vs
//! `"helloworld"`) when only a name is embedded.
//!
//! ## Lab5 teaching ABI
//!
//! | Wrapper   | Syscall      | Arguments |
//! |-----------|--------------|-----------|
//! | `open(s)` | `SYS_OPENAT` | `a0` = path pointer, `a1` = path **byte length**, `a2` = 0 |
//! | `read`    | `SYS_READ`   | `a0` = fd, `a1` = buffer pointer, `a2` = length |
//! | `close`   | `SYS_CLOSE`  | `a0` = fd |
//! | `pipe`    | `SYS_PIPE`   | `a0` = pointer to `[i32; 2]` (read fd, write fd) |
//!
//! Pipe read returns -1 when empty (non-blocking); user programs should `yield_()` and retry.
//!
//! ## Lab6 teaching ABI
//!
//! | Wrapper        | Syscall          | Arguments |
//! |----------------|------------------|-----------|
//! | `openat`       | `SYS_OPENAT`     | path ptr, path len, open flags |
//! | `linkat`       | `SYS_LINKAT`     | `a1`/`a3` = null-terminated C path strings |
//! | `unlinkat`     | `SYS_UNLINKAT`   | `a1` = null-terminated C path string |
//! | `fstat`        | `SYS_FSTAT`      | fd, `Stat` buffer pointer |
//! | `mmap`         | `SYS_MMAP`       | addr, len, prot (fd/offset unused) |
//! | `munmap`       | `SYS_MUNMAP`     | addr, len |
//! | `spawn`        | `SYS_SPAWN`      | path ptr, path **byte length** |
//! | `set_priority` | `SYS_SET_PRIORITY` | prio |
//!
//! ## Lab7 teaching ABI
//!
//! | Wrapper       | Syscall          | Arguments |
//! |---------------|------------------|-----------|
//! | `dup`         | `SYS_DUP`        | `a0` = old fd |
//! | `kill`        | `SYS_KILL`       | `a0` = pid, `a1` = signum |
//! | `sigaction`   | `SYS_SIGACTION`  | signum, action ptr, old_action ptr |
//! | `sigprocmask` | `SYS_SIGPROCMASK`| mask bitmap |
//! | `sigreturn`   | `SYS_SIGRETURN`  | none |
//!
//! ## Lab8 teaching ABI
//!
//! Blocking `mutex_lock` / `semaphore_down` / `condvar_wait` retry when the kernel
//! returns `-1` after waking the thread. Deadlock detection returns `DEADLOCK_DETECTED`
//! (`-0xDEAD`) without blocking.

use core::arch::asm;

use os_syscall::{
    SignalAction, Stat, SYS_CLONE, SYS_CLOSE, SYS_CONDVAR_CREATE, SYS_CONDVAR_SIGNAL,
    SYS_CONDVAR_WAIT, SYS_DUP, SYS_ENABLE_DEADLOCK_DETECT, SYS_EXIT, SYS_EXECVE, SYS_FSTAT,
    SYS_GETPID, SYS_GETTID, SYS_KILL, SYS_LINKAT, SYS_MMAP, SYS_MUNMAP, SYS_MUTEX_CREATE,
    SYS_MUTEX_LOCK, SYS_MUTEX_UNLOCK, SYS_OPENAT, SYS_PIPE, SYS_READ, SYS_SEMAPHORE_CREATE,
    SYS_SEMAPHORE_DOWN, SYS_SEMAPHORE_UP, SYS_SET_PRIORITY, SYS_SIGACTION, SYS_SIGPROCMASK,
    SYS_SIGRETURN, SYS_SPAWN, SYS_THREAD_CREATE, SYS_UNLINKAT, SYS_WAIT4, SYS_WAITTID,
    SYS_WRITE, SYS_YIELD,
};

/// SIGUSR1 (user-defined, used by lab7 tests).
pub const SIGUSR1: u8 = 10;
/// SIGINT (default terminate when unhandled).
pub const SIGINT: u8 = 2;
/// SIGKILL (cannot be caught or masked).
pub const SIGKILL: u8 = 9;

/// `openat` flags (easy-fs `OpenFlags` subset).
pub const O_RDONLY: usize = 0;
pub const O_WRONLY: usize = 1 << 0;
pub const O_RDWR: usize = 1 << 1;
pub const O_CREATE: usize = 1 << 9;
pub const O_TRUNC: usize = 1 << 10;

/// `mmap` protection bits (Linux subset).
pub const PROT_READ: isize = 0x1;
pub const PROT_WRITE: isize = 0x2;
pub const PROT_EXEC: isize = 0x4;

/// Deadlock rejection return from `mutex_lock` / `semaphore_down` (lab8).
pub use os_syscall::DEADLOCK_DETECTED;

pub const PAGE_SIZE: usize = 4096;

pub fn write(fd: usize, buf: &[u8]) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_WRITE,
            in("a0") fd,
            in("a1") buf.as_ptr(),
            in("a2") buf.len(),
            lateout("a0") ret,
        );
    }
    ret
}

pub fn exit(exit_code: i32) -> ! {
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_EXIT,
            in("a0") exit_code as usize,
            options(noreturn)
        );
    }
}

pub fn yield_() -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_YIELD,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn getpid() -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_GETPID,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn fork() -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_CLONE,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn exec(name: &str) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_EXECVE,
            in("a0") name.as_ptr(),
            in("a1") name.len(),
            in("a2") 0usize,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn waitpid(pid: isize, exit_code: &mut i32) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_WAIT4,
            in("a0") pid as usize,
            in("a1") exit_code as *mut i32,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn openat(path: &str, flags: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_OPENAT,
            in("a0") path.as_ptr(),
            in("a1") path.len(),
            in("a2") flags,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn open(path: &str) -> isize {
    openat(path, O_RDONLY)
}

pub fn read(fd: usize, buf: &mut [u8]) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_READ,
            in("a0") fd,
            in("a1") buf.as_mut_ptr(),
            in("a2") buf.len(),
            lateout("a0") ret,
        );
    }
    ret
}

pub fn close(fd: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_CLOSE,
            in("a0") fd,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn pipe(fds: &mut [i32; 2]) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_PIPE,
            in("a0") fds.as_mut_ptr(),
            lateout("a0") ret,
        );
    }
    ret
}

fn path_to_cstr(path: &str, buf: &mut [u8; 256]) -> Option<*const u8> {
    if path.len() >= buf.len() {
        return None;
    }
    buf.fill(0);
    buf[..path.len()].copy_from_slice(path.as_bytes());
    Some(buf.as_ptr())
}

pub fn linkat(oldpath: &str, newpath: &str) -> isize {
    let mut old_buf = [0u8; 256];
    let mut new_buf = [0u8; 256];
    let old_ptr = match path_to_cstr(oldpath, &mut old_buf) {
        Some(p) => p,
        None => return -1,
    };
    let new_ptr = match path_to_cstr(newpath, &mut new_buf) {
        Some(p) => p,
        None => return -1,
    };
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_LINKAT,
            in("a0") 0usize,
            in("a1") old_ptr,
            in("a2") 0usize,
            in("a3") new_ptr,
            in("a4") 0usize,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn unlinkat(path: &str) -> isize {
    let mut buf = [0u8; 256];
    let path_ptr = match path_to_cstr(path, &mut buf) {
        Some(p) => p,
        None => return -1,
    };
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_UNLINKAT,
            in("a0") 0usize,
            in("a1") path_ptr,
            in("a2") 0usize,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn fstat(fd: usize, stat: &mut Stat) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_FSTAT,
            in("a0") fd,
            in("a1") stat as *mut Stat,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn mmap(addr: usize, len: usize, prot: isize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_MMAP,
            in("a0") addr,
            in("a1") len,
            in("a2") prot as usize,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn munmap(addr: usize, len: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_MUNMAP,
            in("a0") addr,
            in("a1") len,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn spawn(path: &str) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_SPAWN,
            in("a0") path.as_ptr(),
            in("a1") path.len(),
            lateout("a0") ret,
        );
    }
    ret
}

pub fn set_priority(prio: isize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_SET_PRIORITY,
            in("a0") prio as usize,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn dup(old_fd: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_DUP,
            in("a0") old_fd,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn kill(pid: isize, signum: u8) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_KILL,
            in("a0") pid as usize,
            in("a1") signum as usize,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn sigaction(
    signum: usize,
    action: *const SignalAction,
    old_action: *mut SignalAction,
) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_SIGACTION,
            in("a0") signum,
            in("a1") action,
            in("a2") old_action,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn sigprocmask(mask: u32) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_SIGPROCMASK,
            in("a0") mask as usize,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn sigreturn() -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_SIGRETURN,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn thread_create(entry: usize, arg: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_THREAD_CREATE,
            in("a0") entry,
            in("a1") arg,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn gettid() -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_GETTID,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn waittid(tid: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_WAITTID,
            in("a0") tid,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn mutex_create(blocking: bool) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_MUTEX_CREATE,
            in("a0") blocking as usize,
            lateout("a0") ret,
        );
    }
    ret
}

fn mutex_lock_raw(mutex_id: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_MUTEX_LOCK,
            in("a0") mutex_id,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn mutex_lock(mutex_id: usize) -> isize {
    loop {
        let ret = mutex_lock_raw(mutex_id);
        if ret != -1 {
            return ret;
        }
    }
}

pub fn mutex_unlock(mutex_id: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_MUTEX_UNLOCK,
            in("a0") mutex_id,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn semaphore_create(res_count: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_SEMAPHORE_CREATE,
            in("a0") res_count,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn semaphore_up(sem_id: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_SEMAPHORE_UP,
            in("a0") sem_id,
            lateout("a0") ret,
        );
    }
    ret
}

fn semaphore_down_raw(sem_id: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_SEMAPHORE_DOWN,
            in("a0") sem_id,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn semaphore_down(sem_id: usize) -> isize {
    loop {
        let ret = semaphore_down_raw(sem_id);
        if ret != -1 {
            return ret;
        }
    }
}

pub fn condvar_create() -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_CONDVAR_CREATE,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn condvar_signal(condvar_id: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_CONDVAR_SIGNAL,
            in("a0") condvar_id,
            lateout("a0") ret,
        );
    }
    ret
}

fn condvar_wait_raw(condvar_id: usize, mutex_id: usize) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_CONDVAR_WAIT,
            in("a0") condvar_id,
            in("a1") mutex_id,
            lateout("a0") ret,
        );
    }
    ret
}

pub fn condvar_wait(condvar_id: usize, mutex_id: usize) -> isize {
    loop {
        let ret = condvar_wait_raw(condvar_id, mutex_id);
        if ret != -1 {
            return ret;
        }
    }
}

pub fn enable_deadlock_detect(enabled: bool) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_ENABLE_DEADLOCK_DETECT,
            in("a0") enabled as usize,
            lateout("a0") ret,
        );
    }
    ret
}
