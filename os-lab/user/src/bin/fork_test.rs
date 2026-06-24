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
    if waited == pid && exit_code == 0 {
        println("fork_test pass");
    }
    exit(0);
}
