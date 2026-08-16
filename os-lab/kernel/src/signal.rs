//! Signal syscalls and trap-return delivery (lab7+).

use os_context::TrapContext;
use os_signal::{MAX_SIG, SIGKILL};
use os_syscall::SignalAction;

use crate::mm;
use crate::process::{find_slot_by_pid, with_current_pcb, with_pcb_slot};

pub enum SignalOutcome {
    Continue,
    Kill(i32),
}

pub fn sys_kill(pid: isize, signum: u8) -> isize {
    if pid <= 0 || signum == 0 || signum as usize > MAX_SIG {
        return -1;
    }
    let Some(slot) = find_slot_by_pid(pid as usize) else {
        return -1;
    };
    with_pcb_slot(slot, |pcb| pcb.signal.receive(signum));
    0
}

pub fn sys_sigaction(
    signum: usize,
    action: *const SignalAction,
    old_action: *mut SignalAction,
) -> isize {
    if signum == 0 || signum > MAX_SIG {
        return -1;
    }
    with_current_pcb(|pcb| {
        if !old_action.is_null() {
            let old = SignalAction {
                handler: pcb.signal.handler(signum as u8),
                mask: pcb.signal.mask(),
            };
            if !write_user_action(old_action, old) {
                return -1;
            }
        }
        if !action.is_null() {
            let act = match read_user_action(action) {
                Some(a) => a,
                None => return -1,
            };
            // 教学边界：`sigaction` 的 `act.mask`（handler 执行期间的临时掩码）
            // 未实现，此处只应用 handler；进程级掩码统一由 sigprocmask 管理。
            pcb.signal.set_handler(signum, act.handler);
        }
        0
    })
}

pub fn sys_sigprocmask(mask: u32) -> isize {
    with_current_pcb(|pcb| pcb.signal.set_mask(mask) as isize)
}

pub fn sys_sigreturn(cx: &mut TrapContext) -> isize {
    with_current_pcb(|pcb| {
        if let Some(saved) = pcb.saved_trap_cx.take() {
            *cx = saved;
            pcb.in_signal_handler = false;
            0
        } else {
            -1
        }
    })
}

/// Deliver one pending signal before returning to user mode.
pub fn handle_pending(cx: &mut TrapContext) -> SignalOutcome {
    with_current_pcb(|pcb| {
        if pcb.in_signal_handler {
            return SignalOutcome::Continue;
        }
        loop {
            let Some(signum) = pcb.signal.take_deliverable() else {
                return SignalOutcome::Continue;
            };
            if signum == SIGKILL {
                return SignalOutcome::Kill(signum as i32);
            }
            if pcb.signal.is_fatal_default(signum) {
                return SignalOutcome::Kill(signum as i32);
            }
            let handler = pcb.signal.handler(signum);
            if handler == 0 {
                continue;
            }
            pcb.saved_trap_cx = Some(*cx);
            pcb.in_signal_handler = true;
            cx.x[10] = signum as usize;
            cx.sepc = handler;
            return SignalOutcome::Continue;
        }
    })
}

fn read_user_action(ptr: *const SignalAction) -> Option<SignalAction> {
    mm::activate_current_user();
    let action = unsafe { core::ptr::read_volatile(ptr) };
    mm::activate_kernel();
    Some(action)
}

fn write_user_action(ptr: *mut SignalAction, action: SignalAction) -> bool {
    mm::activate_current_user();
    unsafe {
        core::ptr::write_volatile(ptr, action);
    }
    mm::activate_kernel();
    true
}
