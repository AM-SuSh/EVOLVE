//! Lab7 debug variant: SIGUSR1 is not actually included in the mask.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, getpid, kill, open, println, sigaction, sigprocmask, sigreturn, yield_, SignalAction, SIGUSR1};

global_asm!(include_str!("../entry.asm"));

static mut GOT_SIG: bool = false;

#[no_mangle]
extern "C" fn on_sigusr1(_signum: usize) {
    unsafe { GOT_SIG = true; }
    let _ = sigreturn();
}

#[no_mangle]
pub fn main() -> ! {
    let h0 = open("testfile");
    let h1 = open("testfile");
    if h0 < 0 || h1 < 0 { println("open placeholder failed"); exit(-1); }
    let act = SignalAction { handler: on_sigusr1 as *const () as usize, mask: 0 };
    if sigaction(SIGUSR1 as usize, &act, core::ptr::null_mut()) != 0 {
        println("sigaction failed"); exit(-1);
    }
    // PLANTED BUG: zero masks no signals; SIGUSR1 requires its corresponding bit.
    let mask = 0u32;
    let _ = sigprocmask(mask);
    if kill(getpid(), SIGUSR1) != 0 { println("kill failed"); exit(-1); }
    for _ in 0..20 {
        unsafe {
            if GOT_SIG { println("signal delivered while masked"); exit(-1); }
        }
        let _ = yield_();
    }
    let _ = sigprocmask(0);
    for _ in 0..500 {
        unsafe {
            if GOT_SIG {
                println("signal_mask_test pass");
                let _ = exec("pipe_test");
                println("exec pipe_test failed");
                exit(-1);
            }
        }
        let _ = yield_();
    }
    println("signal_mask_test timeout");
    exit(-1);
}
