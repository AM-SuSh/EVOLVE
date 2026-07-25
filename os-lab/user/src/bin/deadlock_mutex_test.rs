//! Lab8 exercise: mutex re-lock deadlock detection returns -0xDEAD.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    enable_deadlock_detect, exec, exit, mutex_create, mutex_lock, mutex_unlock, println,
    DEADLOCK_DETECTED,
};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    if enable_deadlock_detect(true) != 0 {
        println("enable_deadlock_detect failed");
        exit(-1);
    }
    let mid = mutex_create(true);
    if mid < 0 {
        println("mutex_create failed");
        exit(-1);
    }
    if mutex_lock(mid as usize) != 0 {
        println("first mutex_lock failed");
        exit(-1);
    }
    if mutex_lock(mid as usize) != DEADLOCK_DETECTED {
        println("deadlock_mutex_test expected DEAD");
        exit(-1);
    }
    let _ = mutex_unlock(mid as usize);
    println("deadlock test mutex 1 OK!");
    let _ = exec("deadlock_sem_test");
    println("exec deadlock_sem_test failed");
    exit(-1);
}
