//! Lab8: condvar wait / signal between two threads.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    condvar_create, condvar_signal, condvar_wait, exec, exit, mutex_create, mutex_lock,
    mutex_unlock, println, thread_create, waittid, yield_,
};

global_asm!(include_str!("../entry.asm"));

static mut FLAG: usize = 0;

fn spin_delay() {
    for _ in 0..2000 {
        let _ = yield_();
    }
}

#[no_mangle]
pub extern "C" fn producer() -> ! {
    spin_delay();
    let _ = mutex_lock(0);
    unsafe {
        FLAG = 1;
    }
    let _ = condvar_signal(0);
    let _ = mutex_unlock(0);
    exit(0);
}

#[no_mangle]
pub extern "C" fn consumer() -> ! {
    let _ = mutex_lock(0);
    while unsafe { FLAG } == 0 {
        let _ = condvar_wait(0, 0);
    }
    let _ = mutex_unlock(0);
    exit(0);
}

#[no_mangle]
pub fn main() -> ! {
    if condvar_create() < 0 || mutex_create(true) < 0 {
        println("condvar_test create failed");
        exit(-1);
    }
    let t0 = thread_create(producer as *const () as usize, 0);
    let t1 = thread_create(consumer as *const () as usize, 0);
    if t0 < 0 || t1 < 0 {
        println("condvar_test thread_create failed");
        exit(-1);
    }
    if waittid(t0 as usize) != 0 || waittid(t1 as usize) != 0 {
        println("condvar_test waittid failed");
        exit(-1);
    }
    if unsafe { FLAG } != 1 {
        println("condvar_test flag mismatch");
        exit(-1);
    }
    println("condvar_test pass");
    let _ = exec("pipetest");
    println("exec pipetest failed");
    exit(-1);
}
