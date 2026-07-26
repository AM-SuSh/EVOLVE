//! Lab6 prerequisite: set_priority syscall (stride scheduling API).
//!
//! Pass criteria:
//! - valid priority accepted, too-low priority rejected
//! - prints `stride_test pass`
//! - chains into `fs_test` (lab5 regression)

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, println, set_priority};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    if set_priority(16) != 16 {
        println("set_priority 16 failed");
        exit(-1);
    }
    if set_priority(1) != -1 {
        println("set_priority should reject prio<2");
        exit(-1);
    }

    println("stride_test pass");
    let _ = exec("fs_test");
    println("exec fs_test failed");
    exit(-1);
}
