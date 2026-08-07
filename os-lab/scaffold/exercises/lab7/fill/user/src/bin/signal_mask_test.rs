//! 【Lab7 任务：补全】实现「屏蔽 → kill → 确认未交付 → 解除屏蔽 → 等到交付」协议。
//!
//! `sigaction` 已注册。请在 `run_mask_protocol` 中完成完整时序；成功返回 true。
//! 验证：`make test-lab7`，应看到 `signal_mask_test pass`。

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    exec, exit, getpid, kill, open, println, sigaction, sigprocmask, sigreturn, yield_,
    SignalAction, SIGUSR1,
};

global_asm!(include_str!("../entry.asm"));

static mut GOT_SIG: bool = false;

#[no_mangle]
extern "C" fn on_sigusr1(_signum: usize) {
    unsafe {
        GOT_SIG = true;
    }
    let _ = sigreturn();
}

/// 【Lab7 任务：补全】
///
/// 建议步骤：
/// 1. 构造并 `sigprocmask` 屏蔽 SIGUSR1；
/// 2. `kill(getpid(), SIGUSR1)`；
/// 3. 短暂 yield，期间若 GOT_SIG 已为 true 则失败；
/// 4. `sigprocmask(0)` 解除屏蔽；
/// 5. 继续 yield 直到 GOT_SIG 为 true，然后返回 true；超时返回 false。
fn run_mask_protocol() -> bool {
    todo!("Lab7: implement mask / kill / ensure-pending / unmask / wait-delivery")
}

#[no_mangle]
pub fn main() -> ! {
    let h0 = open("testfile");
    let h1 = open("testfile");
    if h0 < 0 || h1 < 0 {
        println("open placeholder failed");
        exit(-1);
    }

    let act = SignalAction {
        handler: on_sigusr1 as *const () as usize,
        mask: 0,
    };
    if sigaction(SIGUSR1 as usize, &act, core::ptr::null_mut()) != 0 {
        println("sigaction failed");
        exit(-1);
    }

    if !run_mask_protocol() {
        println("signal_mask_test timeout");
        exit(-1);
    }
    println("signal_mask_test pass");
    let _ = exec("pipe_test");
    println("exec pipe_test failed");
    exit(-1);
}
