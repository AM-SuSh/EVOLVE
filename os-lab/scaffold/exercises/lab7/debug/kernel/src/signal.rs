//! 【Lab7 任务：debug】`signal_test` / `signal_mask_test` 一直等不到处理函数。
//!
//! 现象：运行 `make test-lab7` 时，`dup_test pass` 后出现
//! `signal_child timeout` 与 `signal child exit bad`，随后是
//! `signal_mask_test timeout`；缺少 `signal_test pass` 与 `signal_mask_test pass`。
//!
//! 按「现象 → 假设 → 最小实验 → 证据 → 结论」排查：
//! 1. 先复现，确认失败停在「等信号」而不是 dup / 管道；
//! 2. 假设：`kill` 置位后，pending 是否被取走？handler 是否真的执行过？
//! 3. 沿 `sys_kill` → `SignalState::receive` → `handle_pending` 核对：
//!    信号帧保存了什么、`a0` 写入了什么、返回用户态后 CPU 从哪条指令继续；
//! 4. 修复后应看到 `signal_test pass` / `signal_mask_test pass` / `pipe_test pass`，
//!    并把排错过程写进实验报告。

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
///
/// 排查提示：
/// - `take_deliverable()` 会从 pending 中**消费**信号；若信号帧构造不完整，
///   该信号不会再次出现；
/// - 用户态 handler 能收到信号编号靠 `a0`，能否跳转靠 `sepc`；
/// - 若只看到 `a0` 被改、`sepc` 没变，返回用户态后仍会执行 syscall 的下一条指令，
///   于是 `signal_child` 永远等不到 `GOT_SIG`。
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
            // PLANTED BUG: 没有把 sepc 改为 handler；返回用户态后仍执行 syscall 的下一条指令。
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
