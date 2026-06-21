//! Trap context save/restore and context switch (lab2+).

#![no_std]

/// Trap context placeholder for lab2+ implementation.
#[derive(Clone, Copy)]
pub struct TrapContext {
    pub x: [usize; 32],
    pub sepc: usize,
    pub sstatus: usize,
    pub kernel_sp: usize,
}
