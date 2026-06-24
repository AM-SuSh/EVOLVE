//! Virtual memory: kernel address space, per-task user spaces (lab3+).

use os_alloc::{
    frame_alloc_watermark, init_frame_allocator, set_frame_alloc_hook, PhysPageNum,
};
use os_vm::{elf_map_areas, MapArea, MapPermission, MemorySet, VirtAddr};

use crate::config::{
    APP_BASE_ADDRESS, APP_REGION_SIZE, FRAME_POOL_START, MAX_PROCESS_NUM, MEMORY_END, PAGE_SIZE,
    USER_STACK_SIZE,
};

static mut KERNEL_SPACE: Option<MemorySet> = None;
static mut USER_SPACES: [Option<MemorySet>; MAX_PROCESS_NUM] = [const { None }; MAX_PROCESS_NUM];
static mut PAGING_ENABLED: bool = false;

extern "C" {
    fn stext();
    fn ekernel();
}

fn kernel_perm() -> MapPermission {
    MapPermission::R
        .union(MapPermission::W)
        .union(MapPermission::X)
}

/// Kernel image, boot stack, and all kernel `.bss` (including crate statics past `ekernel`).
fn map_kernel_trap_regions(ms: &mut MemorySet) {
    let kperm = kernel_perm();
    ms.map_identical_region(stext as *const () as usize, FRAME_POOL_START, kperm);
}

/// Like [`map_kernel_trap_regions`], but leaves the user app slot unmapped so ELF
/// segments get private frames instead of sharing identity-mapped physical pages.
fn map_kernel_trap_regions_user(ms: &mut MemorySet) {
    let kperm = kernel_perm();
    let st = stext as *const () as usize;
    let ek = ekernel as *const () as usize;
    ms.map_identical_region(st, ek, kperm);
    if ek < APP_BASE_ADDRESS {
        ms.map_identical_region(ek, APP_BASE_ADDRESS, kperm);
    }
    ms.map_identical_region(APP_BASE_ADDRESS + APP_REGION_SIZE, FRAME_POOL_START, kperm);
}

fn on_frame_allocated(ppn: PhysPageNum) {
    unsafe {
        if !PAGING_ENABLED {
            return;
        }
    }
    let va = ppn.addr();
    let ks = kernel_space_mut();
    if ks.translate_va(va).is_none() {
        ks.map_identical_region(va, va + PAGE_SIZE, MapPermission::R.union(MapPermission::W));
    }
}

fn identity_map_allocated_frames(ks: &mut MemorySet) {
    let start = PhysPageNum::from_addr(FRAME_POOL_START).0;
    let mut end = frame_alloc_watermark();
    loop {
        for ppn in start..end {
            let va = PhysPageNum(ppn).addr();
            if ks.translate_va(va).is_none() {
                ks.map_identical_region(va, va + PAGE_SIZE, MapPermission::R.union(MapPermission::W));
            }
        }
        let new_end = frame_alloc_watermark();
        if new_end == end {
            break;
        }
        end = new_end;
    }
}

pub fn init() {
    init_frame_allocator(FRAME_POOL_START, MEMORY_END);

    let mut kernel_space = MemorySet::new_bare();
    map_kernel_trap_regions(&mut kernel_space);
    identity_map_allocated_frames(&mut kernel_space);

    unsafe {
        KERNEL_SPACE = Some(kernel_space);
        PAGING_ENABLED = true;
        set_frame_alloc_hook(Some(on_frame_allocated));
        KERNEL_SPACE.as_ref().unwrap().activate();
    }
}

pub fn kernel_space_mut() -> &'static mut MemorySet {
    unsafe { KERNEL_SPACE.as_mut().expect("mm not initialized") }
}

pub fn activate_kernel() {
    kernel_space_mut().activate();
}

pub fn space_is_free(space_id: usize) -> bool {
    assert!(space_id < MAX_PROCESS_NUM);
    unsafe { USER_SPACES[space_id].is_none() }
}

pub fn free_user_space(space_id: usize) {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();
    unsafe {
        USER_SPACES[space_id] = None;
    }
}

