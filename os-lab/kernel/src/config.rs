//! Kernel configuration constants (lab2+).

pub const USER_STACK_SIZE: usize = 4096 * 2;
pub const KERNEL_STACK_SIZE: usize = 4096 * 2;
pub const MAX_APP_NUM: usize = 16;
pub const APP_BASE_ADDRESS: usize = 0x8040_0000;
pub const APP_REGION_SIZE: usize = 0x20_000;
pub const CLOCK_FREQ: usize = 12_500_000;
pub const TICKS_PER_SEC: usize = 100;
