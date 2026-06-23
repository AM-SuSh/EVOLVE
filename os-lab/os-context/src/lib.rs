//! Trap context save/restore and user return helpers (lab2+).
//!
//! `TrapContext` layout matches [`trap.asm`](trap.asm): 32 GPRs, then
//! `sstatus`, `sepc`, `kernel_sp` (35 × 8 bytes).

#![no_std]

/// Total size of a saved trap context on the kernel stack.
pub const TRAP_CONTEXT_SIZE: usize = 35 * 8;

/// General-purpose register indices in `TrapContext::x`.
pub const REG_SP: usize = 2;
pub const REG_A0: usize = 10;
pub const REG_A7: usize = 17;

/// `sstatus` bits for returning to user mode.
pub const SSTATUS_SPP: usize = 1 << 8;
pub const SSTATUS_SPIE: usize = 1 << 5;
pub const SSTATUS_SUM: usize = 1 << 18;

const _: () = assert!(core::mem::size_of::<TrapContext>() == TRAP_CONTEXT_SIZE);

/// Trap context (field order matches trap.asm save layout).
#[derive(Clone, Copy)]
pub struct TrapContext {
    pub x: [usize; 32],
    pub sstatus: usize,
    pub sepc: usize,
    pub kernel_sp: usize,
}

impl TrapContext {
    /// Prepare `sstatus` for first entry to user mode.
    pub fn user_sstatus(mut sstatus: usize) -> usize {
        sstatus &= !SSTATUS_SPP;
        sstatus |= SSTATUS_SPIE | SSTATUS_SUM;
        sstatus
    }

    /// Build an initial trap context for a user task.
    pub fn init_user(entry: usize, user_sp: usize, kernel_sp: usize, sstatus: usize) -> Self {
        let mut cx = Self {
            x: [0; 32],
            sstatus: Self::user_sstatus(sstatus),
            sepc: entry,
            kernel_sp,
        };
        cx.set_user_sp(user_sp);
        cx
    }

    pub fn user_sp(&self) -> usize {
        self.x[REG_SP]
    }

    pub fn set_user_sp(&mut self, sp: usize) {
        self.x[REG_SP] = sp;
    }

    pub fn syscall_id(&self) -> usize {
        self.x[REG_A7]
    }

    pub fn syscall_arg(&self, n: usize) -> usize {
        self.x[10 + n]
    }

    pub fn set_return_value(&mut self, val: isize) {
        self.x[REG_A0] = val as usize;
    }

    pub fn advance_sepc(&mut self) {
        self.sepc = self.sepc.wrapping_add(4);
    }
}

#[cfg(target_arch = "riscv64")]
mod riscv {
    use super::TrapContext;
    use core::arch::{asm, global_asm};

    global_asm!(include_str!("trap.asm"));

    // Trap entry; set `stvec` to `__alltraps`.
    unsafe extern "C" {
        pub fn __alltraps();
        pub fn __restore();
    }

    /// Restore user registers and `sret` into user mode.
    pub unsafe fn restore_to_user(cx: *mut TrapContext) -> ! {
        let trap_cx_ptr = cx as usize;
        let user_sp = (*cx).user_sp();
        asm!(
            "fence.i",
            "mv sp, {trap_cx_ptr}",
            "ld t0, 32*8(sp)",
            "ld t1, 33*8(sp)",
            "ld t2, 34*8(sp)",
            "csrw sstatus, t0",
            "csrw sepc, t1",
            "csrw sscratch, t2",
            "ld x1, 1*8(sp)",
            "ld x2, 2*8(sp)",
            "ld x3, 3*8(sp)",
            "ld x4, 4*8(sp)",
            "ld x5, 5*8(sp)",
            "ld x6, 6*8(sp)",
            "ld x7, 7*8(sp)",
            "ld x8, 8*8(sp)",
            "ld x9, 9*8(sp)",
            "ld x10, 10*8(sp)",
            "ld x11, 11*8(sp)",
            "ld x12, 12*8(sp)",
            "ld x13, 13*8(sp)",
            "ld x14, 14*8(sp)",
            "ld x15, 15*8(sp)",
            "ld x16, 16*8(sp)",
            "ld x17, 17*8(sp)",
            "ld x18, 18*8(sp)",
            "ld x19, 19*8(sp)",
            "ld x20, 20*8(sp)",
            "ld x21, 21*8(sp)",
            "ld x22, 22*8(sp)",
            "ld x23, 23*8(sp)",
            "ld x24, 24*8(sp)",
            "ld x25, 25*8(sp)",
            "ld x26, 26*8(sp)",
            "ld x27, 27*8(sp)",
            "ld x28, 28*8(sp)",
            "ld x29, 29*8(sp)",
            "ld x30, 30*8(sp)",
            "ld x31, 31*8(sp)",
            "mv sp, {user_sp}",
            "sret",
            trap_cx_ptr = in(reg) trap_cx_ptr,
            user_sp = in(reg) user_sp,
            options(noreturn)
        );
    }
}

#[cfg(target_arch = "riscv64")]
pub use riscv::{__alltraps, restore_to_user};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trap_context_size() {
        assert_eq!(core::mem::size_of::<TrapContext>(), TRAP_CONTEXT_SIZE);
    }

    #[test]
    fn init_user_sets_fields() {
        let cx = TrapContext::init_user(0x8040_0000, 0x803F_F000, 0x8020_1000, 0);
        assert_eq!(cx.sepc, 0x8040_0000);
        assert_eq!(cx.user_sp(), 0x803F_F000);
        assert_eq!(cx.kernel_sp, 0x8020_1000);
        assert_eq!(cx.sstatus & SSTATUS_SPP, 0);
        assert_ne!(cx.sstatus & SSTATUS_SPIE, 0);
    }

    #[test]
    fn advance_sepc_and_return_value() {
        let mut cx = TrapContext::init_user(0, 0, 0, 0);
        cx.sepc = 0x1000;
        cx.advance_sepc();
        assert_eq!(cx.sepc, 0x1004);
        cx.set_return_value(42);
        assert_eq!(cx.x[REG_A0], 42);
        cx.set_return_value(-1);
        assert_eq!(cx.x[REG_A0], (-1isize) as usize);
    }
}
