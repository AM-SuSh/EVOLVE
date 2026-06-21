#![no_std]
#![no_main]

mod console;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5"))]
mod trap;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5"))]
mod task;

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
mod mm;

#[cfg(any(feature = "lab4", feature = "lab5"))]
mod process;

#[cfg(feature = "lab5")]
mod fs;

#[cfg(feature = "lab5")]
mod sync;

use core::arch::global_asm;
use core::panic::PanicInfo;

global_asm!(include_str!("entry.asm"));

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    clear_bss();
    console::init();

    println!("Hello, OS!");
    println!("os-lab kernel lab1 is running on QEMU virt.");

    os_sbi::shutdown();
}

fn clear_bss() {
    extern "C" {
        fn sbss();
        fn ebss();
    }
    let start = sbss as *const () as usize;
    let end = ebss as *const () as usize;
    unsafe {
        core::ptr::write_bytes(start as *mut u8, 0, end - start);
    }
}

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    println!("{}", info);
    os_sbi::shutdown();
}
