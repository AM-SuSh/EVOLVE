const SBI_LEGACY_CONSOLE_PUTCHAR: usize = 1;
const SBI_LEGACY_SHUTDOWN: usize = 8;

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
