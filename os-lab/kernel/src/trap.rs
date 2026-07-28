//! Trap handling: entry dispatch, syscalls, timer preemption (lab2+).

use crate::println;

use os_context::{TrapContext, __alltraps};
#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6"))]
use os_context::restore_to_user_paged;
#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6")))]
use os_context::restore_to_user;
use os_syscall::{SYS_EXIT, SYS_WRITE, SYS_YIELD};
#[cfg(feature = "lab4")]
use os_syscall::{SYS_CLONE, SYS_EXECVE, SYS_GETPID, SYS_WAIT4};
#[cfg(any(feature = "lab5", feature = "lab6"))]
use os_syscall::{SYS_CLOSE, SYS_OPENAT, SYS_READ};
#[cfg(feature = "lab6")]
use os_syscall::{
    SYS_FSTAT, SYS_LINKAT, SYS_MMAP, SYS_MUNMAP, SYS_SET_PRIORITY, SYS_SPAWN, SYS_UNLINKAT,
};
#[cfg(feature = "lab7")]
use os_syscall::{
    SYS_DUP, SYS_KILL, SYS_SIGACTION, SYS_SIGPROCMASK, SYS_SIGRETURN,
};
#[cfg(feature = "lab8")]
use os_syscall::{
    SYS_CONDVAR_CREATE, SYS_CONDVAR_SIGNAL, SYS_CONDVAR_WAIT, SYS_ENABLE_DEADLOCK_DETECT,
    SYS_GETTID, SYS_MUTEX_CREATE, SYS_MUTEX_LOCK, SYS_MUTEX_UNLOCK, SYS_SEMAPHORE_CREATE,
    SYS_SEMAPHORE_DOWN, SYS_SEMAPHORE_UP, SYS_THREAD_CREATE, SYS_WAITTID,
};

#[cfg(any(feature = "lab5", feature = "lab6"))]
use crate::config::SYS_PIPE;
#[cfg(any(feature = "lab5", feature = "lab6"))]
use crate::fs;
#[cfg(any(feature = "lab5", feature = "lab6"))]
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
#[cfg(feature = "lab7")]
use crate::process::current_in_signal_handler;
#[cfg(feature = "lab6")]
use crate::process::{sys_set_priority, sys_spawn};
#[cfg(feature = "lab6")]
use crate::mm::{sys_mmap, sys_munmap};
#[cfg(feature = "lab7")]
use crate::signal::{self, SignalOutcome};
#[cfg(feature = "lab8")]
use crate::processor;
#[cfg(feature = "lab8")]
use crate::sync_syscall;
#[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3")))]
use crate::task::{mark_current_suspended, run_next_task, sync_current_trap_cx, sys_exit, sys_write};

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
use crate::mm::{activate_current_user, activate_kernel, user_token};

#[cfg(feature = "lab7")]
fn try_deliver_signals(cx: &mut TrapContext) {
    if let SignalOutcome::Kill(code) = signal::handle_pending(cx) {
        sys_exit(code);
    }
}

#[cfg(feature = "lab7")]
fn yield_and_schedule(cx: &mut TrapContext) {
    try_deliver_signals(cx);
    sync_current_trap_cx(cx);
    if current_in_signal_handler() {
        return;
    }
    #[cfg(feature = "lab4")]
    mark_current_ready();
    #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3")))]
    mark_current_suspended();
    #[cfg(feature = "lab4")]
    run_next_process();
    #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3")))]
    run_next_task();
}

#[cfg(feature = "lab8")]
fn finish_sync_syscall(ret: isize, cx: &mut TrapContext, thread_slot: usize) {
    if ret == -1 {
        sync_syscall::finish_blocking_syscall(ret, cx, thread_slot);
    }
}

#[cfg(feature = "lab8")]
fn finish_condvar_wait(ret: isize, cx: &mut TrapContext, thread_slot: usize) {
    if ret == -1 {
        finish_sync_syscall(ret, cx, thread_slot);
    }
}

