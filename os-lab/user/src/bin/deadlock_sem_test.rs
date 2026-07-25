//! Lab8 exercise: circular semaphore wait triggers deadlock detection.

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    enable_deadlock_detect, exec, exit, gettid, println, semaphore_create, semaphore_down,
    semaphore_up, thread_create, waittid, yield_, DEADLOCK_DETECTED,
};

global_asm!(include_str!("../entry.asm"));

const SEM_BARRIER: usize = 0;
const THREAD_N: usize = 3;
const RES_NUM: [usize; 3] = [1, 2, 1];
const REQUEST: [usize; THREAD_N] = [1, 3, 2];

fn spin_delay() {
    for _ in 0..5000 {
        let _ = yield_();
    }
}

fn sem_alloc(tid: usize) {
    match tid {
        1 => {
            if semaphore_down(2) != 0 {
                exit(1);
            }
        }
        2 => {
            if semaphore_down(1) != 0 || semaphore_down(2) != 0 {
                exit(1);
            }
        }
        3 => {
            if semaphore_down(3) != 0 {
                exit(1);
            }
        }
        _ => exit(1),
    }
    let _ = semaphore_down(SEM_BARRIER);
}

fn sem_dealloc(tid: usize) {
    let _ = semaphore_up(SEM_BARRIER);
    match tid {
        1 => {
            let _ = semaphore_up(2);
        }
        2 => {
            let _ = semaphore_up(1);
            let _ = semaphore_up(2);
        }
        3 => {
            let _ = semaphore_up(3);
        }
        _ => exit(1),
    }
}

#[no_mangle]
pub extern "C" fn deadlock_worker() -> ! {
    let tid = gettid() as usize;
    sem_alloc(tid);
    let sem_id = REQUEST[tid - 1];
    if semaphore_down(sem_id) == DEADLOCK_DETECTED {
        sem_dealloc(tid);
        exit(-1);
    }
    let _ = semaphore_up(sem_id);
    sem_dealloc(tid);
    exit(0);
}

#[no_mangle]
pub fn main() -> ! {
    if enable_deadlock_detect(true) != 0 {
        println("enable_deadlock_detect failed");
        exit(-1);
    }
    if semaphore_create(THREAD_N) as usize != SEM_BARRIER {
        println("barrier sem create failed");
        exit(-1);
    }
    for _ in 0..THREAD_N {
        let _ = semaphore_down(SEM_BARRIER);
    }
    for n in RES_NUM {
        let _ = semaphore_create(n);
    }

    let mut tids = [0isize; THREAD_N];
    for (i, slot) in tids.iter_mut().enumerate() {
        *slot = thread_create(deadlock_worker as *const () as usize, 0);
        if *slot < 0 {
            println("deadlock_sem thread_create failed");
            exit(-1);
        }
        let _ = i;
    }

    spin_delay();
    for _ in 0..THREAD_N {
        let _ = semaphore_up(SEM_BARRIER);
    }

    let mut failed = 0usize;
    for tid in tids {
        if waittid(tid as usize) != 0 {
            failed += 1;
        }
    }
    if failed == 0 {
        println("deadlock_sem_test expected failures");
        exit(-1);
    }
    println("deadlock test semaphore 1 OK!");
    let _ = exec("pipe_test");
    println("exec pipe_test failed");
    exit(-1);
}
