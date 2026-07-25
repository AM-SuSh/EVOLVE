//! Lab8 initproc: thread/sync/deadlock chain, then lab7 pipe regression.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, println};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let _ = exec("threads_test");
    println("exec threads_test failed");
    exit(-1);
}
