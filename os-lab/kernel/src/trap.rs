//! Trap handling: entry dispatch, syscalls, timer preemption (lab2+).

use crate::println;

use os_context::{restore_to_user_paged, TrapContext, __alltraps};
#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
use os_context::restore_to_user;
use os_syscall::{
    SYS_CLONE, SYS_CLOSE, SYS_EXIT, SYS_EXECVE, SYS_GETPID, SYS_OPENAT, SYS_READ, SYS_WAIT4,
    SYS_WRITE, SYS_YIELD,
};

#[cfg(feature = "lab5")]
use crate::config::SYS_PIPE;
#[cfg(feature = "lab5")]
use crate::fs;
#[cfg(feature = "lab5")]
use crate::sync;

use crate::config::TICKS_PER_SEC;
use crate::riscv::{
    read_scause, read_sstatus, read_stval, set_next_timer, write_sepc, write_sscratch, write_stvec,
    SCAUSE_SUPERVISOR_ECALL, SCAUSE_SUPERVISOR_TIMER, SCAUSE_USER_ECALL,
};

#[cfg(feature = "lab4")]
use crate::process::{
    mark_current_ready, run_next_process, sync_current_trap_cx, sys_execve, sys_exit, sys_fork,
    sys_getpid, sys_wait4, sys_write,
};
#[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3", feature = "lab5")))]
use crate::task::{mark_current_suspended, run_next_task, sync_current_trap_cx, sys_exit, sys_write};

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
use crate::mm::{activate_current_user, activate_kernel, user_token};

pub fn init() {
    write_stvec(__alltraps as *const () as usize);
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
    {
        let sp: usize;
        unsafe {
            core::arch::asm!("mv {}, sp", out(reg) sp);
        }
        write_sscratch(sp);
    }
}

#[no_mangle]
pub fn trap_handler(cx: &mut TrapContext) {
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
    activate_kernel();

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
                    sync_current_trap_cx(cx);
                    #[cfg(feature = "lab4")]
                    mark_current_ready();
                    #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3", feature = "lab5")))]
                    mark_current_suspended();
                    #[cfg(feature = "lab4")]
                    run_next_process();
                    #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3", feature = "lab5")))]
                    run_next_task();
                }
                #[cfg(feature = "lab4")]
                SYS_GETPID => {
                    cx.set_return_value(sys_getpid());
                }
                #[cfg(feature = "lab4")]
                SYS_CLONE => {
                    let ret = sys_fork(cx);
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab4")]
                SYS_EXECVE => {
                    let ret = sys_execve(
                        cx,
                        cx.syscall_arg(0) as *const u8,
                        cx.syscall_arg(1),
                        cx.syscall_arg(2),
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab4")]
                SYS_WAIT4 => {
                    let ret = sys_wait4(
                        cx,
                        cx.syscall_arg(0) as isize,
                        cx.syscall_arg(1) as *mut i32,
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab5")]
                SYS_OPENAT => {
                    let ret = fs::sys_openat(
                        cx.syscall_arg(0) as *const u8,
                        cx.syscall_arg(1),
                        cx.syscall_arg(2),
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab5")]
                SYS_READ => {
                    let ret = fs::sys_read(
                        cx.syscall_arg(0),
                        cx.syscall_arg(1) as *mut u8,
                        cx.syscall_arg(2),
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab5")]
                SYS_CLOSE => {
                    let ret = fs::sys_close(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab5")]
                id if id == SYS_PIPE => {
                    let ret = sync::sys_pipe(cx.syscall_arg(0) as *mut i32);
                    cx.set_return_value(ret);
                }
                id => {
                    println!("Unsupported syscall {}.", id);
                    cx.set_return_value(-1);
                }
            }
        }
        SCAUSE_SUPERVISOR_TIMER => {
            set_next_timer(super::riscv::read_time() + super::config::CLOCK_FREQ / TICKS_PER_SEC);
            sync_current_trap_cx(cx);
            #[cfg(feature = "lab4")]
            mark_current_ready();
            #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3", feature = "lab5")))]
            mark_current_suspended();
            #[cfg(feature = "lab4")]
            run_next_process();
            #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3", feature = "lab5")))]
            run_next_task();
        }
        _ => {
            println!(
                "Unhandled trap scause={:#x}, sepc={:#x}, stval={:#x}",
                scause,
                cx.sepc,
                read_stval()
            );
            os_sbi::shutdown();
        }
    }

    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
    activate_current_user();
}

pub fn trap_cx_init(entry: usize, sp: usize, kernel_sp: usize) -> TrapContext {
    TrapContext::init_user(entry, sp, kernel_sp, read_sstatus())
}

pub fn prepare_user_return(cx: &TrapContext) {
    write_sscratch(cx.kernel_sp);
    write_sepc(cx.sepc);
}

/// Called from task/process module when switching to first/next user task.
pub fn run_user_task(cx: &mut TrapContext) -> ! {
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
    {
        activate_kernel();
        let kernel_sp = cx.kernel_sp;
        #[cfg(feature = "lab4")]
        let satp = user_token(crate::process::current_space_id());
        #[cfg(all(not(feature = "lab4"), any(feature = "lab3", feature = "lab5")))]
        let satp = user_token(crate::task::current_app_id());
        prepare_user_return(cx);
        unsafe { restore_to_user_paged(cx, kernel_sp, satp) }
    }
    #[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
    {
        let kernel_sp = cx.kernel_sp;
        let user_sp = cx.user_sp();
        prepare_user_return(cx);
        unsafe { restore_to_user(cx, kernel_sp, user_sp) }
    }
}

