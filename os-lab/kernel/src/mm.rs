//! Virtual memory: kernel address space and user app mapping (lab3+).

use os_alloc::{init_frame_allocator, PAGE_SIZE};
use os_vm::{MapArea, MapPermission, MemorySet, VirtAddr};

use crate::config::{self, FRAME_ALLOC_START, MEMORY_END, PHYS_MEM_MAP_SIZE};

static mut KERNEL_SPACE: Option<MemorySet> = None;

pub fn init() {
    extern "C" {
        fn stext();
        fn ekernel();
        fn boot_stack();
        fn boot_stack_top();
    }

    let mem_start = FRAME_ALLOC_START;
    init_frame_allocator(mem_start, MEMORY_END);

    let mut kernel_space = MemorySet::new_bare();
    let kperm = MapPermission::R
        .union(MapPermission::W)
        .union(MapPermission::X);

    // Linker script: kernel image then dedicated boot stack below the user app region.
    kernel_space.map_identical_region(stext as *const () as usize, ekernel as *const () as usize, kperm);
    kernel_space.map_identical_region(
        boot_stack as *const () as usize,
        boot_stack_top as *const () as usize,
        kperm,
    );
    // Identity window so frame_alloc() addresses stay valid after satp is enabled.
    kernel_space.map_identical_region(
        mem_start,
        mem_start + PHYS_MEM_MAP_SIZE,
        MapPermission::R.union(MapPermission::W),
    );

    unsafe {
        KERNEL_SPACE = Some(kernel_space);
    }
}

pub fn kernel_space_mut() -> &'static mut MemorySet {
    unsafe { KERNEL_SPACE.as_mut().expect("mm not initialized") }
}

pub fn activate_kernel() {
    kernel_space_mut().activate();
}

pub fn ensure_paging() {
    static mut ENABLED: bool = false;
    unsafe {
        if !ENABLED {
            kernel_space_mut().activate();
            ENABLED = true;
        }
    }
}

/// Map one user app binary and its stack into the shared kernel page table.
pub fn map_user_app(bin: &'static [u8]) {
    let ks = kernel_space_mut();
    let app_start = config::APP_BASE_ADDRESS;

    if let Some(pa) = ks.translate_va(app_start) {
        unsafe {
            core::ptr::copy_nonoverlapping(bin.as_ptr(), pa as *mut u8, bin.len());
            core::arch::asm!("fence.i");
        }
        return;
    }

    let app_end = app_start + bin.len();
    ks.map_area(
        MapArea::new(
            VirtAddr(app_start).floor(),
            VirtAddr(app_end + PAGE_SIZE - 1).ceil(),
            MapPermission::U
                .union(MapPermission::R)
                .union(MapPermission::W)
                .union(MapPermission::X),
        )
        .with_data(bin, 0),
    );

    let stack_bottom = config::APP_BASE_ADDRESS + config::APP_REGION_SIZE - config::USER_STACK_SIZE;
    let stack_top = config::APP_BASE_ADDRESS + config::APP_REGION_SIZE;
    ks.map_area(MapArea::new(
        VirtAddr(stack_bottom).floor(),
        VirtAddr(stack_top).ceil(),
        MapPermission::U
            .union(MapPermission::R)
            .union(MapPermission::W),
    ));
}
