//! 【Lab4 任务：排错】父进程把 wait 结果与 exit_code 搞混了。
//! Lab4 debug variant: the parent confuses the wait result with the exit code.
//!
//! 【Lab4 任务：排错】`fork_test` 缺少 `fork_test pass`。
//! 先运行并记录 `waitpid` 返回值与 `exit_code`，区分「子进程 pid」和「退出码」。

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, fork, getpid, println, waitpid};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let pid = fork();
    if pid == 0 {
        println("I am child, pid=");
        user_lib::print_usize(getpid() as usize);
        println("");
        exit(0);
    }
    println("I am parent, child_pid=");
    user_lib::print_usize(pid as usize);
    println("");
    let mut exit_code: i32 = 0;
    let waited = waitpid(pid as isize, &mut exit_code);
    println("waited pid done, exit_code=");
    user_lib::print_usize(exit_code as usize);
    println("");
    // PLANTED BUG: a child that calls exit(0) must be checked against 0, not 1.
    if waited == pid && exit_code == 1 {
        println("fork_test pass");
    }
    exit(0);
}
