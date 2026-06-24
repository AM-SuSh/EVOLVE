//! Lab5 integration test: pipe IPC across fork.
//!
//! Pass criteria:
//! - `pipe()` allocates a read/write fd pair
//! - child reads `pipe says hi` from the pipe and prints `pipe_test pass`
//! - parent writes to the pipe and waits for child exit
//!
//! Note: `pipe_test pass` is printed by the **child** after a successful read
//! (kernel `wait4` yield semantics match lab4; see lab5-fs-and-sync docs).
//!
//! Workaround: open two placeholder fds before `pipe()` so read/write ends are not
//! 0/1 — the kernel routes `write(1, …)` to the console, not the fd table.

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
