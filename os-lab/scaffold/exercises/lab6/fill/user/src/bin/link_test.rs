//! 【Lab6 任务：补全】实现硬链接元数据校验函数。
//!
//! 流程已写好：创建文件 → 记录链接前 nlink → linkat → 校验 → unlink 别名 → 再校验。
//! 你需要实现两个判定函数，不能只猜常数，而要使用「链接前 nlink」推算期望值。
//!
//! 验证：`make test-lab6`，应看到 `Test link OK!`。

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    close, exec, exit, fstat, linkat, openat, println, unlinkat, O_CREATE, O_RDONLY, O_TRUNC,
    O_WRONLY, Stat,
};

global_asm!(include_str!("../entry.asm"));

/// linkat 成功后：两个路径应指向同一 inode，且 nlink 都等于「链接前 + 1」。
fn check_after_link(a: &Stat, b: &Stat, nlink_before: u32) -> bool {
    todo!("Lab6: same ino, and both nlink == nlink_before + 1")
}

/// unlink 掉别名后：原路径仍可打开，nlink 应回到链接前的值。
fn check_after_unlink_alias(st: &Stat, nlink_before: u32) -> bool {
    todo!("Lab6: nlink == nlink_before")
}

#[no_mangle]
pub fn main() -> ! {
    let fd = openat("file0", O_CREATE | O_WRONLY | O_TRUNC);
    if fd < 0 {
        println("create file0 failed");
        exit(-1);
    }
    let _ = close(fd as usize);

    let fd0 = openat("file0", O_RDONLY);
    if fd0 < 0 {
        println("open file0 before link failed");
        exit(-1);
    }
    let mut before = Stat::new();
    if fstat(fd0 as usize, &mut before) != 0 {
        println("fstat before link failed");
        exit(-1);
    }
    let nlink_before = before.nlink;
    let _ = close(fd0 as usize);

    if linkat("file0", "file0_link") != 0 {
        println("linkat failed");
        exit(-1);
    }

    let fd0 = openat("file0", O_RDONLY);
    let fd1 = openat("file0_link", O_RDONLY);
    if fd0 < 0 || fd1 < 0 {
        println("open linked files failed");
        exit(-1);
    }

    let mut st0 = Stat::new();
    let mut st1 = Stat::new();
    if fstat(fd0 as usize, &mut st0) != 0 || fstat(fd1 as usize, &mut st1) != 0 {
        println("fstat failed");
        exit(-1);
    }
    if !check_after_link(&st0, &st1, nlink_before) {
        println("fstat nlink mismatch");
        exit(-1);
    }
    let _ = close(fd0 as usize);
    let _ = close(fd1 as usize);

    if unlinkat("file0_link") != 0 {
        println("unlinkat link failed");
        exit(-1);
    }
    let fd0 = openat("file0", O_RDONLY);
    if fd0 < 0 {
        println("reopen file0 failed");
        exit(-1);
    }
    let mut st0 = Stat::new();
    if fstat(fd0 as usize, &mut st0) != 0 || !check_after_unlink_alias(&st0, nlink_before) {
        println("fstat after unlink failed");
        exit(-1);
    }
    let _ = close(fd0 as usize);
    if unlinkat("file0") != 0 {
        println("unlinkat file0 failed");
        exit(-1);
    }
    println("Test link OK!");
    let _ = exec("mass_unlink_test");
    println("exec mass_unlink_test failed");
    exit(-1);
}
