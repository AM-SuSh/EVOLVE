//! Physical frame and heap allocators (lab3+).

#![no_std]

/// Physical frame allocator trait placeholder for lab3+.
pub trait FrameAllocator {
    fn alloc_frame(&mut self) -> Option<usize>;
    fn dealloc_frame(&mut self, ppn: usize);
}
