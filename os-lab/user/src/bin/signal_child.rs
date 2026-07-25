//! Lab7 child: wait for SIGUSR1 via registered handler.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, open, println, sigaction, sigreturn, yield_, SignalAction, SIGUSR1};

global_asm!(include_str!("../entry.asm"));

static mut GOT_SIG: bool = false;

#[no_mangle]
extern "C" fn on_sigusr1(_signum: usize) {
    unsafe {
        GOT_SIG = true;
    }
    let _ = sigreturn();
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

    for _ in 0..1000 {
        unsafe {
            if GOT_SIG {
                println("signal_child ready");
                exit(0);
            }
        }
        let _ = yield_();
    }
    println("signal_child timeout");
    exit(-1);
}
