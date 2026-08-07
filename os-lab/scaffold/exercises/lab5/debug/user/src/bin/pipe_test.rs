//! 【Lab5 任务：排错】管道两端关闭错了，子进程读不到父进程写入的数据。
//!
//! 现象：`cargo run -p kernel --features lab5 --release` 时，可能看不到
//! `pipe says hi` / `pipe_test pass`，或读端一直失败。
//!
//! 按「现象 → 假设 → 最小实验」排查：
//! 1. 先确认 `pipe()` 与 `fork` 是否成功；
//! 2. 假设：子进程是否关掉了**写端**、父进程是否关掉了**读端**？
//! 3. 沿子进程 `close` / `read` 与父进程 `close` / `write` 核对两端；
//! 4. 修复后应看到 `pipe says hi` 与 `pipe_test pass`。

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, exit, fork, open, pipe, println, read, waitpid, write, yield_};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    // Reserve low fds so pipe ends are not 0/1 (fd 1 is console in this kernel).
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
        // PLANTED BUG: child must close the *write* end (fds[1]) before reading.
        // Closing the read end leaves the reader without a usable fd, and keeps an
        // extra writer alive — classic pipe-end mix-up after fork.
        let _ = close(fds[0] as usize);
        let mut buf = [0u8; 32];
        loop {
            let n = read(fds[0] as usize, &mut buf);
            if n > 0 {
                if let Ok(s) = core::str::from_utf8(&buf[..n as usize]) {
                    user_lib::print(s);
                }
                println("pipe_test pass");
                break;
            }
            if n == 0 {
                break;
            }
            let _ = yield_();
        }
        let _ = close(fds[1] as usize);
        exit(0);
    }
    let _ = close(fds[0] as usize);
    let msg = b"pipe says hi\n";
    let n = write(fds[1] as usize, msg);
    if n != msg.len() as isize {
        println("pipe write failed");
        exit(-1);
    }
    let _ = close(fds[1] as usize);
    let mut code = 0i32;
    let _ = waitpid(pid, &mut code);
    exit(0);
}
