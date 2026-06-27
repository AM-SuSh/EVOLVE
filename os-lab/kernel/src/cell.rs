//! Single-threaded global cell (avoids `static mut` references under Rust 2024).

#![allow(dead_code)]

use core::cell::UnsafeCell;

pub struct SyncUnsafeCell<T>(UnsafeCell<T>);

unsafe impl<T> Sync for SyncUnsafeCell<T> {}

impl<T> SyncUnsafeCell<T> {
    pub const fn new(value: T) -> Self {
        Self(UnsafeCell::new(value))
    }

    pub fn with<R>(&self, f: impl FnOnce(&mut T) -> R) -> R {
        // SAFETY: kernel is cooperatively scheduled on a single hart.
        unsafe { f(&mut *self.0.get()) }
    }

    pub fn with_ref<R>(&self, f: impl FnOnce(&T) -> R) -> R {
        // SAFETY: kernel is cooperatively scheduled on a single hart.
        unsafe { f(&*self.0.get()) }
    }

    pub fn get_mut(&self) -> *mut T {
        self.0.get()
    }
}
