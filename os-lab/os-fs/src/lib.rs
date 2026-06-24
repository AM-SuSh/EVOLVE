//! Embedded read-only file system for the OS teaching lab (lab5).
//!
//! This crate provides a **host-testable** static file table. The kernel fd layer
//! lives in `kernel/src/fs.rs` (member A); contents here must stay aligned with
//! the kernel's embedded `testfile` for consistent QEMU `fs_test` behaviour.

#![no_std]

/// Index into the static file table.
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub struct FileId(pub usize);

/// Default embedded files (aligned with `kernel/src/fs.rs`).
pub const DEFAULT_FILES: &[(&str, &[u8])] = &[("testfile", b"Hello from testfile!\n")];

/// Read-only file system backed by a compile-time static table.
pub struct EmbeddedFs {
    files: &'static [(&'static str, &'static [u8])],
}

impl EmbeddedFs {
    pub const fn new(files: &'static [(&'static str, &'static [u8])]) -> Self {
        Self { files }
    }

    pub const fn default_fs() -> Self {
        Self::new(DEFAULT_FILES)
    }

    pub fn open(&self, path: &str) -> Option<FileId> {
        self.files
            .iter()
            .position(|(name, _)| *name == path)
            .map(FileId)
    }

    pub fn size(&self, id: FileId) -> usize {
        self.files.get(id.0).map(|(_, data)| data.len()).unwrap_or(0)
    }

    /// Read up to `buf.len()` bytes at `offset`. Returns bytes copied (0 at EOF).
    pub fn read_at(&self, id: FileId, offset: usize, buf: &mut [u8]) -> usize {
        let Some((_, data)) = self.files.get(id.0) else {
            return 0;
        };
        if offset >= data.len() {
            return 0;
        }
        let n = buf.len().min(data.len() - offset);
        buf[..n].copy_from_slice(&data[offset..offset + n]);
        n
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_existing_file() {
        let fs = EmbeddedFs::default_fs();
        assert!(fs.open("testfile").is_some());
    }

    #[test]
    fn open_missing_returns_none() {
        let fs = EmbeddedFs::default_fs();
        assert!(fs.open("no_such_file").is_none());
    }

    #[test]
    fn read_at_returns_content() {
        let fs = EmbeddedFs::default_fs();
        let id = fs.open("testfile").unwrap();
        let mut buf = [0u8; 64];
        let n = fs.read_at(id, 0, &mut buf);
        assert_eq!(n, b"Hello from testfile!\n".len());
        assert_eq!(&buf[..n], b"Hello from testfile!\n");
    }

    #[test]
    fn read_past_eof_returns_zero() {
        let fs = EmbeddedFs::default_fs();
        let id = fs.open("testfile").unwrap();
        let mut buf = [0u8; 8];
        let n = fs.read_at(id, fs.size(id), &mut buf);
        assert_eq!(n, 0);
    }
}
