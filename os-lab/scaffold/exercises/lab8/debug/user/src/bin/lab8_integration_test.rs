//! Lab8 debug variant: the integrated mutex workload is one update short.
//!
//! 【Lab8 任务：排错】`mutex_test` 最终计数 mismatch。
//! 先区分「临界区是否加锁」与「每个线程实际执行次数」，再修正循环上界。

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    exit, mutex_create, mutex_lock, mutex_unlock, println, thread_create, waittid,
};

global_asm!(include_str!("../entry.asm"));

static mut COUNTER: usize = 0;

#[no_mangle]
pub extern "C" fn thread_a() -> ! {
    exit(1);
}

#[no_mangle]
pub extern "C" fn thread_b() -> ! {
    exit(2);
}

struct ThreadArg {
    code: i32,
}

static ARG_C: ThreadArg = ThreadArg { code: 3 };

#[no_mangle]
pub extern "C" fn thread_print(arg: usize) -> ! {
    let arg = unsafe { &*(arg as *const ThreadArg) };
    exit(arg.code);
}

#[no_mangle]
pub extern "C" fn worker() -> ! {
    // PLANTED BUG: the integrated workload must perform all 50 updates.
    for _ in 0..49 {
        let _ = mutex_lock(0);
        unsafe {
            COUNTER += 1;
        }
        let _ = mutex_unlock(0);
    }
    exit(0);
}

#[no_mangle]
pub fn main() -> ! {
    let tids = [
        thread_create(thread_a as *const () as usize, 0),
        thread_create(thread_b as *const () as usize, 0),
    ];
    if tids.iter().any(|&tid| tid < 0)
        || waittid(tids[0] as usize) != 1
        || waittid(tids[1] as usize) != 2
    {
        println("threads_test bad exit codes");
        exit(-1);
    }
    println("threads_test pass");

    let tid = thread_create(
        thread_print as *const () as usize,
        &ARG_C as *const _ as usize,
    );
    if tid < 0 || waittid(tid as usize) != 3 {
        println("threads_arg_test bad exit codes");
        exit(-1);
    }
    println("threads_arg_test pass");

    if mutex_create(true) < 0 {
        println("mutex_create failed");
        exit(-1);
    }
    let tid = thread_create(worker as *const () as usize, 0);
    if tid < 0 || waittid(tid as usize) != 0 {
        println("mutex_test waittid failed");
        exit(-1);
    }
    if unsafe { COUNTER } != 50 {
        println("mutex_test counter mismatch");
        exit(-1);
    }
    println("mutex_test pass");
    exit(0);
}
