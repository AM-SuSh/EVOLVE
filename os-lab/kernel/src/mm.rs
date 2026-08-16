//! Virtual memory: kernel address space, per-task user spaces (lab3+).

#![allow(dead_code)]

use os_alloc::{
    frame_alloc_watermark, init_frame_allocator, set_frame_alloc_hook, PhysPageNum,
};
use os_vm::{MapArea, MapPermission, MemorySet, VirtAddr};

use crate::cell::SyncUnsafeCell;
use crate::config::{
    APP_BASE_ADDRESS, APP_REGION_SIZE, FRAME_POOL_START, MAX_PROCESS_NUM, MEMORY_END, PAGE_SIZE,
    USER_STACK_SIZE,
};
#[cfg(feature = "lab6")]
use crate::config::{VIRTIO_MMIO_BASE, VIRTIO_MMIO_SIZE};

static KERNEL_SPACE: SyncUnsafeCell<Option<MemorySet>> = SyncUnsafeCell::new(None);
static USER_SPACES: SyncUnsafeCell<[Option<MemorySet>; MAX_PROCESS_NUM]> =
    SyncUnsafeCell::new([const { None }; MAX_PROCESS_NUM]);
static PAGING_ENABLED: SyncUnsafeCell<bool> = SyncUnsafeCell::new(false);

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
    if !PAGING_ENABLED.with_ref(|enabled| *enabled) {
        return;
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

    let mut ks = MemorySet::new_bare();
    map_kernel_trap_regions(&mut ks);
    identity_map_allocated_frames(&mut ks);

    KERNEL_SPACE.with(|slot| {
        *slot = Some(ks);
    });
    PAGING_ENABLED.with(|enabled| *enabled = true);
    set_frame_alloc_hook(Some(on_frame_allocated));
    KERNEL_SPACE.with_ref(|slot| slot.as_ref().unwrap().activate());
}

pub fn kernel_space_mut() -> &'static mut MemorySet {
    // SAFETY: single-hart kernel; pointer valid for program lifetime.
    unsafe {
        (*KERNEL_SPACE.get_mut())
            .as_mut()
            .expect("mm not initialized")
    }
}

pub fn activate_kernel() {
    kernel_space_mut().activate();
}

pub fn space_is_free(space_id: usize) -> bool {
    assert!(space_id < MAX_PROCESS_NUM);
    USER_SPACES.with_ref(|spaces| spaces[space_id].is_none())
}

pub fn free_user_space(space_id: usize) {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();
    USER_SPACES.with(|spaces| {
        spaces[space_id] = None;
    });
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

    USER_SPACES.with(|spaces| {
        spaces[space_id] = Some(user_space);
    });
    #[cfg(feature = "trace-edu")]
    crate::trace::address_space(space_id, "create");
}

fn map_elf_and_stack(user_space: &mut MemorySet, elf: &[u8]) {
    user_space.map_elf_pt_load(elf, 0);

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
    USER_SPACES.with(|spaces| {
        let parent = spaces[parent_id]
            .as_ref()
            .expect("parent user space missing");
        let mut child_space = MemorySet::new_bare();
        map_kernel_trap_regions_user(&mut child_space);
        let user_end = APP_BASE_ADDRESS + APP_REGION_SIZE;
        copy_user_pages(parent, &mut child_space, APP_BASE_ADDRESS, user_end);
        spaces[child_id] = Some(child_space);
    });
}

/// Replace the current process user mappings with a fresh ELF image (exec).
pub fn replace_user_space(space_id: usize, elf: &'static [u8]) {
    replace_user_space_from_static(space_id, elf);
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
    USER_SPACES.with_ref(|spaces| {
        spaces[space_id]
            .as_ref()
            .expect("user space not created")
            .activate();
    });
}

pub fn user_token(space_id: usize) -> usize {
    USER_SPACES.with_ref(|spaces| {
        spaces[space_id]
            .as_ref()
            .expect("user space not created")
            .token()
    })
}

pub fn activate_current_user() {
    #[cfg(feature = "lab4")]
    let space_id = crate::process::current_space_id();
    #[cfg(not(feature = "lab4"))]
    let space_id = crate::task::current_app_id();
    activate_user(space_id);
}

/// Map VirtIO MMIO region into the kernel address space (lab6).
#[cfg(feature = "lab6")]
pub fn map_mmio_devices() {
    let ks = kernel_space_mut();
    ks.map_identical_region(
        VIRTIO_MMIO_BASE,
        VIRTIO_MMIO_BASE + VIRTIO_MMIO_SIZE,
        MapPermission::R.union(MapPermission::W),
    );
}

/// Translate a kernel virtual address to physical (for VirtIO DMA).
#[cfg(feature = "lab6")]
pub fn kernel_translate(va: usize) -> Option<usize> {
    kernel_space_mut().translate_va(va)
}

#[cfg(feature = "lab6")]
fn prot_to_perm(prot: usize) -> Option<MapPermission> {
    if prot == 0 || prot & !0x7 != 0 {
        return None;
    }
    let mut perm = MapPermission::U;
    if prot & 0x1 != 0 {
        perm = perm.union(MapPermission::R);
    }
    if prot & 0x2 != 0 {
        perm = perm.union(MapPermission::W);
    }
    if prot & 0x4 != 0 {
        perm = perm.union(MapPermission::X);
    }
    Some(perm)
}

