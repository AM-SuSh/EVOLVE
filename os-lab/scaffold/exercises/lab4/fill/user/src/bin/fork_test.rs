//! 【Lab4 任务：补全】父进程 fork 两个孩子，并正确 wait 回收。
//!
//! 要求：
//! 1. 两次 `fork`，子进程分别 `exit(0)` / `exit(0)`（可先打印自己的 pid）；
//! 2. 父进程必须对**两个**子进程都 `waitpid` 成功，且各自 `exit_code == 0`；
//! 3. 全部成功后打印 `fork_test pass`。
//!
//! 不要把 `waitpid` 的返回值（子进程 pid）和 `exit_code`（退出码）混为一谈。
//! 验证：`cargo run -p kernel --features lab4 --release`

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, fork, getpid, println, waitpid};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let pid1 = fork();
    if pid1 == 0 {
        println("I am child, pid=");
        user_lib::print_usize(getpid() as usize);
        println("");
        exit(0);
    }

    let pid2 = fork();
    if pid2 == 0 {
        println("I am child, pid=");
        user_lib::print_usize(getpid() as usize);
        println("");
        exit(0);
    }

    println("I am parent, child_pid=");
    user_lib::print_usize(pid1 as usize);
    println("");
    println("I am parent, child_pid=");
    user_lib::print_usize(pid2 as usize);
    println("");

    // 【Lab4 任务：补全】回收两个孩子；都成功才返回 true。
    if reap_two_children(pid1, pid2) {
        println("fork_test pass");
    }
    exit(0);
}

/// 对 `a`、`b` 各调用一次 waitpid，检查返回的 pid 与 exit_code。
///
/// 提示：每次 wait 前准备自己的 `exit_code` 变量；顺序可先 a 后 b。
fn reap_two_children(a: isize, b: isize) -> bool {
    todo!("Lab4: waitpid both children and verify exit_code == 0")
}
