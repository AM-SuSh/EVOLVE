//! 【Lab7 任务：fill】`handle_pending` 中「默认动作 + 构造信号帧」的部分是 `todo!()`。
//! 请先阅读 `handle_pending` 上方的思路提示，再实现投递逻辑。
//! 验证：`make test-lab7`，应看到 `dup_test pass`、`signal_test pass`、
//! `signal_mask_test pass` 与 `pipe_test pass`。

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

/// 【Lab7 任务：fill】实现 `handle_pending` 中「默认动作 + 构造信号帧」部分。
///
/// 思路提示（先自己想清楚再动手）：
/// 1. `take_deliverable()` 已经从 pending 取走一个可交付信号（SIGKILL 可绕过 mask）；
/// 2. 默认动作：`SIGKILL` 恒致命；`is_fatal_default(signum)` 表示未注册处理函数时
///    `SIGINT` / `SIGKILL` 应终止进程，此时返回 `SignalOutcome::Kill(signum as i32)`；
/// 3. 未注册且非致命（如 `SIGUSR1` 没有 handler）时 `continue`，把它忽略掉；
/// 4. 注册了处理函数：先把当前 `TrapContext` 保存到 `pcb.saved_trap_cx`
///    （`sigreturn` 要恢复整帧），置 `pcb.in_signal_handler = true`，
///    把信号编号写进 `cx.x[10]`（用户态 `a0`），再把 `cx.sepc` 改成 handler 地址；
/// 5. 返回 `SignalOutcome::Continue`，让 trap 返回后从 handler 开始执行。
///
/// 想清楚：为什么保存的是整帧而不是只保存 `sepc`？若只改 `a0` 不改 `sepc`，
/// `signal_test` 会观察到什么现象？
pub fn handle_pending(cx: &mut TrapContext) -> SignalOutcome {
    with_current_pcb(|pcb| {
        if pcb.in_signal_handler {
            return SignalOutcome::Continue;
        }
        loop {
            let Some(signum) = pcb.signal.take_deliverable() else {
                return SignalOutcome::Continue;
            };
            todo!("Lab7：实现默认动作与信号帧构造（见 handle_pending 上方思路提示）")
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
