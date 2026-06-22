//! Trap handling: entry dispatch, syscalls, timer preemption (lab2+).

use crate::println;

use os_context::{restore_to_user, TrapContext, __alltraps};
use os_syscall::{SYS_EXIT, SYS_WRITE, SYS_YIELD};

use crate::config::TICKS_PER_SEC;
use crate::riscv::{
    read_scause, read_sstatus, set_next_timer, write_sepc, write_sscratch, write_stvec,
    SCAUSE_SUPERVISOR_ECALL, SCAUSE_SUPERVISOR_TIMER, SCAUSE_USER_ECALL,
};
use crate::task::{mark_current_suspended, run_next_task, sys_exit, sys_write};

pub fn init() {
    write_stvec(__alltraps as *const () as usize);
}

#[no_mangle]
pub fn trap_handler(cx: &mut TrapContext) {
    let scause = read_scause();
    match scause {
        SCAUSE_USER_ECALL | SCAUSE_SUPERVISOR_ECALL => {
            cx.advance_sepc();
            match cx.syscall_id() {
                SYS_WRITE => {
                    let ret = sys_write(
                        cx.syscall_arg(0),
                        cx.syscall_arg(1) as *const u8,
                        cx.syscall_arg(2),
                    );
                    cx.set_return_value(ret);
                }
                SYS_EXIT => {
                    sys_exit(cx.syscall_arg(0) as i32);
                }
                SYS_YIELD => {
                    mark_current_suspended();
                    run_next_task();
                }
                id => {
                    println!("Unsupported syscall {}.", id);
                    cx.set_return_value(-1);
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

pub fn trap_cx_init(entry: usize, sp: usize, kernel_sp: usize) -> TrapContext {
    TrapContext::init_user(entry, sp, kernel_sp, read_sstatus())
}

pub fn prepare_user_return(cx: &TrapContext) {
    write_sscratch(cx.kernel_sp);
    write_sepc(cx.sepc);
}

/// Called from task module when switching to first/next user task.
pub fn run_user_task(cx: &mut TrapContext) -> ! {
    prepare_user_return(cx);
    unsafe { restore_to_user(cx) }
}
