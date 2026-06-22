#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, println};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    println("Hello from user app!");
    exit(0);
}