#[cfg(feature = "lab6")]
fn with_current_user_space<R>(f: impl FnOnce(&mut MemorySet) -> R) -> R {
    activate_kernel();
    let space_id = crate::process::current_space_id();
    USER_SPACES.with(|spaces| {
        let space = spaces[space_id]
            .as_mut()
            .expect("current user space missing");
        f(space)
    })
}

/// Map anonymous pages at `addr` for `len` bytes with `prot` (Linux mmap prot bits).
#[cfg(feature = "lab6")]
pub fn sys_mmap(addr: usize, len: usize, prot: isize) -> isize {
    if prot < 0 {
        return -1;
    }
    if addr & (PAGE_SIZE - 1) != 0 {
        return -1;
    }
    let Some(perm) = prot_to_perm(prot as usize) else {
        return -1;
    };
    if len == 0 {
        return 0;
    }
    let Some(end) = addr.checked_add(len) else {
        return -1;
    };
    let page_end = (end + PAGE_SIZE - 1) & !(PAGE_SIZE - 1);
    if with_current_user_space(|space| space.map_anonymous(addr, page_end, perm)) {
        0
    } else {
        -1
    }
}

/// Unmap `[addr, addr+len)` previously mapped by mmap.
#[cfg(feature = "lab6")]
pub fn sys_munmap(addr: usize, len: usize) -> isize {
    if addr & (PAGE_SIZE - 1) != 0 {
        return -1;
    }
    if len == 0 {
        return 0;
    }
    let Some(end) = addr.checked_add(len) else {
        return -1;
    };
    let page_end = (end + PAGE_SIZE - 1) & !(PAGE_SIZE - 1);
    if with_current_user_space(|space| space.unmap_range(addr, page_end)) {
        0
    } else {
        -1
    }
}

/// Build user space from an owned ELF buffer (bytes copied into user pages; buffer freed).
#[cfg(feature = "lab6")]
pub fn create_user_space_from_elf(space_id: usize, elf: alloc::vec::Vec<u8>) {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();
    let mut user_space = MemorySet::new_bare();
    map_kernel_trap_regions_user(&mut user_space);
    map_elf_and_stack(&mut user_space, &elf);
    drop(elf);
    USER_SPACES.with(|spaces| {
        spaces[space_id] = Some(user_space);
    });
    #[cfg(feature = "trace-edu")]
    crate::trace::address_space(space_id, "create");
}

/// Replace the current process user mappings with a fresh ELF image (exec).
/// Reuses the existing page table and kernel trap regions; only unmaps the user
/// app slot (`APP_BASE`..`APP_BASE+APP_REGION`) so identity-mapped kernel pages
/// are not incorrectly deallocated.
pub fn replace_user_space_from_static(space_id: usize, elf: &'static [u8]) {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();
    let user_end = APP_BASE_ADDRESS + APP_REGION_SIZE;
    USER_SPACES.with(|spaces| {
        let space = match spaces[space_id].as_mut() {
            Some(s) => s,
            None => {
                let mut user_space = MemorySet::new_bare();
                map_kernel_trap_regions_user(&mut user_space);
                spaces[space_id] = Some(user_space);
                spaces[space_id].as_mut().unwrap()
            }
        };
        let _ = space.unmap_range(APP_BASE_ADDRESS, user_end);
        map_elf_and_stack(space, elf);
    });
}

/// Replace current process image from an owned ELF buffer.
#[cfg(feature = "lab6")]
pub fn replace_user_space_from_elf(space_id: usize, elf: alloc::vec::Vec<u8>) {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();
    let mut user_space = MemorySet::new_bare();
    map_kernel_trap_regions_user(&mut user_space);
    map_elf_and_stack(&mut user_space, &elf);
    drop(elf);
    USER_SPACES.with(|spaces| {
        spaces[space_id] = Some(user_space);
    });
}

/// Allocate a fresh user stack region for a new thread (lab8).
/// Returns `(user_sp, stack_region_start)`.
#[cfg(feature = "lab8")]
pub fn alloc_thread_user_stack(space_id: usize) -> Option<(usize, usize)> {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();
    let perm = MapPermission::U
        .union(MapPermission::R)
        .union(MapPermission::W);
    let stack_bytes = USER_STACK_SIZE * 2;
    USER_SPACES.with(|spaces| {
        let space = spaces[space_id].as_mut()?;
        let mut va = APP_BASE_ADDRESS + APP_REGION_SIZE - USER_STACK_SIZE;
        while va >= APP_BASE_ADDRESS + PAGE_SIZE {
            if space.translate(VirtAddr(va)).is_none() {
                let top = va + stack_bytes;
                if space.map_anonymous(va, top, perm) {
                    return Some((top - 16, va));
                }
                return None;
            }
            va = va.saturating_sub(stack_bytes);
        }
        None
    })
}

/// Unmap a thread stack region allocated by [`alloc_thread_user_stack`].
#[cfg(feature = "lab8")]
pub fn free_thread_user_stack(space_id: usize, stack_va: usize) {
    assert!(space_id < MAX_PROCESS_NUM);
    activate_kernel();
    let end = stack_va + USER_STACK_SIZE * 2;
    USER_SPACES.with(|spaces| {
        if let Some(space) = spaces[space_id].as_mut() {
            let _ = space.unmap_range(stack_va, end);
        }
    });
}
