#![no_std]
#![no_main]

#[cfg(feature = "lab2")]
mod cell;
mod console;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5"))]
mod config;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5"))]
mod riscv;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5"))]
mod trap;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5"))]
mod loader;

#[cfg(all(
    any(feature = "lab2", feature = "lab3"),
    not(any(feature = "lab4", feature = "lab5"))
))]
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

    #[cfg(not(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5")))]
    {
        println!("Hello, OS!");
        println!("os-lab kernel lab1 is running on QEMU virt.");
        os_sbi::shutdown();
    }

    #[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5"))]
    {
        #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
        {
            println!("os-lab kernel lab3: enabling virtual memory...");
            mm::init();
            println!("os-lab kernel lab3: virtual memory ready.");
        }
        #[cfg(all(feature = "lab2", not(any(feature = "lab3", feature = "lab4", feature = "lab5"))))]
        {
            println!("os-lab kernel lab2: trap and multitask.");
        }
        #[cfg(all(feature = "lab4", not(feature = "lab5")))]
        {
            println!("os-lab kernel lab4: process management.");
        }
        #[cfg(feature = "lab5")]
        {
            os_alloc::init_heap();
            println!("os-lab kernel lab5: filesystem and sync.");
            sync::init();
            fs::init();
        }
        trap::init();
        loader::load_apps();
        #[cfg(feature = "lab4")]
        {
            process::init();
            process::run_initproc();
        }
        #[cfg(all(not(feature = "lab4"), any(feature = "lab2", feature = "lab3")))]
        {
            task::init();
            task::run_first_task();
        }
    }
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
