//! User program loading from build-time embedded binaries (lab2+).

use crate::config::{APP_BASE_ADDRESS, MAX_APP_NUM};
use crate::println;

static APP_BINARIES: [&[u8]; NUM_APP] = [
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/hello.bin")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/power.bin")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/yield.bin")),
];

pub fn load_app(app_id: usize) {
    assert!(app_id < NUM_APP);
    let app_data = APP_BINARIES[app_id];
    unsafe {
        core::ptr::copy_nonoverlapping(app_data.as_ptr(), APP_BASE_ADDRESS as *mut u8, app_data.len());
        core::arch::asm!("fence.i");
    }
    println!("  app {}: {} bytes -> {:#x}", app_id, app_data.len(), APP_BASE_ADDRESS);
}

pub fn load_apps() {
    assert!(NUM_APP <= MAX_APP_NUM);
    println!("Loading {} user apps (batch slot at {:#x})...", NUM_APP, APP_BASE_ADDRESS);
}

pub fn get_app_entry(_app_id: usize) -> usize {
    APP_BASE_ADDRESS
}

pub const NUM_APP: usize = 3;
