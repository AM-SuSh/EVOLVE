//! RISC-V CSR helpers used by trap and task modules (lab2+).

#![allow(dead_code)]

use core::arch::asm;

#[inline]
pub fn read_sstatus() -> usize {
    let sstatus: usize;
    unsafe { asm!("csrr {}, sstatus", out(reg) sstatus) };
    sstatus
}

#[inline]
pub fn write_sstatus(sstatus: usize) {
    unsafe { asm!("csrw sstatus, {}", in(reg) sstatus) };
}

#[inline]
pub fn read_scause() -> usize {
    let scause: usize;
    unsafe { asm!("csrr {}, scause", out(reg) scause) };
    scause
}

#[inline]
pub fn read_sepc() -> usize {
    let sepc: usize;
    unsafe { asm!("csrr {}, sepc", out(reg) sepc) };
    sepc
}

#[inline]
pub fn write_sepc(sepc: usize) {
    unsafe { asm!("csrw sepc, {}", in(reg) sepc) };
}

#[inline]
pub fn read_stvec() -> usize {
    let stvec: usize;
    unsafe { asm!("csrr {}, stvec", out(reg) stvec) };
    stvec
}

#[inline]
pub fn write_stvec(stvec: usize) {
    unsafe { asm!("csrw stvec, {}", in(reg) stvec) };
}

#[inline]
pub fn read_sscratch() -> usize {
    let sscratch: usize;
    unsafe { asm!("csrr {}, sscratch", out(reg) sscratch) };
    sscratch
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

#[inline]
pub fn set_sie() {
    unsafe { asm!("csrs sstatus, 2") };
}

#[inline]
pub fn clear_sie() {
    unsafe { asm!("csrc sstatus, 2") };
}

pub const SSTATUS_SPP: usize = 1 << 8;
pub const SSTATUS_SPIE: usize = 1 << 5;
pub const SSTATUS_SIE: usize = 1 << 1;

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

#[inline]
pub fn write_satp(satp: usize) {
    unsafe {
        asm!("csrw satp, {}", in(reg) satp);
        asm!("sfence.vma");
    }
}