/// ELF64 entry point (absolute virtual address from the user linker script).
pub fn elf_entry_point(elf: &[u8]) -> usize {
    assert!(elf.len() >= 32, "ELF too small");
    usize::from_le_bytes(elf[24..32].try_into().unwrap())
}

/// Build an isolated user address space: kernel trap regions + ELF PT_LOAD + user stack.
pub fn create_user_space(space_id: usize, elf: &'static [u8]) {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();

    let mut user_space = MemorySet::new_bare();
    map_kernel_trap_regions_user(&mut user_space);

    map_elf_and_stack(&mut user_space, elf);

    unsafe {
        USER_SPACES[space_id] = Some(user_space);
    }
}

fn map_elf_and_stack(user_space: &mut MemorySet, elf: &'static [u8]) {
    let parsed = elf_map_areas(elf, 0);
    for area in parsed.areas.iter().take(parsed.count) {
        user_space.map_area(area.clone());
    }

    let stack_bottom = APP_BASE_ADDRESS + APP_REGION_SIZE - USER_STACK_SIZE;
    // User stack only (guard page at APP_BASE+APP_REGION stays unmapped).
    let stack_top = APP_BASE_ADDRESS + APP_REGION_SIZE;
    user_space.map_area(MapArea::new(
        VirtAddr(stack_bottom).floor(),
        VirtAddr(stack_top).ceil(),
        MapPermission::U
            .union(MapPermission::R)
            .union(MapPermission::W),
    ));
}

/// Deep-copy user pages (U) from parent; kernel trap regions are rebuilt identically.
pub fn fork_user_space(parent_id: usize, child_id: usize) {
    assert!(parent_id < MAX_PROCESS_NUM && child_id < MAX_PROCESS_NUM);
    activate_kernel();
    let parent = unsafe {
        USER_SPACES[parent_id]
            .as_ref()
            .expect("parent user space missing")
    };

    let mut child_space = MemorySet::new_bare();
    map_kernel_trap_regions_user(&mut child_space);

    let user_end = APP_BASE_ADDRESS + APP_REGION_SIZE;
    copy_user_pages(parent, &mut child_space, APP_BASE_ADDRESS, user_end);

    unsafe {
        USER_SPACES[child_id] = Some(child_space);
    }
}

/// Replace the current process user mappings with a fresh ELF image (exec).
pub fn replace_user_space(space_id: usize, elf: &'static [u8]) {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();
    let mut user_space = MemorySet::new_bare();
    map_kernel_trap_regions_user(&mut user_space);
    map_elf_and_stack(&mut user_space, elf);
    unsafe {
        USER_SPACES[space_id] = Some(user_space);
    }
}

fn copy_user_pages(parent: &MemorySet, child: &mut MemorySet, start: usize, end: usize) {
    let mut va = start & !(PAGE_SIZE - 1);
    while va < end {
        if let Some(perm) = parent.leaf_perm(va) {
            if perm.contains(MapPermission::U) {
                let src_ppn = parent
                    .translate(VirtAddr(va))
                    .expect("user page missing in parent");
                let dst_ppn = os_alloc::frame_alloc().expect("out of frames for fork");
                let src = src_ppn.addr() as *const u8;
                let dst = dst_ppn.addr() as *mut u8;
                unsafe {
                    core::ptr::copy_nonoverlapping(src, dst, PAGE_SIZE);
                }
                child.page_table_mut().map(
                    VirtAddr(va).floor(),
                    dst_ppn,
                    perm,
                );
            }
        }
        va += PAGE_SIZE;
    }
}

pub fn activate_user(space_id: usize) {
    unsafe {
        USER_SPACES[space_id]
            .as_ref()
            .expect("user space not created")
            .activate();
    }
}

pub fn user_token(space_id: usize) -> usize {
    unsafe {
        USER_SPACES[space_id]
            .as_ref()
            .expect("user space not created")
            .token()
    }
}

pub fn activate_current_user() {
    #[cfg(feature = "lab4")]
    let space_id = crate::process::current_space_id();
    #[cfg(not(feature = "lab4"))]
    let space_id = crate::task::current_app_id();
    activate_user(space_id);
}
