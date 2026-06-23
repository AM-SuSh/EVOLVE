//! User program loading from build-time embedded binaries (lab2+).

use crate::config::{APP_BASE_ADDRESS, MAX_APP_NUM};
use crate::println;

#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
static APP_BINARIES: [&[u8]; NUM_APP] = [
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/hello.bin")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/power.bin")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/yield.bin")),
];

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
static APP_BINARIES: [&[u8]; NUM_APP] = [
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/hello.bin")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/power.bin")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/yield.bin")),
];

#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
pub fn load_app(app_id: usize) {
    assert!(app_id < NUM_APP);
    let app_data = APP_BINARIES[app_id];
    unsafe {
        core::ptr::copy_nonoverlapping(app_data.as_ptr(), APP_BASE_ADDRESS as *mut u8, app_data.len());
        core::arch::asm!("fence.i");
    }
    println!("  app {}: {} bytes -> {:#x}", app_id, app_data.len(), APP_BASE_ADDRESS);
}

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
pub fn get_app_bin(app_id: usize) -> &'static [u8] {
    assert!(app_id < NUM_APP);
    APP_BINARIES[app_id]
}

pub fn load_apps() {
    assert!(NUM_APP <= MAX_APP_NUM);
    #[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
    println!("Loading {} user apps (batch slot at {:#x})...", NUM_APP, APP_BASE_ADDRESS);
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
    println!("Loading {} user apps (virtual memory, per-task maps)...", NUM_APP);
}

pub fn get_app_entry(_app_id: usize) -> usize {
    APP_BASE_ADDRESS
}

pub const NUM_APP: usize = 3;
