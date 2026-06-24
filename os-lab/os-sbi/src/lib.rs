//! SBI (Supervisor Binary Interface) ecall wrappers for the OS teaching lab.

#![no_std]

pub const SBI_LEGACY_CONSOLE_PUTCHAR: usize = 1;
pub const SBI_LEGACY_SHUTDOWN: usize = 8;

const _: () = assert!(SBI_LEGACY_CONSOLE_PUTCHAR == 1);
const _: () = assert!(SBI_LEGACY_SHUTDOWN == 8);

#[cfg(target_arch = "riscv64")]
pub fn console_putchar(ch: u8) {
    unsafe {
        core::arch::asm!(
            "ecall",
            in("a7") SBI_LEGACY_CONSOLE_PUTCHAR,
            in("a0") ch as usize,
            in("a6") 0usize,
            lateout("a0") _,
        );
    }
}

#[cfg(not(target_arch = "riscv64"))]
pub fn console_putchar(_ch: u8) {}

#[cfg(target_arch = "riscv64")]
pub fn shutdown() -> ! {
    unsafe {
        core::arch::asm!(
            "ecall",
            in("a7") SBI_LEGACY_SHUTDOWN,
            in("a6") 0usize,
            options(noreturn)
        );
    }
}

#[cfg(not(target_arch = "riscv64"))]
pub fn shutdown() -> ! {
    loop {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_console_putchar_number() {
        assert_eq!(SBI_LEGACY_CONSOLE_PUTCHAR, 1);
    }

    #[test]
    fn legacy_shutdown_number() {
        assert_eq!(SBI_LEGACY_SHUTDOWN, 8);
    }
}
