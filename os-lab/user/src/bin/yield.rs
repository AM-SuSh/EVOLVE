#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, println, yield_};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    println("Yield test start");
    for _ in 0..5 {
        println("Yield round");
        yield_();
    }
    exit(0);
}
