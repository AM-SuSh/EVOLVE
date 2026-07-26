//! Lab8: pipe IPC across fork (ch8 pipetest semantics).

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, exec, exit, fork, open, pipe, println, read, waitpid, write, yield_};

global_asm!(include_str!("../entry.asm"));

const MSG: &[u8] = b"Hello, world!";

#[no_mangle]
pub fn main() -> ! {
    let h0 = open("testfile");
    let h1 = open("testfile");
    if h0 < 0 || h1 < 0 {
        println("pipetest open placeholder failed");
        exit(-1);
    }

    let mut fds = [0i32; 2];
    if pipe(&mut fds) != 0 {
        println("pipetest pipe failed");
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
                if n as usize != MSG.len() || &buf[..n as usize] != MSG {
                    println("pipetest child bad data");
                    exit(-1);
                }
                let _ = close(fds[0] as usize);
                println("Read OK, child process exited!");
                exit(0);
            }
            if n == 0 {
                break;
            }
            let _ = yield_();
        }
        println("pipetest child read failed");
        exit(-1);
    }
    if pid < 0 {
        println("pipetest fork failed");
        exit(-1);
    }

    let _ = close(fds[0] as usize);
    if write(fds[1] as usize, MSG) != MSG.len() as isize {
        println("pipetest write failed");
        exit(-1);
    }
    let _ = close(fds[1] as usize);
    let mut code = 0i32;
    let _ = waitpid(pid, &mut code);
    if code != 0 {
        println("pipetest child exit bad");
        exit(-1);
    }
    println("pipetest passed!");
    let _ = exec("deadlock_mutex_test");
    println("exec deadlock_mutex_test failed");
    exit(-1);
}
