//! RISC-V CSR helpers used by trap and task modules (lab2+).

use core::arch::asm;

#[inline]
pub fn read_scause() -> usize {
    let scause: usize;
    unsafe { asm!("csrr {}, scause", out(reg) scause) };
    scause
}

#[inline]
pub fn write_sepc(sepc: usize) {
    unsafe { asm!("csrw sepc, {}", in(reg) sepc) };
}

#[inline]
pub fn write_stvec(stvec: usize) {
    unsafe { asm!("csrw stvec, {}", in(reg) stvec) };
}

#[inline]
pub fn write_sscratch(sscratch: usize) {
    unsafe { asm!("csrw sscratch, {}", in(reg) sscratch) };
}

#[inline]
pub fn read_time() -> usize {
    let time: usize;
    unsafe { asm!("csrr {}, time", out(reg) time) };
    time
}

pub const SCAUSE_USER_ECALL: usize = 8;
pub const SCAUSE_SUPERVISOR_ECALL: usize = 9;
pub const SCAUSE_SUPERVISOR_TIMER: usize = 0x8000_0000_0000_0005;

/// SBI legacy extension id for the timer extension ("TIME").
const SBI_LEGACY_TIMER_EID: usize = 0x54494D45;

/// Program the next timer event via the SBI legacy timer extension.
///
/// SBI writes its return value into `a0`/`a1`, so those registers must be
/// declared `inout` (input value discarded) instead of plain `in`.
pub fn set_next_timer(deadline: usize) {
    unsafe {
        asm!(
            "ecall",
            in("a7") SBI_LEGACY_TIMER_EID,
            in("a6") 0usize,
            inout("a0") deadline => _,
            inout("a1") 0usize => _,
        );
    }
}

#[inline]
pub fn read_stval() -> usize {
    let stval: usize;
    unsafe { asm!("csrr {}, stval", out(reg) stval) };
    stval
}
