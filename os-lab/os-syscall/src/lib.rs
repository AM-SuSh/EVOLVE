//! System call numbers for the OS teaching lab (RISC-V Linux ABI).
//!
//! | Number | Name    | Lab |
//! |--------|---------|-----|
//! | 56     | openat  | 5   |
//! | 57     | close   | 5   |
//! | 59     | pipe    | 5   |
//! | 63     | read    | 5   |
//! | 64     | write   | 2   |
//! | 93     | exit    | 2   |
//! | 124    | yield   | 2   |
//! | 172    | getpid  | 4   |
//! | 220    | clone   | 4   |
//! | 221    | execve  | 4   |
//! | 260    | wait4   | 4   |
//! | 35     | unlinkat| 6   |
//! | 37     | linkat  | 6   |
//! | 80     | fstat   | 6   |
//! | 140    | set_priority | 6 |
//! | 215    | munmap  | 6   |
//! | 222    | mmap    | 6   |
//! | 400    | spawn   | 6   |
//! | 23     | dup     | 7   |
//! | 129    | kill    | 7   |
//! | 134    | sigaction | 7 |
//! | 135    | sigprocmask | 7 |
//! | 139    | sigreturn | 7 |
//!
//! ## Lab4 user-space argument convention
//!
//! Wrappers in `user/src/syscall.rs` use a simplified ABI for teaching:
//! `SYS_CLONE` as fork (no flags), `SYS_EXECVE` with path length in `a1` (not argv).
//!
//! ## Lab5 user-space argument convention
//!
//! | Wrapper   | Syscall      | Arguments |
//! |-----------|--------------|-----------|
//! | `open(s)` | `SYS_OPENAT` | `a0` = path pointer, `a1` = path **byte length**, `a2` = 0 |
//! | `read`    | `SYS_READ`   | `a0` = fd, `a1` = buffer pointer, `a2` = length |
//! | `close`   | `SYS_CLOSE`  | `a0` = fd |
//! | `pipe`    | `SYS_PIPE`   | `a0` = pointer to `[i32; 2]` for read/write fds |

#![no_std]

// Lab2
pub const SYS_WRITE: usize = 64;
pub const SYS_EXIT: usize = 93;
pub const SYS_YIELD: usize = 124;

// Lab4
pub const SYS_GETPID: usize = 172;
pub const SYS_CLONE: usize = 220;
pub const SYS_EXECVE: usize = 221;
pub const SYS_WAIT4: usize = 260;

// Lab5
pub const SYS_OPENAT: usize = 56;
pub const SYS_CLOSE: usize = 57;
pub const SYS_READ: usize = 63;
pub const SYS_PIPE: usize = 59;

// Lab6 (ch6 exercise prerequisites + disk FS)
pub const SYS_UNLINKAT: usize = 35;
pub const SYS_LINKAT: usize = 37;
pub const SYS_FSTAT: usize = 80;
pub const SYS_SET_PRIORITY: usize = 140;
pub const SYS_MUNMAP: usize = 215;
pub const SYS_MMAP: usize = 222;
pub const SYS_SPAWN: usize = 400;

// Lab7 (ch7 IPC + signals)
pub const SYS_DUP: usize = 23;
pub const SYS_KILL: usize = 129;
pub const SYS_SIGACTION: usize = 134;
pub const SYS_SIGPROCMASK: usize = 135;
pub const SYS_SIGRETURN: usize = 139;

// Lab8 (ch8 threads + blocking sync + deadlock)
pub const SYS_THREAD_CREATE: usize = 1000;
pub const SYS_GETTID: usize = 1001;
pub const SYS_WAITTID: usize = 1002;
pub const SYS_MUTEX_CREATE: usize = 1010;
pub const SYS_MUTEX_LOCK: usize = 1011;
pub const SYS_MUTEX_UNLOCK: usize = 1012;
pub const SYS_SEMAPHORE_CREATE: usize = 1020;
pub const SYS_SEMAPHORE_UP: usize = 1021;
pub const SYS_SEMAPHORE_DOWN: usize = 1022;
pub const SYS_CONDVAR_CREATE: usize = 1030;
pub const SYS_CONDVAR_SIGNAL: usize = 1031;
pub const SYS_CONDVAR_WAIT: usize = 1032;
pub const SYS_ENABLE_DEADLOCK_DETECT: usize = 469;

/// Returned by sync syscalls when deadlock detection rejects the operation.
pub const DEADLOCK_DETECTED: isize = -0xDEAD;

