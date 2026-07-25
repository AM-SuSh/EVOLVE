//! Lab6 prerequisite: anonymous mmap / munmap.
//!
//! Pass criteria:
//! - map one page, write/read, unmap
//! - prints `mmap_test pass`
//! - chains into `spawn_test`

#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exec, exit, mmap, munmap, println, PAGE_SIZE, PROT_READ, PROT_WRITE};

global_asm!(include_str!("../entry.asm"));

const MMAP_ADDR: usize = 0x1000_0000;

#[no_mangle]
pub fn main() -> ! {
    if mmap(MMAP_ADDR, PAGE_SIZE, PROT_READ | PROT_WRITE) != 0 {
        println("mmap failed");
        exit(-1);
    }

    unsafe {
        let p = MMAP_ADDR as *mut u8;
        core::ptr::write_volatile(p, 0x42);
        if core::ptr::read_volatile(p) != 0x42 {
            println("mmap readback failed");
            exit(-1);
        }
    }

    if munmap(MMAP_ADDR, PAGE_SIZE) != 0 {
        println("munmap failed");
        exit(-1);
    }

    println("mmap_test pass");
    let _ = exec("spawn_test");
    println("exec spawn_test failed");
    exit(-1);
}
