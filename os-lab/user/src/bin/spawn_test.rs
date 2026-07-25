//! Lab6 prerequisite: spawn ELF from disk fs.img.
//!
//! Pass criteria:
//! - spawn `hello` child from disk image
//! - wait for child exit
//! - prints `spawn_test pass`
//! - chains into `stride_test`

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, println, spawn, waitpid};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let pid = spawn("hello");
    if pid <= 0 {
        println("spawn hello failed");
        exit(-1);
    }
    let mut code = 0i32;
    if waitpid(pid, &mut code) < 0 {
        println("waitpid spawn child failed");
        exit(-1);
    }
    if code != 0 {
        println("spawn child bad exit");
        exit(-1);
    }

    println("spawn_test pass");
    let _ = exec("stride_test");
    println("exec stride_test failed");
    exit(-1);
}
