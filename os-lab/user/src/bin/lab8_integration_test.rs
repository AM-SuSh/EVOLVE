//! Lab8 integration test (single address space, no inter-test exec).

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{
    close, condvar_create, condvar_signal, condvar_wait, enable_deadlock_detect, exec, exit,
    fork, gettid, mutex_create, mutex_lock, mutex_unlock, open, pipe, println, read, semaphore_create,
    semaphore_down, semaphore_up, thread_create, waitpid, waittid, write, yield_, DEADLOCK_DETECTED,
};

global_asm!(include_str!("../entry.asm"));

static mut COUNTER: usize = 0;
static mut FLAG: usize = 0;
static mut CV_ID: usize = 0;
static mut MUX_ID: usize = 0;

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

struct ThreadArg {
    code: i32,
}
static ARG_A: ThreadArg = ThreadArg { code: 1 };
static ARG_B: ThreadArg = ThreadArg { code: 2 };
static ARG_C: ThreadArg = ThreadArg { code: 3 };

#[no_mangle]
pub extern "C" fn thread_print(arg: usize) -> ! {
    let arg = unsafe { &*(arg as *const ThreadArg) };
    exit(arg.code);
}

#[no_mangle]
pub extern "C" fn worker() -> ! {
    for _ in 0..50 {
        let _ = mutex_lock(0);
        unsafe {
            COUNTER += 1;
        }
        let _ = mutex_unlock(0);
    }
    exit(0);
}

fn spin_delay() {
    for _ in 0..1000 {
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

const SEM_BARRIER: usize = 0;
const THREAD_N: usize = 3;
const RES_NUM: [usize; 3] = [1, 2, 1];
const REQUEST: [usize; THREAD_N] = [1, 3, 2];

fn sem_alloc(tid: usize) {
    match tid {
        1 => {
            let _ = semaphore_down(2);
        }
        2 => {
            let _ = semaphore_down(1);
            let _ = semaphore_down(2);
        }
        3 => {
            let _ = semaphore_down(3);
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

fn test_threads() {
    let tids = [
        thread_create(thread_a as *const () as usize, 0),
        thread_create(thread_b as *const () as usize, 0),
    ];
    if tids.iter().any(|&t| t < 0) {
        println("threads_test create failed");
        exit(-1);
    }
    if waittid(tids[0] as usize) != 1 || waittid(tids[1] as usize) != 2 {
        println("threads_test bad codes");
        exit(-1);
    }
    println("threads_test pass");
}

fn test_threads_arg() {
    let tids = [thread_create(
        thread_print as *const () as usize,
        &ARG_C as *const _ as usize,
    )];
    if tids[0] < 0 {
        println("threads_arg_test create failed");
        exit(-1);
    }
    if waittid(tids[0] as usize) != 3 {
        println("threads_arg_test bad codes");
        exit(-1);
    }
    println("threads_arg_test pass");
}

fn test_mutex() {
    if mutex_create(true) < 0 {
        println("mutex_create failed");
        exit(-1);
    }
    let tid = thread_create(worker as *const () as usize, 0);
    if tid < 0 {
        println("mutex_test create failed");
        exit(-1);
    }
    if waittid(tid as usize) != 0 {
        println("mutex_test waittid failed");
        exit(-1);
    }
    if unsafe { COUNTER } != 50 {
        println("mutex_test counter mismatch");
        exit(-1);
    }
    println("mutex_test pass");
}

fn test_condvar() {
    unsafe {
        FLAG = 0;
    }
    let cv = condvar_create();
    let mid = mutex_create(true);
    if cv < 0 || mid < 0 {
        println("condvar_test create failed");
        exit(-1);
    }
    let _ = (cv, mid);
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
}

fn test_pipetest() {
    const MSG: &[u8] = b"Hello, world!";
    let h0 = open("testfile");
    let h1 = open("testfile");
    if h0 < 0 || h1 < 0 {
        println("pipetest open failed");
        exit(-1);
    }
    let mut fds = [0i32; 2];
    if pipe(&mut fds) != 0 {
        println("pipetest pipe failed");
        exit(-1);
    }
    let _ = close(h0 as usize);
    let _ = close(h1 as usize);
    let pid = fork();
    if pid == 0 {
        let _ = close(fds[1] as usize);
        let mut buf = [0u8; 32];
        loop {
            let n = read(fds[0] as usize, &mut buf);
            if n > 0 {
                if n as usize != MSG.len() || &buf[..n as usize] != MSG {
                    exit(-1);
                }
                let _ = close(fds[0] as usize);
                println("Read OK, child process exited!");
                exit(0);
            }
            if n == 0 {
                break;
            }
            let _ = yield_();
        }
        exit(-1);
    }
    if pid < 0 {
        exit(-1);
    }
    let _ = close(fds[0] as usize);
    if write(fds[1] as usize, MSG) != MSG.len() as isize {
        exit(-1);
    }
    let _ = close(fds[1] as usize);
    let mut code = 0i32;
    let _ = waitpid(pid, &mut code);
    if code != 0 {
        exit(-1);
    }
    println("pipetest passed!");
}

fn test_deadlock_mutex() {
    if enable_deadlock_detect(true) != 0 {
        exit(-1);
    }
    let mid = mutex_create(true);
    if mid < 0 {
        exit(-1);
    }
    if mutex_lock(mid as usize) != 0 || mutex_lock(mid as usize) != DEADLOCK_DETECTED {
        println("deadlock_mutex_test failed");
        exit(-1);
    }
    let _ = mutex_unlock(mid as usize);
    println("deadlock test mutex 1 OK!");
}

fn test_deadlock_sem() {
    if enable_deadlock_detect(true) != 0 {
        exit(-1);
    }
    if semaphore_create(THREAD_N) as usize != SEM_BARRIER {
        exit(-1);
    }
    for _ in 0..THREAD_N {
        let _ = semaphore_down(SEM_BARRIER);
    }
    for n in RES_NUM {
        let _ = semaphore_create(n);
    }
    let mut tids = [0isize; THREAD_N];
    for slot in tids.iter_mut() {
        *slot = thread_create(deadlock_worker as *const () as usize, 0);
        if *slot < 0 {
            exit(-1);
        }
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
}

#[no_mangle]
pub fn main() -> ! {
    test_threads();
    test_threads_arg();
    test_mutex();
    test_condvar();
    test_pipetest();
    test_deadlock_mutex();
    test_deadlock_sem();
    let _ = exec("pipe_test");
    println("exec pipe_test failed");
    exit(-1);
}
