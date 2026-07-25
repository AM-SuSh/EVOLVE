//! Lab6 initproc: runs the full lab6 user test chain from disk.
//!
//! Chain: file_test → link_test → mass_unlink_test → mmap_test → spawn_test →
//!        stride_test → fs_test → pipe_test

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, println};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let _ = exec("file_test");
    println("exec file_test failed");
    exit(-1);
}
