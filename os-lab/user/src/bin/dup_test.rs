//! Lab7: dup on a pipe write end; parent writes via dup, child reads.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, dup, exec, exit, fork, open, pipe, println, read, waitpid, write, yield_};

global_asm!(include_str!("../entry.asm"));

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
        println("pipe failed");
        exit(-1);
    }
    let _ = close(h0 as usize);
    let _ = close(h1 as usize);

    let pid = fork();
    if pid == 0 {
        let _ = close(fds[1] as usize);
        let mut buf = [0u8; 16];
        loop {
            let n = read(fds[0] as usize, &mut buf);
            if n > 0 {
                if &buf[..n as usize] == b"dup ok\n" {
                    println("dup_test pass");
                    let _ = exec("signal_test");
                    println("exec signal_test failed");
                }
                exit(-1);
            }
            if n == 0 {
                break;
            }
            let _ = yield_();
        }
        println("dup read failed");
        exit(-1);
    }
    if pid < 0 {
        println("fork failed");
        exit(-1);
    }

    let _ = close(fds[0] as usize);
    let dup_write = dup(fds[1] as usize);
    if dup_write < 0 {
        println("dup failed");
        exit(-1);
    }
    let _ = close(fds[1] as usize);
    let msg = b"dup ok\n";
    if write(dup_write as usize, msg) != msg.len() as isize {
        println("dup write failed");
        exit(-1);
    }
    let _ = close(dup_write as usize);

    let mut code = 0i32;
    let _ = waitpid(pid, &mut code);
    if code != 0 {
        println("child failed");
        exit(-1);
    }
    exit(0);
}
