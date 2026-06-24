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
