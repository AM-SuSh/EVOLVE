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

use core::arch::asm;

use os_syscall::{
    SYS_CLONE, SYS_CLOSE, SYS_EXIT, SYS_EXECVE, SYS_GETPID, SYS_OPENAT, SYS_PIPE, SYS_READ,
    SYS_WAIT4, SYS_WRITE, SYS_YIELD,
};

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

pub fn open(path: &str) -> isize {
    let ret;
    unsafe {
        asm!(
            "ecall",
            in("a7") SYS_OPENAT,
            in("a0") path.as_ptr(),
            in("a1") path.len(),
            in("a2") 0usize,
            lateout("a0") ret,
        );
    }
    ret
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
