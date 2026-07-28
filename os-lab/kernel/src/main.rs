#![no_std]
#![no_main]

#[cfg(any(feature = "lab6", feature = "lab7", feature = "lab8"))]
extern crate alloc;

#[cfg(any(feature = "lab6", feature = "lab7", feature = "lab8"))]
mod global_alloc;

#[cfg(feature = "lab2")]
mod cell;
mod console;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
mod config;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
mod riscv;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
mod trap;

#[cfg(all(
    feature = "trace-edu",
    feature = "lab2",
    not(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))
))]
mod trace;

#[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
mod loader;

#[cfg(all(
    any(feature = "lab2", feature = "lab3"),
    not(any(feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))
))]
mod task;

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
mod mm;

#[cfg(any(feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
mod process;

#[cfg(any(feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
mod fs;

#[cfg(any(feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
mod sync;

#[cfg(any(feature = "lab6", feature = "lab7", feature = "lab8"))]
mod virtio_block;

#[cfg(feature = "lab7")]
mod signal;

#[cfg(feature = "lab8")]
mod deadlock;

#[cfg(feature = "lab8")]
mod processor;

#[cfg(feature = "lab8")]
mod sync_syscall;

use core::arch::global_asm;
use core::panic::PanicInfo;

global_asm!(include_str!("entry.asm"));

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    clear_bss();
    console::init();

    #[cfg(not(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8")))]
    {
        println!("Hello, OS!");
        println!("os-lab kernel lab1 is running on QEMU virt.");
        os_sbi::shutdown();
    }

    #[cfg(any(feature = "lab2", feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
    {
        #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
        {
            println!("os-lab kernel lab3: enabling virtual memory...");
            mm::init();
            #[cfg(any(feature = "lab6", feature = "lab7", feature = "lab8"))]
            mm::map_mmio_devices();
            println!("os-lab kernel lab3: virtual memory ready.");
        }
        #[cfg(feature = "lab8")]
        {
            println!("os-lab kernel lab8: threads, blocking sync, deadlock detection.");
        }
        #[cfg(all(feature = "lab7", not(feature = "lab8")))]
        {
            println!("os-lab kernel lab7: IPC and signals.");
        }
        #[cfg(all(feature = "lab6", not(any(feature = "lab7", feature = "lab8"))))]
        {
            os_alloc::init_heap();
            println!("os-lab kernel lab6: VirtIO disk filesystem.");
            sync::init();
            fs::init();
        }
        #[cfg(all(feature = "lab7", not(feature = "lab8")))]
        {
            os_alloc::init_heap();
            sync::init();
            fs::init();
        }
        #[cfg(feature = "lab8")]
        {
            os_alloc::init_heap();
            sync::init();
            fs::init();
        }
        #[cfg(all(feature = "lab5", not(feature = "lab6")))]
        {
            os_alloc::init_heap();
            println!("os-lab kernel lab5: filesystem and sync.");
            sync::init();
            fs::init();
        }
        trap::init();
        loader::load_apps();
        #[cfg(any(feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7", feature = "lab8"))]
        {
            process::init();
            process::run_initproc();
        }
        #[cfg(all(not(any(feature = "lab4", feature = "lab5", feature = "lab6")), any(feature = "lab2", feature = "lab3")))]
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
