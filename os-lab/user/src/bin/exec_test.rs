//! Lab4 integration test: exec replaces the current program.
//!
//! Pass criteria: prints `Before exec`, then `Hello from user app!` from the loaded hello
//! program. `After exec` must **not** appear (exec resets TrapContext to hello's entry).
//! Not run as default initproc; see tests/README.md for optional spot-check.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, println};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    println("Before exec");
    exec("hello");
    println("After exec");
    exit(-1);
}
