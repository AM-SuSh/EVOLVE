//! 【Lab5 任务：补全】实现管道两端的关闭与读写协议。
//!
//! `pipe()` 已创建读写端。请补全：
//! - 子进程：关掉写端，从读端读出父进程写入的字节并打印，再打印 `pipe_test pass`
//! - 父进程：关掉读端，写入 `pipe says hi\n`，关闭写端，`waitpid` 子进程
//!
//! 低号 fd 已用 placeholder 占住，避免管道端落到 0/1。
//! 验证：`cargo run -p kernel --features lab5 --release`
//! 应看到 `pipe says hi` 与 `pipe_test pass`（完整链还依赖前面的 fs_test）。

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, exit, fork, open, pipe, println, read, waitpid, write, yield_};

global_asm!(include_str!("../entry.asm"));

const PIPE_MSG: &[u8] = b"pipe says hi\n";

/// 子进程侧：关闭写端，循环 read 直到读到数据（或需要 yield 再试），打印内容与 `pipe_test pass`。
fn child_reader(read_fd: usize, write_fd: usize) -> ! {
    todo!("Lab5: close write end, read from pipe, print message + pipe_test pass, exit")
}

/// 父进程侧：关闭读端，write 完整 PIPE_MSG，关闭写端，waitpid 子进程。
fn parent_writer(read_fd: usize, write_fd: usize, child_pid: isize) -> ! {
    todo!("Lab5: close read end, write PIPE_MSG, close write end, waitpid, exit")
}

#[no_mangle]
pub fn main() -> ! {
    let h0 = open("testfile");
    let h1 = open("testfile");
    if h0 < 0 || h1 < 0 {
        println("open placeholder failed");
        exit(-1);
    }

    let mut fds = [0i32; 2];
    if pipe(&mut fds) != 0 {
        println("pipe() failed");
        exit(-1);
    }
    let _ = close(h0 as usize);
    let _ = close(h1 as usize);

    let pid = fork();
    if pid == 0 {
        child_reader(fds[0] as usize, fds[1] as usize);
    }
    parent_writer(fds[0] as usize, fds[1] as usize, pid);
}
