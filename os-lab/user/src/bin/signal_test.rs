//! Lab7: spawn child, send SIGUSR1, verify handler ran.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, kill, println, spawn, waitpid, yield_, SIGUSR1};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let child = spawn("signal_child");
    if child < 0 {
        println("spawn signal_child failed");
        exit(-1);
    }
    for _ in 0..30 {
        let _ = yield_();
    }
    if kill(child, SIGUSR1) != 0 {
        println("kill failed");
        exit(-1);
    }
    let mut code = 0i32;
    let _ = waitpid(child, &mut code);
    if code != 0 {
        println("signal child exit bad");
        exit(-1);
    }
    println("signal_test pass");
    let _ = exec("signal_mask_test");
    println("exec signal_mask_test failed");
    exit(-1);
}
