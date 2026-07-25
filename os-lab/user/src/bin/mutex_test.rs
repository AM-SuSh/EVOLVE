//! Lab8: blocking mutex protects a shared counter.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, mutex_create, mutex_lock, mutex_unlock, println, thread_create, waittid};

global_asm!(include_str!("../entry.asm"));

static mut COUNTER: usize = 0;
const PER_THREAD: usize = 50;
const THREAD_COUNT: usize = 4;

#[no_mangle]
pub extern "C" fn worker() -> ! {
    for _ in 0..PER_THREAD {
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
    if mutex_create(true) < 0 {
        println("mutex_create failed");
        exit(-1);
    }
    let mut tids = [0isize; THREAD_COUNT];
    for tid in tids.iter_mut() {
        *tid = thread_create(worker as *const () as usize, 0);
        if *tid < 0 {
            println("mutex_test thread_create failed");
            exit(-1);
        }
    }
    for tid in tids {
        if waittid(tid as usize) != 0 {
            println("mutex_test waittid failed");
            exit(-1);
        }
    }
    let total = unsafe { COUNTER };
    if total != PER_THREAD * THREAD_COUNT {
        println("mutex_test counter mismatch");
        exit(-1);
    }
    println("mutex_test pass");
    let _ = exec("condvar_test");
    println("exec condvar_test failed");
    exit(-1);
}
