//! Kernel configuration constants (lab2+).

pub const USER_STACK_SIZE: usize = 4096 * 2;
pub const KERNEL_STACK_SIZE: usize = 4096 * 2;
pub const MAX_APP_NUM: usize = 16;
/// Maximum concurrent processes (lab4+).
pub const MAX_PROCESS_NUM: usize = 16;
/// Embedded app index used as initproc for lab4 (`fork_test`).
pub const INITPROC_APP_ID: usize = 0;
/// Max child slots recorded per process.
pub const MAX_CHILDREN: usize = 8;
pub const APP_BASE_ADDRESS: usize = 0x8040_0000;
pub const APP_REGION_SIZE: usize = 0x20_000;
pub const CLOCK_FREQ: usize = 12_500_000;
pub const TICKS_PER_SEC: usize = 100;

// lab3+ virtual memory layout
pub const MEMORY_END: usize = 0x8800_0000;
pub const PAGE_SIZE: usize = 4096;
/// Reserved low physical region (below the frame pool); kept out of the allocator.
pub const FRAME_ALLOC_START: usize = APP_BASE_ADDRESS + APP_REGION_SIZE;
/// Actual frame allocator start (above the user app slot).
pub const FRAME_POOL_START: usize = FRAME_ALLOC_START + 0x20_0000;
pub const TRAMPOLINE: usize = usize::MAX - PAGE_SIZE + 1;
pub const TRAP_CONTEXT: usize = TRAMPOLINE - PAGE_SIZE;
