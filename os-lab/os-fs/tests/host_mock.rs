//! Host-side teaching mocks for block-device and fd-dispatch semantics.
//!
//! These mirror the easy-fs on-disk layout (fixed-size blocks, directory
//! entries, inode metadata) and `kernel/src/fs/disk.rs`'s `FdType` dispatch
//! at a teaching level. The kernel uses `tg-rcore-tutorial-easy-fs` directly;
//! these types exist only for host validation, so they live in `tests/`
//! instead of the published library surface.

/// Block size used by easy-fs (512 bytes).
pub const BLOCK_SZ: usize = 512;

/// Maximum file name length in a directory entry (easy-fs uses 27 + NUL).
pub const DIR_NAME_LEN: usize = 27;

/// Directory entry layout (name + inode number).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DirEntry {
    pub name: [u8; DIR_NAME_LEN],
    pub inode_id: u32,
}

impl DirEntry {
    pub const fn empty() -> Self {
        Self {
            name: [0; DIR_NAME_LEN],
            inode_id: 0,
        }
    }

    pub fn from_name(name: &str, inode_id: u32) -> Option<Self> {
        if name.is_empty() || name.len() > DIR_NAME_LEN {
            return None;
        }
        let mut entry = Self::empty();
        entry.name[..name.len()].copy_from_slice(name.as_bytes());
        entry.inode_id = inode_id;
        Some(entry)
    }

    pub fn name_str(&self) -> &str {
        let end = self
            .name
            .iter()
            .position(|&b| b == 0)
            .unwrap_or(DIR_NAME_LEN);
        core::str::from_utf8(&self.name[..end]).unwrap_or("")
    }
}

/// Inode metadata exposed to `fstat` (subset of on-disk inode fields).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InodeMeta {
    pub ino: u64,
    pub nlink: u32,
    pub size: u32,
    pub is_dir: bool,
}

impl InodeMeta {
    pub const fn file(ino: u64) -> Self {
        Self {
            ino,
            nlink: 1,
            size: 0,
            is_dir: false,
        }
    }
}

/// In-memory block device for host unit tests (same block size as VirtIO/easy-fs).
pub struct MockBlockDevice {
    blocks: Vec<[u8; BLOCK_SZ]>,
}

impl MockBlockDevice {
    pub fn new(num_blocks: usize) -> Self {
        Self {
            blocks: vec![[0u8; BLOCK_SZ]; num_blocks],
        }
    }

    pub fn num_blocks(&self) -> usize {
        self.blocks.len()
    }

    pub fn read_block(&self, block_id: usize, buf: &mut [u8]) -> bool {
        if buf.len() != BLOCK_SZ {
            return false;
        }
        let Some(block) = self.blocks.get(block_id) else {
            return false;
        };
        buf.copy_from_slice(block);
        true
    }

    pub fn write_block(&mut self, block_id: usize, buf: &[u8]) -> bool {
        if buf.len() != BLOCK_SZ {
            return false;
        }
        let Some(block) = self.blocks.get_mut(block_id) else {
            return false;
        };
        block.copy_from_slice(buf);
        true
    }
}

/// File descriptor kind (regular file or pipe end).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FdKind {
    Regular,
    PipeRead,
    PipeWrite,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FdOp {
    Ok,
    BadFd,
}

impl FdKind {
    pub const fn allows_read(self) -> bool {
        matches!(self, Self::Regular | Self::PipeRead)
    }

    pub const fn allows_write(self) -> bool {
        matches!(self, Self::Regular | Self::PipeWrite)
    }

    pub const fn dispatch_read(self) -> FdOp {
        if self.allows_read() {
            FdOp::Ok
        } else {
            FdOp::BadFd
        }
    }

    pub const fn dispatch_write(self) -> FdOp {
        if self.allows_write() {
            FdOp::Ok
        } else {
            FdOp::BadFd
        }
    }
}

#[test]
fn dir_entry_round_trip() {
    let entry = DirEntry::from_name("filea", 3).unwrap();
    assert_eq!(entry.name_str(), "filea");
    assert_eq!(entry.inode_id, 3);
}

#[test]
fn dir_entry_rejects_long_name() {
    let long = "a".repeat(DIR_NAME_LEN + 1);
    assert!(DirEntry::from_name(&long, 1).is_none());
}

#[test]
fn mock_block_device_read_write() {
    let mut dev = MockBlockDevice::new(4);
    let mut write_buf = [0u8; BLOCK_SZ];
    write_buf[0] = 0xAB;
    assert!(dev.write_block(2, &write_buf));
    let mut read_buf = [0u8; BLOCK_SZ];
    assert!(dev.read_block(2, &mut read_buf));
    assert_eq!(read_buf[0], 0xAB);
    assert!(!dev.read_block(9, &mut read_buf));
}

#[test]
fn inode_meta_defaults() {
    let meta = InodeMeta::file(7);
    assert_eq!(meta.ino, 7);
    assert_eq!(meta.nlink, 1);
    assert!(!meta.is_dir);
}

#[test]
fn regular_rw() {
    assert_eq!(FdKind::Regular.dispatch_read(), FdOp::Ok);
    assert_eq!(FdKind::Regular.dispatch_write(), FdOp::Ok);
}

#[test]
fn pipe_ends_are_exclusive() {
    assert_eq!(FdKind::PipeRead.dispatch_read(), FdOp::Ok);
    assert_eq!(FdKind::PipeRead.dispatch_write(), FdOp::BadFd);
    assert_eq!(FdKind::PipeWrite.dispatch_write(), FdOp::Ok);
    assert_eq!(FdKind::PipeWrite.dispatch_read(), FdOp::BadFd);
}

#[test]
fn dup_shares_kind() {
    let original = FdKind::PipeWrite;
    let duped = original;
    assert_eq!(original.dispatch_write(), duped.dispatch_write());
}
