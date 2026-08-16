//! Physical frame and heap allocators for the OS teaching lab (lab3+).
//!
//! | Component | Type | Role |
//! |-----------|------|------|
//! | Frame | `FrameAllocator` / `StackFrameAllocator` | Physical 4 KiB page frames (lab3 kernel) |
//! | Heap | `HeapAllocator` / `BumpAllocator` | Kernel heap bytes (lab5+; unit-tested in lab3) |
//!
//! Page size is fixed at 4096 bytes (`PAGE_SIZE`). Frame numbers (`PhysPageNum`) are
//! distinct from byte addresses: `addr = ppn << 12`.

#![no_std]

use core::alloc::Layout;
use core::cell::UnsafeCell;
use core::ptr::NonNull;

use linked_list_allocator::Heap;

struct SyncUnsafeCell<T>(UnsafeCell<T>);
unsafe impl<T> Sync for SyncUnsafeCell<T> {}

impl<T> SyncUnsafeCell<T> {
    const fn new(value: T) -> Self {
        Self(UnsafeCell::new(value))
    }

    fn with<R>(&self, f: impl FnOnce(&mut T) -> R) -> R {
        // SAFETY: kernel is single-threaded; host tests run single-threaded for global heap.
        unsafe { f(&mut *self.0.get()) }
    }
}

pub const PAGE_SIZE: usize = 4096;
pub const PAGE_SIZE_BITS: usize = 12;

const HEAP_SIZE: usize = 1024 * 1024;

/// Physical page number.
#[derive(Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PhysPageNum(pub usize);

impl PhysPageNum {
    pub fn addr(&self) -> usize {
        self.0 << PAGE_SIZE_BITS
    }

    pub fn from_addr(addr: usize) -> Self {
        Self(addr >> PAGE_SIZE_BITS)
    }
}

/// Physical frame allocator trait.
pub trait FrameAllocator {
    fn alloc_frame(&mut self) -> Option<PhysPageNum>;
    fn dealloc_frame(&mut self, ppn: PhysPageNum);
}

/// Simple stack-style frame allocator over a contiguous physical range.
pub struct StackFrameAllocator {
    current: usize,
    end: usize,
}

impl StackFrameAllocator {
    pub const fn empty() -> Self {
        Self { current: 0, end: 0 }
    }

    pub fn init(&mut self, start: usize, end: usize) {
        self.current = PhysPageNum::from_addr(start).0;
        self.end = PhysPageNum::from_addr(end).0;
    }
}

impl FrameAllocator for StackFrameAllocator {
    fn alloc_frame(&mut self) -> Option<PhysPageNum> {
        if self.current >= self.end {
            None
        } else {
            let ppn = PhysPageNum(self.current);
            self.current += 1;
            Some(ppn)
        }
    }

    fn dealloc_frame(&mut self, ppn: PhysPageNum) {
        if ppn.0 == self.current - 1 {
            self.current -= 1;
        }
    }
}

static FRAME_ALLOCATOR: SyncUnsafeCell<StackFrameAllocator> =
    SyncUnsafeCell::new(StackFrameAllocator::empty());
static FRAME_ALLOC_HOOK: SyncUnsafeCell<Option<fn(PhysPageNum)>> = SyncUnsafeCell::new(None);

pub fn init_frame_allocator(start: usize, end: usize) {
    FRAME_ALLOCATOR.with(|alloc| alloc.init(start, end));
}

/// Optional kernel hook invoked after each successful frame allocation (lab3+).
pub fn set_frame_alloc_hook(hook: Option<fn(PhysPageNum)>) {
    FRAME_ALLOC_HOOK.with(|slot| *slot = hook);
}

pub fn frame_alloc() -> Option<PhysPageNum> {
    let ppn = FRAME_ALLOCATOR.with(|alloc| alloc.alloc_frame())?;
    FRAME_ALLOC_HOOK.with(|hook| {
        if let Some(hook) = *hook {
            hook(ppn);
        }
    });
    Some(ppn)
}

pub fn frame_dealloc(ppn: PhysPageNum) {
    FRAME_ALLOCATOR.with(|alloc| alloc.dealloc_frame(ppn));
}

/// Next PPN that will be handed out (equals the number of frames already allocated).
pub fn frame_alloc_watermark() -> usize {
    FRAME_ALLOCATOR.with(|alloc| alloc.current)
}

static HEAP: SyncUnsafeCell<[u8; HEAP_SIZE]> = SyncUnsafeCell::new([0; HEAP_SIZE]);
static HEAP_ALLOCATOR: SyncUnsafeCell<Heap> = SyncUnsafeCell::new(Heap::empty());

/// Initialize the global heap. Called from kernel init in lab5+.
pub fn init_heap() {
    HEAP_ALLOCATOR.with(|alloc| unsafe {
        alloc.init(HEAP.with(|heap| heap.as_mut_ptr()), HEAP_SIZE);
    });
}

/// Allocate bytes from the global heap (lab5+ kernel use).
pub fn heap_alloc(layout: Layout) -> Option<*mut u8> {
    HEAP_ALLOCATOR.with(|alloc| {
        alloc
            .allocate_first_fit(layout)
            .ok()
            .map(|ptr| ptr.as_ptr())
    })
}

/// Deallocate bytes from the global heap (lab6+ when `Vec`/`Arc` drop).
pub fn heap_dealloc(ptr: *mut u8, layout: Layout) {
    if ptr.is_null() {
        return;
    }
    HEAP_ALLOCATOR.with(|alloc| unsafe {
        let _ = alloc.deallocate(NonNull::new_unchecked(ptr), layout);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::alloc::Layout;

    #[test]
    fn page_roundtrip() {
        let addr = 0x8020_1000;
        assert_eq!(PhysPageNum::from_addr(addr).addr(), addr);
        assert_eq!(PhysPageNum::from_addr(addr).0, 0x80201);
    }

    #[test]
    fn stack_frame_alloc_sequential() {
        let mut alloc = StackFrameAllocator::empty();
        alloc.init(0x1000, 0x1000 + PAGE_SIZE * 3);
        let a = alloc.alloc_frame().unwrap();
        let b = alloc.alloc_frame().unwrap();
        assert_eq!(b.0, a.0 + 1);
    }

    #[test]
    fn stack_frame_dealloc_lifo_only() {
        let mut alloc = StackFrameAllocator::empty();
        alloc.init(0x1000, 0x1000 + PAGE_SIZE * 3);
        let a = alloc.alloc_frame().unwrap();
        let b = alloc.alloc_frame().unwrap();
        // Deallocating non-top frame is ignored.
        alloc.dealloc_frame(a);
        let c = alloc.alloc_frame().unwrap();
        assert_eq!(c.0, b.0 + 1);
        // Deallocating top frame allows reuse.
        alloc.dealloc_frame(c);
        assert_eq!(alloc.alloc_frame().unwrap().0, c.0);
    }

    #[test]
    fn global_heap_alloc() {
        init_heap();
        let p = heap_alloc(Layout::from_size_align(64, 8).unwrap());
        assert!(p.is_some());
        assert_eq!(p.unwrap() as usize % 8, 0);
    }
}
