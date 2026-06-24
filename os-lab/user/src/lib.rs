//! User-space library: syscalls and minimal I/O (lab2+).

#![no_std]

mod syscall;

pub use syscall::{close, exec, exit, fork, getpid, open, pipe, read, waitpid, write, yield_};

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
