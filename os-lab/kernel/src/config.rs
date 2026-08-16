//! Kernel configuration constants (lab2+).
//!
//! Constants for later labs (processes, fds, threads...) are intentionally
//! not feature-gated: in lab1/lab2 builds they are unused by design, so
//! dead_code is allowed at file level instead of sprinkling cfg everywhere.

#![allow(dead_code)]

pub const USER_STACK_SIZE: usize = 4096 * 2;
pub const KERNEL_STACK_SIZE: usize = 4096 * 2;
pub const MAX_APP_NUM: usize = 16;
/// Maximum concurrent processes (lab4+).
pub const MAX_PROCESS_NUM: usize = 16;
/// Embedded app index used as initproc (`fork_test` for lab4, `fs_test` for lab5).
pub const INITPROC_APP_ID: usize = 0;
/// Max open file descriptors per process (lab5+).
pub const MAX_FD: usize = 16;
/// Pipe ring buffer capacity in bytes (lab5+).
pub const PIPE_BUFFER_SIZE: usize = 256;
/// Max concurrent pipe instances (lab5+).
pub const MAX_PIPES: usize = 8;
/// Max child slots recorded per process.
pub const MAX_CHILDREN: usize = 8;
/// Max kernel threads (lab8+).
#[cfg(feature = "lab8")]
pub const MAX_THREADS: usize = 32;
pub const APP_BASE_ADDRESS: usize = 0x8040_0000;
pub const APP_REGION_SIZE: usize = 0x20_000;
pub const CLOCK_FREQ: usize = 12_500_000;
pub const TICKS_PER_SEC: usize = 100;

/// VirtIO block device MMIO (QEMU virt).
pub const VIRTIO_MMIO_BASE: usize = 0x1000_1000;
pub const VIRTIO_MMIO_SIZE: usize = 0x1000;

// lab3+ virtual memory layout
pub const MEMORY_END: usize = 0x8800_0000;
pub const PAGE_SIZE: usize = 4096;
/// Reserved low physical region (below the frame pool); kept out of the allocator.
pub const FRAME_ALLOC_START: usize = APP_BASE_ADDRESS + APP_REGION_SIZE;
/// Actual frame allocator start (above the user app slot).
pub const FRAME_POOL_START: usize = FRAME_ALLOC_START + 0x20_0000;
