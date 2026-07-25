//! Lab8: thread_create / waittid / per-thread exit codes.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, println, thread_create, waittid};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub extern "C" fn thread_a() -> ! {
    exit(1);
}

#[no_mangle]
pub extern "C" fn thread_b() -> ! {
    exit(2);
}

#[no_mangle]
pub extern "C" fn thread_c() -> ! {
    exit(3);
}

#[no_mangle]
pub fn main() -> ! {
    let tids = [
        thread_create(thread_a as *const () as usize, 0),
        thread_create(thread_b as *const () as usize, 0),
        thread_create(thread_c as *const () as usize, 0),
    ];
    for tid in tids {
        if tid < 0 {
            println("thread_create failed");
            exit(-1);
        }
    }
    let codes = [
        waittid(tids[0] as usize),
        waittid(tids[1] as usize),
        waittid(tids[2] as usize),
    ];
    if codes != [1, 2, 3] {
        println("threads_test bad exit codes");
        exit(-1);
    }
    println("threads_test pass");
    let _ = exec("threads_arg_test");
    println("exec threads_arg_test failed");
    exit(-1);
}
