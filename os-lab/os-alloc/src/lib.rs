//! Physical frame allocator for the OS teaching lab (lab3+).

#![no_std]

pub const PAGE_SIZE: usize = 4096;
pub const PAGE_SIZE_BITS: usize = 12;

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

static mut FRAME_ALLOCATOR: StackFrameAllocator = StackFrameAllocator::empty();

pub fn init_frame_allocator(start: usize, end: usize) {
    unsafe {
        FRAME_ALLOCATOR.init(start, end);
    }
}

pub fn frame_alloc() -> Option<PhysPageNum> {
    unsafe { FRAME_ALLOCATOR.alloc_frame() }
}

pub fn frame_dealloc(ppn: PhysPageNum) {
    unsafe { FRAME_ALLOCATOR.dealloc_frame(ppn) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_roundtrip() {
        let addr = 0x8020_1000;
        assert_eq!(PhysPageNum::from_addr(addr).addr(), addr);
    }
}
