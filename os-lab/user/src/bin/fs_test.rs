//! Lab5 integration test: open/read embedded file via syscall.
//!
//! Pass criteria:
//! - `open("testfile")` succeeds
//! - `read` prints `Hello from testfile!`
//! - prints `fs_test pass`
//! - `exec("pipe_test")` chains into the pipe IPC test

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, exec, exit, open, println, read};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let fd = open("testfile");
    if fd < 0 {
        println("open testfile failed");
        exit(-1);
    }
    let mut buf = [0u8; 64];
    let n = read(fd as usize, &mut buf);
    if n <= 0 {
        println("read testfile failed");
        exit(-1);
    }
    if let Ok(s) = core::str::from_utf8(&buf[..n as usize]) {
        user_lib::print(s);
    }
    let _ = close(fd as usize);
    println("fs_test pass");
    let _ = exec("pipe_test");
    println("exec pipe_test failed");
    exit(-1);
}
