//! Page tables and virtual memory management (lab3+).

#![no_std]

/// Page table trait placeholder for lab3+.
pub trait PageTable {
    fn map(&mut self, vpn: usize, ppn: usize);
    fn unmap(&mut self, vpn: usize);
}
