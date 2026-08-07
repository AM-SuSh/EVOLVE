//! 【Lab8 任务：补全】实现带互斥保护的计数器累加，并启动两个 worker。
//!
//! 要求：
//! 1. 实现 `bump_under_mutex`：在 mutex `mid` 保护下执行 `COUNTER += 1`；
//! 2. 实现 `worker`：循环 25 次调用 `bump_under_mutex(0)`，然后 `exit(0)`；
//! 3. 在 `spawn_two_workers` 中创建两个 worker 并返回它们的 tid（失败返回负数）。
//!
//! 最终 `COUNTER` 必须为 50。
//! 验证：补全后至少应看到 `threads_test pass` / `threads_arg_test pass` / `mutex_test pass`。

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

/// 在互斥锁保护下把共享 COUNTER 加一。
fn bump_under_mutex(mid: usize) {
    todo!("Lab8: critical section around COUNTER += 1")
}

#[no_mangle]
pub extern "C" fn worker() -> ! {
    todo!("Lab8: repeat bump_under_mutex(0) 25 times, then exit(0)")
}

/// 创建两个 worker 线程，返回 `(tid0, tid1)`；任一次创建失败则对应 tid 为负数。
fn spawn_two_workers() -> (isize, isize) {
    todo!("Lab8: thread_create worker twice")
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

    let (w0, w1) = spawn_two_workers();
    if w0 < 0 || w1 < 0 || waittid(w0 as usize) != 0 || waittid(w1 as usize) != 0 {
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
