//! Disk-oriented file system types for host testing (lab6+).
//!
//! Mirrors the easy-fs on-disk layout at a teaching level: fixed-size blocks,
//! directory entries, and inode metadata. The kernel uses `tg-rcore-tutorial-easy-fs`
//! directly; this module lets member B validate block-device semantics on the host.

/// Block size used by easy-fs (512 bytes).
pub const BLOCK_SZ: usize = 512;

/// Maximum file name length in a directory entry (easy-fs uses 27 + NUL).
pub const DIR_NAME_LEN: usize = 27;

/// Max blocks in [`MockBlockDevice`] (sufficient for host unit tests).
pub const MOCK_BLOCK_CAP: usize = 16;

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
    blocks: [[u8; BLOCK_SZ]; MOCK_BLOCK_CAP],
    len: usize,
}

impl MockBlockDevice {
    pub fn new(num_blocks: usize) -> Self {
        assert!(num_blocks <= MOCK_BLOCK_CAP);
        Self {
            blocks: [[0u8; BLOCK_SZ]; MOCK_BLOCK_CAP],
            len: num_blocks,
        }
    }

    pub fn num_blocks(&self) -> usize {
        self.len
    }

    pub fn read_block(&self, block_id: usize, buf: &mut [u8]) -> bool {
        if buf.len() != BLOCK_SZ {
            return false;
        }
        if block_id >= self.len {
            return false;
        }
        buf.copy_from_slice(&self.blocks[block_id]);
        true
    }

    pub fn write_block(&mut self, block_id: usize, buf: &[u8]) -> bool {
        if buf.len() != BLOCK_SZ {
            return false;
        }
        if block_id >= self.len {
            return false;
        }
        self.blocks[block_id].copy_from_slice(buf);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
