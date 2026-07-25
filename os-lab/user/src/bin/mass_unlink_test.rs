//! Lab6 exercise regression: mass create + unlink without deadlock.
//!
//! Pass criteria:
//! - create/open/unlink several files in a loop
//! - prints `mass open/unlink OK!`
//! - chains into `mmap_test`

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    close, exec, exit, openat, println, unlinkat, O_CREATE, O_TRUNC, O_WRONLY,
};

global_asm!(include_str!("../entry.asm"));

const NAMES: [&str; 8] = [
    "mass0", "mass1", "mass2", "mass3", "mass4", "mass5", "mass6", "mass7",
];

#[no_mangle]
pub fn main() -> ! {
    for name in NAMES {
        let fd = openat(name, O_CREATE | O_WRONLY | O_TRUNC);
        if fd < 0 {
            println("mass create failed");
            exit(-1);
        }
        let _ = close(fd as usize);
    }

    for name in NAMES {
        if unlinkat(name) != 0 {
            println("mass unlink failed");
            exit(-1);
        }
    }

    println("mass open/unlink OK!");
    let _ = exec("mmap_test");
    println("exec mmap_test failed");
    exit(-1);
}