pub fn init() {
    write_stvec(__alltraps as *const () as usize);
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6"))]
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
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
    activate_kernel();

    let scause = read_scause();
    #[cfg(all(
        feature = "trace-edu",
        feature = "lab2",
        not(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))
    ))]
    {
        let cause = match scause {
            SCAUSE_USER_ECALL => "user_ecall",
            SCAUSE_SUPERVISOR_ECALL => "supervisor_ecall",
            SCAUSE_SUPERVISOR_TIMER => "supervisor_timer",
            _ => "other",
        };
        crate::trace::trap_enter(crate::task::current_task_id(), cause);
    }
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
                    #[cfg(feature = "lab7")]
                    yield_and_schedule(cx);
                    #[cfg(not(feature = "lab7"))]
                    {
                        sync_current_trap_cx(cx);
                        #[cfg(feature = "lab4")]
                        mark_current_ready();
                        #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3")))]
                        mark_current_suspended();
                        #[cfg(feature = "lab4")]
                        run_next_process();
                        #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3")))]
                        run_next_task();
                    }
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
                #[cfg(any(feature = "lab5", feature = "lab6"))]
                SYS_OPENAT => {
                    let ret = fs::sys_openat(
                        cx.syscall_arg(0) as *const u8,
                        cx.syscall_arg(1),
                        cx.syscall_arg(2),
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(any(feature = "lab5", feature = "lab6"))]
                SYS_READ => {
                    let ret = fs::sys_read(
                        cx.syscall_arg(0),
                        cx.syscall_arg(1) as *mut u8,
                        cx.syscall_arg(2),
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(any(feature = "lab5", feature = "lab6"))]
                SYS_CLOSE => {
                    let ret = fs::sys_close(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                }
                #[cfg(any(feature = "lab5", feature = "lab6"))]
                id if id == SYS_PIPE => {
                    let ret = sync::sys_pipe(cx.syscall_arg(0) as *mut i32);
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab6")]
                SYS_LINKAT => {
                    let ret = fs::sys_linkat(
                        cx.syscall_arg(1) as *const u8,
                        cx.syscall_arg(3) as *const u8,
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab6")]
                SYS_UNLINKAT => {
                    let ret = fs::sys_unlinkat(cx.syscall_arg(1) as *const u8);
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab6")]
                SYS_FSTAT => {
                    let ret = fs::sys_fstat(
                        cx.syscall_arg(0),
                        cx.syscall_arg(1) as *mut os_syscall::Stat,
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab6")]
                SYS_SPAWN => {
                    let ret = sys_spawn(cx.syscall_arg(0) as *const u8, cx.syscall_arg(1));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab6")]
                SYS_SET_PRIORITY => {
                    let ret = sys_set_priority(cx.syscall_arg(0) as isize);
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab6")]
                SYS_MMAP => {
                    let ret = sys_mmap(
                        cx.syscall_arg(0),
                        cx.syscall_arg(1),
                        cx.syscall_arg(2) as isize,
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab6")]
                SYS_MUNMAP => {
                    let ret = sys_munmap(cx.syscall_arg(0), cx.syscall_arg(1));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab7")]
                SYS_DUP => {
                    let ret = fs::sys_dup(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab7")]
                SYS_KILL => {
                    let ret = signal::sys_kill(
                        cx.syscall_arg(0) as isize,
                        cx.syscall_arg(1) as u8,
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab7")]
                SYS_SIGACTION => {
                    let ret = signal::sys_sigaction(
                        cx.syscall_arg(0),
                        cx.syscall_arg(1) as *const os_syscall::SignalAction,
                        cx.syscall_arg(2) as *mut os_syscall::SignalAction,
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab7")]
                SYS_SIGPROCMASK => {
                    let ret = signal::sys_sigprocmask(cx.syscall_arg(0) as u32);
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab7")]
                SYS_SIGRETURN => {
                    let ret = signal::sys_sigreturn(cx);
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_THREAD_CREATE => {
                    let ret = processor::sys_thread_create(
                        cx.syscall_arg(0),
                        cx.syscall_arg(1),
                    );
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_GETTID => {
                    cx.set_return_value(processor::sys_gettid());
                }
                #[cfg(feature = "lab8")]
                SYS_WAITTID => {
                    let ret = processor::sys_waittid(cx, cx.syscall_arg(0));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_MUTEX_CREATE => {
                    let ret = sync_syscall::sys_mutex_create(cx.syscall_arg(0) != 0);
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_MUTEX_LOCK => {
                    let thread_slot = processor::current_thread_slot();
                    let ret = sync_syscall::sys_mutex_lock(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                    finish_sync_syscall(ret, cx, thread_slot);
                }
                #[cfg(feature = "lab8")]
                SYS_MUTEX_UNLOCK => {
                    let ret = sync_syscall::sys_mutex_unlock(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_SEMAPHORE_CREATE => {
                    let ret = sync_syscall::sys_semaphore_create(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_SEMAPHORE_UP => {
                    let ret = sync_syscall::sys_semaphore_up(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_SEMAPHORE_DOWN => {
                    let thread_slot = processor::current_thread_slot();
                    let ret = sync_syscall::sys_semaphore_down(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                    finish_sync_syscall(ret, cx, thread_slot);
                }
                #[cfg(feature = "lab8")]
                SYS_CONDVAR_CREATE => {
                    let ret = sync_syscall::sys_condvar_create();
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_CONDVAR_SIGNAL => {
                    let ret = sync_syscall::sys_condvar_signal(cx.syscall_arg(0));
                    cx.set_return_value(ret);
                }
                #[cfg(feature = "lab8")]
                SYS_CONDVAR_WAIT => {
                    let thread_slot = processor::current_thread_slot();
                    let ret =
                        sync_syscall::sys_condvar_wait(cx.syscall_arg(0), cx.syscall_arg(1));
                    cx.set_return_value(ret);
                    finish_condvar_wait(ret, cx, thread_slot);
                }
                #[cfg(feature = "lab8")]
                SYS_ENABLE_DEADLOCK_DETECT => {
                    let ret = sync_syscall::sys_enable_deadlock_detect(cx.syscall_arg(0) as i32);
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
            #[cfg(feature = "lab8")]
            {
                sync_current_trap_cx(cx);
                processor::mark_current_ready();
                processor::run_next_thread();
            }
            #[cfg(not(feature = "lab8"))]
            {
                sync_current_trap_cx(cx);
                #[cfg(feature = "lab4")]
                mark_current_ready();
                #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3", feature = "lab5", feature = "lab6")))]
                mark_current_suspended();
                #[cfg(feature = "lab4")]
                run_next_process();
                #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3", feature = "lab5", feature = "lab6")))]
                run_next_task();
            }
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

    #[cfg(feature = "lab7")]
    {
        if let SignalOutcome::Kill(code) = signal::handle_pending(cx) {
            sys_exit(code);
        }
    }

    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
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
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
    {
        activate_kernel();
        let kernel_sp = cx.kernel_sp;
        #[cfg(feature = "lab4")]
        let satp = user_token(crate::process::current_space_id());
        #[cfg(all(not(feature = "lab4"), feature = "lab3"))]
        let satp = user_token(crate::task::current_app_id());
        prepare_user_return(cx);
        unsafe { restore_to_user_paged(cx, kernel_sp, satp) }
    }
    #[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6")))]
    {
        let kernel_sp = cx.kernel_sp;
        let user_sp = cx.user_sp();
        prepare_user_return(cx);
        unsafe { restore_to_user(cx, kernel_sp, user_sp) }
    }
}

