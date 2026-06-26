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

use core::cell::UnsafeCell;

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

const HEAP_SIZE: usize = 32 * 1024;

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

/// Kernel heap allocator trait (byte-granularity).
pub trait HeapAllocator {
    fn alloc(&mut self, layout: core::alloc::Layout) -> Option<*mut u8>;
    fn dealloc(&mut self, _ptr: *mut u8, _layout: core::alloc::Layout) {
        // Bump allocator does not support individual deallocation.
    }
}

/// Bump allocator over a fixed byte buffer. Teaching simplification for lab3+.
pub struct BumpAllocator {
    heap_start: usize,
    heap_end: usize,
    current: usize,
}

impl BumpAllocator {
    pub const fn empty() -> Self {
        Self {
            heap_start: 0,
            heap_end: 0,
            current: 0,
        }
    }

    pub fn init(&mut self, start: usize, size: usize) {
        self.heap_start = start;
        self.heap_end = start + size;
        self.current = start;
    }
}

impl HeapAllocator for BumpAllocator {
    fn alloc(&mut self, layout: core::alloc::Layout) -> Option<*mut u8> {
        let align = layout.align();
        let size = layout.size();
        let aligned = (self.current + align - 1) & !(align - 1);
        let next = aligned.checked_add(size)?;
        if next > self.heap_end {
            None
        } else {
            self.current = next;
            Some(aligned as *mut u8)
        }
    }
}

static HEAP: SyncUnsafeCell<[u8; HEAP_SIZE]> = SyncUnsafeCell::new([0; HEAP_SIZE]);
static HEAP_ALLOCATOR: SyncUnsafeCell<BumpAllocator> = SyncUnsafeCell::new(BumpAllocator::empty());

/// Initialize the global bump heap. Called from kernel init in lab5+.
pub fn init_heap() {
    let start = HEAP.with(|heap| heap.as_ptr() as usize);
    HEAP_ALLOCATOR.with(|alloc| alloc.init(start, HEAP_SIZE));
}

/// Allocate bytes from the global heap (lab5+ kernel use).
pub fn heap_alloc(layout: core::alloc::Layout) -> Option<*mut u8> {
    HEAP_ALLOCATOR.with(|alloc| alloc.alloc(layout))
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
    fn bump_alloc_aligned() {
        let mut heap = BumpAllocator::empty();
        let mut buf = [0u8; 256];
        let start = buf.as_mut_ptr() as usize;
        heap.init(start, buf.len());
        let p = heap.alloc(Layout::from_size_align(8, 8).unwrap()).unwrap();
        assert_eq!(p as usize % 8, 0);
        let p2 = heap.alloc(Layout::from_size_align(16, 16).unwrap()).unwrap();
        assert_eq!(p2 as usize % 16, 0);
    }

    #[test]
    fn bump_alloc_exhausted() {
        let mut heap = BumpAllocator::empty();
        let mut buf = [0u8; 32];
        let start = buf.as_mut_ptr() as usize;
        heap.init(start, buf.len());
        let _ = heap.alloc(Layout::from_size_align(24, 8).unwrap()).unwrap();
        assert!(heap.alloc(Layout::from_size_align(16, 8).unwrap()).is_none());
    }

    #[test]
    fn global_heap_alloc() {
        init_heap();
        let p = heap_alloc(Layout::from_size_align(64, 8).unwrap());
        assert!(p.is_some());
        assert_eq!(p.unwrap() as usize % 8, 0);
    }
}
