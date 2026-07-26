//! User-space library: syscalls and minimal I/O (lab2+).

#![no_std]

mod syscall;

pub use os_syscall::{SignalAction, Stat, StatMode};
pub use syscall::{
    close, condvar_create, condvar_signal, condvar_wait, dup, enable_deadlock_detect, exec, exit,
    fork, fstat, getpid, gettid, kill, linkat, mmap, munmap, mutex_create, mutex_lock,
    mutex_unlock, open, openat, pipe, read, semaphore_create, semaphore_down, semaphore_up,
    set_priority, sigaction, sigprocmask, sigreturn, spawn, thread_create, unlinkat, waitpid,
    waittid, write, yield_, DEADLOCK_DETECTED, O_CREATE, O_RDONLY, O_RDWR, O_TRUNC, O_WRONLY,
    PAGE_SIZE, PROT_READ, PROT_WRITE, SIGINT, SIGKILL, SIGUSR1,
};

pub fn print(s: &str) {
    let _ = write(1, s.as_bytes());
}

pub fn println(s: &str) {
    print(s);
    print("\n");
}

pub fn print_usize(mut n: usize) {
    if n == 0 {
        print("0");
        return;
    }
    let mut buf = [0u8; 20];
    let mut i = 0;
    while n > 0 {
        buf[i] = b'0' + (n % 10) as u8;
        n /= 10;
        i += 1;
    }
    while i > 0 {
        i -= 1;
        let ch = [buf[i]];
        let _ = write(1, &ch);
    }
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    exit(-1);
}
