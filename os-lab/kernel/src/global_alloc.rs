//! Global allocator backed by `os_alloc` linked-list heap (lab6+).

use core::alloc::{GlobalAlloc, Layout};

struct KernelAllocator;

unsafe impl GlobalAlloc for KernelAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        os_alloc::heap_alloc(layout).unwrap_or(core::ptr::null_mut())
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        os_alloc::heap_dealloc(ptr, layout);
    }
}

#[global_allocator]
static ALLOCATOR: KernelAllocator = KernelAllocator;
