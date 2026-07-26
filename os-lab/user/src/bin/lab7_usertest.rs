//! Lab7 initproc: dup + signal tests, then lab6 pipe regression.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, println};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let _ = exec("dup_test");
    println("exec dup_test failed");
    exit(-1);
}
