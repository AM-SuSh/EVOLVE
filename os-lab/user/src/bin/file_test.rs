//! Lab6 base test: disk open/read/write via VirtIO + easy-fs.
//!
//! Pass criteria:
//! - read prebuilt `filea` from fs.img
//! - create `fileb` with CREATE|WRONLY|TRUNC, write, read back
//! - prints `file_test pass`
//! - chains into `link_test`

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    close, exec, exit, open, openat, println, read, write, O_CREATE, O_TRUNC, O_WRONLY,
};

global_asm!(include_str!("../entry.asm"));

const FILEA_CONTENT: &[u8] = b"Hello from filea!\n";
const FILEB_CONTENT: &[u8] = b"Hello, lab6 fileb!\n";

#[no_mangle]
pub fn main() -> ! {
    let fd = open("filea");
    if fd < 0 {
        println("open filea failed");
        exit(-1);
    }
    let mut buf = [0u8; 64];
    let n = read(fd as usize, &mut buf);
    if n != FILEA_CONTENT.len() as isize || &buf[..n as usize] != FILEA_CONTENT {
        println("read filea failed");
        exit(-1);
    }
    let _ = close(fd as usize);

    let fd = openat("fileb", O_CREATE | O_WRONLY | O_TRUNC);
    if fd < 0 {
        println("create fileb failed");
        exit(-1);
    }
    if write(fd as usize, FILEB_CONTENT) != FILEB_CONTENT.len() as isize {
        println("write fileb failed");
        exit(-1);
    }
    let _ = close(fd as usize);

    let fd = open("fileb");
    if fd < 0 {
        println("reopen fileb failed");
        exit(-1);
    }
    let mut buf2 = [0u8; 64];
    let n2 = read(fd as usize, &mut buf2);
    if n2 != FILEB_CONTENT.len() as isize || &buf2[..n2 as usize] != FILEB_CONTENT {
        println("read fileb failed");
        exit(-1);
    }
    let _ = close(fd as usize);

    println("file_test pass");
    let _ = exec("link_test");
    println("exec link_test failed");
    exit(-1);
}
