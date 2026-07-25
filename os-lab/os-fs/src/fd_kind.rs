//! Unified fd kind and read/write dispatch rules (lab7 host tests).
//!
//! Mirrors `kernel/src/fs/disk.rs` `FdType` matching logic for member B host validation.

/// File descriptor kind (regular file or pipe end).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FdKind {
    Regular,
    PipeRead,
    PipeWrite,
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FdOp {
    Ok,
    BadFd,
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
