//! Simple file system abstractions (lab5).

#![no_std]

/// File system trait placeholder for lab5.
pub trait FileSystem {
    fn open(&mut self, path: &str) -> Option<usize>;
    fn close(&mut self, fd: usize);
}
