//! Trap handling: entry dispatch, syscalls, timer preemption (lab2+).

use crate::println;
use core::arch::{asm, global_asm};

use os_context::TrapContext;
use os_syscall::{SYS_EXIT, SYS_WRITE, SYS_YIELD};

use crate::config::TICKS_PER_SEC;
use crate::riscv::{
    read_scause, set_next_timer, write_sepc, write_sscratch, write_stvec,     SCAUSE_SUPERVISOR_ECALL, SCAUSE_SUPERVISOR_TIMER,
    SCAUSE_USER_ECALL, SSTATUS_SPIE, SSTATUS_SPP,
};
use crate::task::{
    mark_current_suspended, run_next_task, sys_exit, sys_write,
};

global_asm!(include_str!("trap.asm"));

pub fn init() {
    unsafe extern "C" {
        fn __alltraps();
    }
    write_stvec(__alltraps as *const () as usize);
}

#[no_mangle]
pub fn trap_handler(cx: &mut TrapContext) {
    let scause = read_scause();
    match scause {
        SCAUSE_USER_ECALL | SCAUSE_SUPERVISOR_ECALL => {
            cx.sepc += 4;
            let syscall_id = cx.x[17];
            match syscall_id {
                SYS_WRITE => {
                    cx.x[10] = sys_write(cx.x[10], cx.x[11] as *const u8, cx.x[12]) as usize;
                }
                SYS_EXIT => {
                    sys_exit(cx.x[10] as i32);
                }
                SYS_YIELD => {
                    mark_current_suspended();
                    run_next_task();
                }
                _ => {
                    println!("Unsupported syscall {}.", syscall_id);
                    cx.x[10] = (-1isize) as usize;
                }
            }
        }
        SCAUSE_SUPERVISOR_TIMER => {
            set_next_timer(super::riscv::read_time() + super::config::CLOCK_FREQ / TICKS_PER_SEC);
            mark_current_suspended();
            run_next_task();
        }
        _ => {
            println!("Unhandled trap scause={:#x}, sepc={:#x}", scause, cx.sepc);
            os_sbi::shutdown();
        }
    }
}

fn trap_return(cx: &mut TrapContext) -> ! {
    let trap_cx_ptr = cx as *mut TrapContext as usize;
    let user_sp = cx.x[2];
    unsafe extern "C" {
        fn __restore();
    }
    unsafe {
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

pub fn trap_cx_init(entry: usize, sp: usize, kernel_sp: usize) -> TrapContext {
    let mut sstatus = super::riscv::read_sstatus();
    sstatus &= !SSTATUS_SPP;
    sstatus |= SSTATUS_SPIE;
    TrapContext {
        x: [0; 32],
        sstatus,
        sepc: entry,
        kernel_sp,
    }
    .with_user_sp(sp)
}

trait TrapContextExt {
    fn with_user_sp(self, sp: usize) -> Self;
}

impl TrapContextExt for TrapContext {
    fn with_user_sp(mut self, sp: usize) -> Self {
        self.x[2] = sp;
        self
    }
}

pub fn prepare_user_return(cx: &TrapContext) {
    write_sscratch(cx.kernel_sp);
    write_sepc(cx.sepc);
}

/// Called from task module when switching to first/next user task.
pub fn run_user_task(cx: &mut TrapContext) -> ! {
    prepare_user_return(cx);
    trap_return(cx);
}
