//! Lab5 integration test: pipe IPC across fork.
//!
//! Pass criteria: parent writes to pipe, child reads and prints, parent prints
//! `pipe_test pass` after waitpid succeeds.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, exit, fork, pipe, println, read, waitpid, write, yield_};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    let mut fds = [0i32; 2];
    if pipe(&mut fds) != 0 {
        println("pipe() failed");
        exit(-1);
    }
    let pid = fork();
    if pid == 0 {
        let _ = close(fds[1] as usize);
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
        let _ = close(fds[0] as usize);
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
