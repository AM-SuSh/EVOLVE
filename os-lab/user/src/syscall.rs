//! User-space syscall wrappers.

use core::arch::asm;

use os_syscall::{SYS_CLONE, SYS_EXIT, SYS_EXECVE, SYS_GETPID, SYS_WAIT4, SYS_WRITE, SYS_YIELD};

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
