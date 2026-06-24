//! User program loading from build-time embedded ELF images (lab3+).

use crate::config::MAX_APP_NUM;
#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
use crate::mm::elf_entry_point;
use crate::println;

#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
static APP_BINARIES: [&[u8]; NUM_APP] = [
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/hello.bin")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/power.bin")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/yield.bin")),
];

#[cfg(all(any(feature = "lab3", feature = "lab4", feature = "lab5"), not(any(feature = "lab4", feature = "lab5"))))]
static APP_ELF: [&[u8]; NUM_APP] = [
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/hello")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/power")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/yield")),
];

#[cfg(any(feature = "lab4", feature = "lab5"))]
static APP_ELF: [&[u8]; NUM_APP] = [
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/fork_test")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/exec_test")),
    include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/hello")),
];

#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
pub fn load_app(app_id: usize) {
    use crate::config::APP_BASE_ADDRESS;
    assert!(app_id < NUM_APP);
    let app_data = APP_BINARIES[app_id];
    unsafe {
        core::ptr::copy_nonoverlapping(app_data.as_ptr(), APP_BASE_ADDRESS as *mut u8, app_data.len());
        core::arch::asm!("fence.i");
    }
    println!("  app {}: {} bytes -> {:#x}", app_id, app_data.len(), APP_BASE_ADDRESS);
}

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
pub fn get_app_elf(app_id: usize) -> &'static [u8] {
    assert!(app_id < NUM_APP);
    APP_ELF[app_id]
}

#[cfg(any(feature = "lab4", feature = "lab5"))]
pub fn get_app_elf_by_name(name: &str) -> Option<&'static [u8]> {
    match name {
        "fork_test" => Some(get_app_elf(0)),
        "exec_test" => Some(get_app_elf(1)),
        "hello" => Some(get_app_elf(2)),
        _ => None,
    }
}

pub fn load_apps() {
    assert!(NUM_APP <= MAX_APP_NUM);
    #[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
    {
        use crate::config::APP_BASE_ADDRESS;
        println!("Loading {} user apps (batch slot at {:#x})...", NUM_APP, APP_BASE_ADDRESS);
    }
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
    {
        #[cfg(any(feature = "lab4", feature = "lab5"))]
        println!(
            "Loading {} user apps (ELF, lab4 process model)...",
            NUM_APP
        );
        #[cfg(all(not(any(feature = "lab4", feature = "lab5")), any(feature = "lab3")))]
        println!(
            "Loading {} user apps (ELF, per-task address spaces)...",
            NUM_APP
        );
        for i in 0..NUM_APP {
            let elf = get_app_elf(i);
            let entry = elf_entry_point(elf);
            println!("  app {}: {} bytes ELF, entry {:#x}", i, elf.len(), entry);
        }
    }
}

pub fn get_app_entry(app_id: usize) -> usize {
    #[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
    {
        let _ = app_id;
        crate::config::APP_BASE_ADDRESS
    }
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
    {
        elf_entry_point(get_app_elf(app_id))
    }
}

#[cfg(not(any(feature = "lab4", feature = "lab5")))]
pub const NUM_APP: usize = 3;

#[cfg(any(feature = "lab4", feature = "lab5"))]
pub const NUM_APP: usize = 3;