/// `sigaction` layout (shared user/kernel).
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct SignalAction {
    pub handler: usize,
    pub mask: u32,
}

/// File type flags for [`Stat::mode`] (Linux `st_mode` subset).
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub struct StatMode(pub u32);

impl StatMode {
    pub const NULL: Self = Self(0);
    pub const DIR: Self = Self(0o040_000);
    pub const FILE: Self = Self(0o100_000);
}

/// File status returned by `fstat` (shared user/kernel layout).
#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct Stat {
    pub dev: u64,
    pub ino: u64,
    pub mode: StatMode,
    pub nlink: u32,
    pad: [u64; 7],
}

impl Stat {
    pub const fn new() -> Self {
        Self {
            dev: 0,
            ino: 0,
            mode: StatMode::NULL,
            nlink: 0,
            pad: [0; 7],
        }
    }
}

const _: () = assert!(SYS_WRITE == 64);
const _: () = assert!(SYS_EXIT == 93);
const _: () = assert!(SYS_YIELD == 124);
const _: () = assert!(SYS_GETPID == 172);
const _: () = assert!(SYS_CLONE == 220);
const _: () = assert!(SYS_EXECVE == 221);
const _: () = assert!(SYS_WAIT4 == 260);
const _: () = assert!(SYS_OPENAT == 56);
const _: () = assert!(SYS_CLOSE == 57);
const _: () = assert!(SYS_READ == 63);
const _: () = assert!(SYS_PIPE == 59);

/// Human-readable syscall name for logging and tests.
pub const fn syscall_name(id: usize) -> &'static str {
    match id {
        SYS_OPENAT => "openat",
        SYS_CLOSE => "close",
        SYS_READ => "read",
        SYS_PIPE => "pipe",
        SYS_WRITE => "write",
        SYS_EXIT => "exit",
        SYS_YIELD => "yield",
        SYS_GETPID => "getpid",
        SYS_CLONE => "clone",
        SYS_EXECVE => "execve",
        SYS_WAIT4 => "wait4",
        SYS_UNLINKAT => "unlinkat",
        SYS_LINKAT => "linkat",
        SYS_FSTAT => "fstat",
        SYS_SET_PRIORITY => "set_priority",
        SYS_MUNMAP => "munmap",
        SYS_MMAP => "mmap",
        SYS_SPAWN => "spawn",
        SYS_DUP => "dup",
        SYS_KILL => "kill",
        SYS_SIGACTION => "sigaction",
        SYS_SIGPROCMASK => "sigprocmask",
        SYS_SIGRETURN => "sigreturn",
        SYS_THREAD_CREATE => "thread_create",
        SYS_GETTID => "gettid",
        SYS_WAITTID => "waittid",
        SYS_MUTEX_CREATE => "mutex_create",
        SYS_MUTEX_LOCK => "mutex_lock",
        SYS_MUTEX_UNLOCK => "mutex_unlock",
        SYS_SEMAPHORE_CREATE => "semaphore_create",
        SYS_SEMAPHORE_UP => "semaphore_up",
        SYS_SEMAPHORE_DOWN => "semaphore_down",
        SYS_CONDVAR_CREATE => "condvar_create",
        SYS_CONDVAR_SIGNAL => "condvar_signal",
        SYS_CONDVAR_WAIT => "condvar_wait",
        SYS_ENABLE_DEADLOCK_DETECT => "enable_deadlock_detect",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lab2_syscall_numbers() {
        assert_eq!(syscall_name(SYS_WRITE), "write");
        assert_eq!(syscall_name(SYS_EXIT), "exit");
        assert_eq!(syscall_name(SYS_YIELD), "yield");
    }

    #[test]
    fn lab4_syscall_numbers() {
        assert_eq!(syscall_name(SYS_GETPID), "getpid");
        assert_eq!(syscall_name(SYS_CLONE), "clone");
        assert_eq!(syscall_name(SYS_EXECVE), "execve");
        assert_eq!(syscall_name(SYS_WAIT4), "wait4");
    }

    #[test]
    fn lab5_syscall_numbers() {
        assert_eq!(syscall_name(SYS_OPENAT), "openat");
        assert_eq!(syscall_name(SYS_CLOSE), "close");
        assert_eq!(syscall_name(SYS_READ), "read");
        assert_eq!(syscall_name(SYS_PIPE), "pipe");
    }

    #[test]
    fn unknown_syscall() {
        assert_eq!(syscall_name(999), "unknown");
    }
}
