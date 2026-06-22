//! User-space syscall wrappers.

use core::arch::asm;

use os_syscall::{SYS_EXIT, SYS_WRITE, SYS_YIELD};

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
