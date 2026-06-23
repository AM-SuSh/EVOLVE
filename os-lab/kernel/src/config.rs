//! Kernel configuration constants (lab2+).

pub const USER_STACK_SIZE: usize = 4096 * 2;
pub const KERNEL_STACK_SIZE: usize = 4096 * 2;
pub const MAX_APP_NUM: usize = 16;
pub const APP_BASE_ADDRESS: usize = 0x8040_0000;
pub const APP_REGION_SIZE: usize = 0x20_000;
pub const CLOCK_FREQ: usize = 12_500_000;
pub const TICKS_PER_SEC: usize = 100;

// lab3+ virtual memory layout
pub const MEMORY_END: usize = 0x8800_0000;
pub const PAGE_SIZE: usize = 4096;
/// Identity-mapped physical window for frame access after paging is on.
pub const PHYS_MEM_MAP_SIZE: usize = 0x10_0000;
/// First physical page available to the frame allocator (after user app slots).
pub const FRAME_ALLOC_START: usize = APP_BASE_ADDRESS + APP_REGION_SIZE;
pub const TRAMPOLINE: usize = usize::MAX - PAGE_SIZE + 1;
pub const TRAP_CONTEXT: usize = TRAMPOLINE - PAGE_SIZE;
