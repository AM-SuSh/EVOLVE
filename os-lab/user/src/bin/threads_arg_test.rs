//! Lab8: thread_create argument passing via pointer.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, println, thread_create, waittid};

global_asm!(include_str!("../entry.asm"));

struct ThreadArg {
    ch: u8,
    code: i32,
}

static ARG_A: ThreadArg = ThreadArg { ch: b'a', code: 1 };
static ARG_B: ThreadArg = ThreadArg { ch: b'b', code: 2 };
static ARG_C: ThreadArg = ThreadArg { ch: b'c', code: 3 };

#[no_mangle]
pub extern "C" fn thread_print(arg: usize) -> ! {
    let arg = unsafe { &*(arg as *const ThreadArg) };
    let _ = arg.ch;
    exit(arg.code);
}

#[no_mangle]
pub fn main() -> ! {
    let tids = [
        thread_create(thread_print as *const () as usize, &ARG_A as *const _ as usize),
        thread_create(thread_print as *const () as usize, &ARG_B as *const _ as usize),
        thread_create(thread_print as *const () as usize, &ARG_C as *const _ as usize),
    ];
    for tid in tids {
        if tid < 0 {
            println("threads_arg thread_create failed");
            exit(-1);
        }
    }
    if waittid(tids[0] as usize) != 1
        || waittid(tids[1] as usize) != 2
        || waittid(tids[2] as usize) != 3
    {
        println("threads_arg_test bad exit codes");
        exit(-1);
    }
    println("threads_arg_test pass");
    let _ = exec("mutex_test");
    println("exec mutex_test failed");
    exit(-1);
}
