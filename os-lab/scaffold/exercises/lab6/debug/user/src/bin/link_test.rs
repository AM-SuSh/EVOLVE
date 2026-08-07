//! 【Lab6 任务：排错】link 后的 nlink 仍按链接前的值检查。
//! Lab6 debug variant: link count is checked against the pre-link value.
//!
//! 【Lab6 任务：排错】`linkat` 后 `fstat` 报 `nlink mismatch`。
//! 先确认两个目录项是否共享同一 inode，再修正硬链接计数预期。

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, exec, exit, fstat, linkat, openat, println, unlinkat, O_CREATE, O_RDONLY, O_TRUNC, O_WRONLY, Stat};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let fd = openat("file0", O_CREATE | O_WRONLY | O_TRUNC);
    if fd < 0 { println("create file0 failed"); exit(-1); }
    let _ = close(fd as usize);
    if linkat("file0", "file0_link") != 0 { println("linkat failed"); exit(-1); }
    let fd0 = openat("file0", O_RDONLY);
    let fd1 = openat("file0_link", O_RDONLY);
    if fd0 < 0 || fd1 < 0 { println("open linked files failed"); exit(-1); }
    let mut st0 = Stat::new();
    let mut st1 = Stat::new();
    if fstat(fd0 as usize, &mut st0) != 0 || fstat(fd1 as usize, &mut st1) != 0 {
        println("fstat failed"); exit(-1);
    }
    // PLANTED BUG: after linkat both names contribute to nlink, so the value is 2.
    if st0.ino != st1.ino || st0.nlink != 1 || st1.nlink != 1 {
        println("fstat nlink mismatch"); exit(-1);
    }
    let _ = close(fd0 as usize);
    let _ = close(fd1 as usize);
    if unlinkat("file0_link") != 0 { println("unlinkat link failed"); exit(-1); }
    let fd0 = openat("file0", O_RDONLY);
    if fd0 < 0 { println("reopen file0 failed"); exit(-1); }
    let mut st0 = Stat::new();
    if fstat(fd0 as usize, &mut st0) != 0 || st0.nlink != 1 {
        println("fstat after unlink failed"); exit(-1);
    }
    let _ = close(fd0 as usize);
    if unlinkat("file0") != 0 { println("unlinkat file0 failed"); exit(-1); }
    println("Test link OK!");
    let _ = exec("mass_unlink_test");
    println("exec mass_unlink_test failed");
    exit(-1);
}
