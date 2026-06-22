//! Trap context save/restore and context switch (lab2+).

#![no_std]

/// Trap context for lab2+ (field order matches trap.asm save layout).
#[derive(Clone, Copy)]
pub struct TrapContext {
    pub x: [usize; 32],
    pub sstatus: usize,
    pub sepc: usize,
    pub kernel_sp: usize,
}
