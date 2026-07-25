//! Blocking synchronization primitives for lab8+.
//!
//! Thread identifiers are plain `usize` values assigned by the kernel scheduler.
//! `lock`/`down` return `false` when the caller must block; `unlock`/`up`/`signal`
//! return the `tid` of a thread to re-enqueue, if any.

#![no_std]

mod condvar;
mod mutex;
mod semaphore;
mod wait_queue;

pub use condvar::Condvar;
pub use mutex::{MutexBlocking, MutexTrait};
pub use semaphore::Semaphore;

/// Kernel thread identifier (matches scheduler `tid`).
pub type ThreadId = usize;
