//! VirtIO block device driver for easy-fs (lab6).

use alloc::sync::Arc;
use core::ptr::NonNull;
use spin::Lazy;

use easy_fs::BlockDevice;
use os_alloc::{frame_alloc, frame_dealloc, PhysPageNum, PAGE_SIZE};
use virtio_drivers::{Hal, MmioTransport, VirtIOBlk, VirtIOHeader};

use crate::config::VIRTIO_MMIO_BASE;
use crate::mm;

/// Global block device (lazy init on first access).
pub static BLOCK_DEVICE: Lazy<Arc<VirtIOBlock>> = Lazy::new(|| {
    Arc::new(VirtIOBlock {
        inner: spin::Mutex::new(
            VirtIOBlk::new(
                unsafe {
                    MmioTransport::new(
                        NonNull::new(VIRTIO_MMIO_BASE as *mut VirtIOHeader)
                            .expect("virtio mmio null"),
                    )
                }
                .expect("virtio mmio transport"),
            )
            .expect("virtio blk"),
        ),
    })
});

pub(crate) struct VirtIOBlock {
    inner: spin::Mutex<VirtIOBlk<VirtioHal, MmioTransport>>,
}

unsafe impl Send for VirtIOBlock {}
unsafe impl Sync for VirtIOBlock {}

impl BlockDevice for VirtIOBlock {
    fn read_block(&self, block_id: usize, buf: &mut [u8]) {
        self.inner
            .lock()
            .read_block(block_id, buf)
            .expect("virtio read_block");
    }

    fn write_block(&self, block_id: usize, buf: &[u8]) {
        self.inner
            .lock()
            .write_block(block_id, buf)
            .expect("virtio write_block");
    }
}

struct VirtioHal;

impl Hal for VirtioHal {
    fn dma_alloc(pages: usize) -> usize {
        let first = frame_alloc().expect("out of frames for virtio dma");
        let base = first.addr();
        for i in 1..pages {
            let ppn = frame_alloc().expect("out of frames for virtio dma");
            assert_eq!(ppn.addr(), base + i * PAGE_SIZE, "virtio dma not contiguous");
        }
        base
    }

    fn dma_dealloc(paddr: usize, pages: usize) -> i32 {
        let start = PhysPageNum::from_addr(paddr);
        for i in 0..pages {
            frame_dealloc(PhysPageNum(start.0 + i));
        }
        0
    }

    fn phys_to_virt(paddr: usize) -> usize {
        paddr
    }

    fn virt_to_phys(vaddr: usize) -> usize {
        mm::kernel_translate(vaddr).unwrap_or(vaddr)
    }
}
