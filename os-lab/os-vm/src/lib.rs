//! Sv39 page tables and address spaces for the OS teaching lab (lab3+).
//!
//! Sv39 splits a 39-bit virtual address into three 9-bit page-table indexes plus a
//! 12-bit page offset. PTE layout: bits `[53:10]` = PPN, `[4:1]` = R/W/X/U, bit 0 = V.
//! `satp` token format: `(8 << 60) | root_ppn` (8 = Sv39 mode).
//!
//! | Type | Role |
//! |------|------|
//! | `VirtAddr` / `VirtPageNum` | Address arithmetic and index extraction |
//! | `PageTable` | Three-level Sv39 walk, map/translate/unmap |
//! | `MemorySet` | Address space = page table + mapped `MapArea` list |
//! | `elf_map_areas` | Build map areas from ELF64 PT_LOAD segments |

#![no_std]

#[cfg(test)]
extern crate std;

#[cfg(target_arch = "riscv64")]
use core::arch::asm;

use os_alloc::{frame_alloc, frame_dealloc, PhysPageNum, PAGE_SIZE, PAGE_SIZE_BITS};

/// Virtual address.
#[derive(Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct VirtAddr(pub usize);

impl VirtAddr {
    pub fn page_offset(&self) -> usize {
        self.0 & (PAGE_SIZE - 1)
    }

    pub fn floor(&self) -> VirtPageNum {
        VirtPageNum(self.0 >> PAGE_SIZE_BITS)
    }

    pub fn ceil(&self) -> VirtPageNum {
        VirtPageNum((self.0 + PAGE_SIZE - 1) >> PAGE_SIZE_BITS)
    }
}

/// Virtual page number.
#[derive(Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct VirtPageNum(pub usize);

impl VirtPageNum {
    pub fn addr(&self) -> usize {
        self.0 << PAGE_SIZE_BITS
    }

    pub fn indexes(&self) -> [usize; 3] {
        let vpn = self.0;
        [
            (vpn >> 18) & 0x1ff,
            (vpn >> 9) & 0x1ff,
            vpn & 0x1ff,
        ]
    }
}

/// Sv39 PTE permission flags (V is added automatically).
#[derive(Copy, Clone)]
pub struct MapPermission(u8);

impl MapPermission {
    pub const R: Self = Self(1 << 1);
    pub const W: Self = Self(1 << 2);
    pub const X: Self = Self(1 << 3);
    pub const U: Self = Self(1 << 4);

    pub const fn union(self, other: Self) -> Self {
        Self(self.0 | other.0)
    }

    pub fn contains(self, flag: Self) -> bool {
        self.0 & flag.0 != 0
    }
}

const PTE_V: usize = 1;

#[derive(Copy, Clone)]
#[repr(C)]
pub struct PageTableEntry(pub usize);

impl PageTableEntry {
    fn empty() -> Self {
        Self(0)
    }

    fn new_ppn(ppn: PhysPageNum, perm: MapPermission) -> Self {
        let mut flags = PTE_V;
        if perm.contains(MapPermission::R) {
            flags |= 1 << 1;
        }
        if perm.contains(MapPermission::W) {
            flags |= 1 << 2;
        }
        if perm.contains(MapPermission::X) {
            flags |= 1 << 3;
        }
        if perm.contains(MapPermission::U) {
            flags |= 1 << 4;
        }
        Self(ppn.0 << 10 | flags)
    }

    fn new_pointer(ppn: PhysPageNum) -> Self {
        Self(ppn.0 << 10 | PTE_V)
    }

    fn ppn(&self) -> PhysPageNum {
        PhysPageNum((self.0 >> 10) & ((1usize << 44) - 1))
    }

    fn is_valid(&self) -> bool {
        self.0 & PTE_V != 0
    }

    fn permission(&self) -> MapPermission {
        let mut perm = MapPermission(0);
        if self.0 & (1 << 1) != 0 {
            perm = perm.union(MapPermission::R);
        }
        if self.0 & (1 << 2) != 0 {
            perm = perm.union(MapPermission::W);
        }
        if self.0 & (1 << 3) != 0 {
            perm = perm.union(MapPermission::X);
        }
        if self.0 & (1 << 4) != 0 {
            perm = perm.union(MapPermission::U);
        }
        perm
    }
}

/// Three-level Sv39 page table rooted at one physical frame.
pub struct PageTable {
    root_ppn: PhysPageNum,
}

impl PageTable {
    pub fn new() -> Self {
        let root = frame_alloc().expect("out of frames for page table root");
        let table = root.addr() as *mut PageTableEntry;
        unsafe {
            core::ptr::write_bytes(table, 0, 512);
        }
        Self { root_ppn: root }
    }

    fn find_pte(&self, vpn: VirtPageNum, alloc: bool) -> Option<*mut PageTableEntry> {
        let indexes = vpn.indexes();
        let mut ppn = self.root_ppn;
        for (i, idx) in indexes.iter().enumerate() {
            let table = ppn.addr() as *mut PageTableEntry;
            let pte = unsafe { table.add(*idx) };
            if i == 2 {
                return Some(pte);
            }
            if unsafe { !(*pte).is_valid() } {
                if !alloc {
                    return None;
                }
                let next = frame_alloc().expect("out of frames for page table");
                unsafe {
                    core::ptr::write_bytes(next.addr() as *mut u8, 0, PAGE_SIZE);
                    *pte = PageTableEntry::new_pointer(next);
                }
            }
            ppn = unsafe { (*pte).ppn() };
        }
        None
    }

    pub fn map(&mut self, vpn: VirtPageNum, ppn: PhysPageNum, perm: MapPermission) {
        let pte = self.find_pte(vpn, true).expect("map failed");
        assert!(
            !unsafe { (*pte).is_valid() },
            "vpn {:#x} already mapped",
            vpn.addr()
        );
        unsafe {
            *pte = PageTableEntry::new_ppn(ppn, perm);
        }
    }

    /// Update an existing leaf mapping to the same frame with merged permissions.
    pub fn remap(&mut self, vpn: VirtPageNum, ppn: PhysPageNum, perm: MapPermission) {
        let pte = self.find_pte(vpn, true).expect("remap failed");
        unsafe {
            *pte = PageTableEntry::new_ppn(ppn, perm);
        }
    }

    pub fn unmap(&mut self, vpn: VirtPageNum) {
        let pte = self.find_pte(vpn, false).expect("unmap failed");
        assert!(unsafe { (*pte).is_valid() });
        unsafe {
            *pte = PageTableEntry::empty();
        }
    }

    pub fn translate(&self, vpn: VirtPageNum) -> Option<PageTableEntry> {
        self.find_pte(vpn, false)
            .map(|pte| unsafe { *pte })
            .filter(|e| e.is_valid())
    }

    pub fn token(&self) -> usize {
        8usize << 60 | self.root_ppn.0
    }

    pub fn from_token(token: usize) -> Self {
        Self {
            root_ppn: PhysPageNum(token & ((1usize << 44) - 1)),
        }
    }

    pub fn map_frame(&mut self, vpn: VirtPageNum, perm: MapPermission) -> PhysPageNum {
        let ppn = frame_alloc().expect("out of frames");
        self.map(vpn, ppn, perm);
        ppn
    }
}

impl Drop for PageTable {
    fn drop(&mut self) {
        self.clear_recursive(self.root_ppn, 0);
        frame_dealloc(self.root_ppn);
    }
}

impl Default for PageTable {
    fn default() -> Self {
        Self::new()
    }
}

impl PageTable {
    fn clear_recursive(&self, ppn: PhysPageNum, level: usize) {
        let table = ppn.addr() as *mut PageTableEntry;
        for i in 0..512 {
            let pte = unsafe { *table.add(i) };
            if pte.is_valid() && level < 2 {
                self.clear_recursive(pte.ppn(), level + 1);
            }
        }
        if level < 2 {
            frame_dealloc(ppn);
        }
    }
}

pub fn activate(token: usize) {
    #[cfg(target_arch = "riscv64")]
    unsafe {
        asm!("csrw satp, {}", in(reg) token);
        asm!("sfence.vma");
    }
    #[cfg(not(target_arch = "riscv64"))]
    let _ = token;
}

/// A mapped virtual memory region.
#[derive(Clone)]
pub struct MapArea {
    vpn_start: VirtPageNum,
    vpn_end: VirtPageNum,
    perm: MapPermission,
    data: &'static [u8],
    data_offset: usize,
}

impl MapArea {
    pub fn new(vpn_start: VirtPageNum, vpn_end: VirtPageNum, perm: MapPermission) -> Self {
        Self {
            vpn_start,
            vpn_end,
            perm,
            data: &[],
            data_offset: 0,
        }
    }

    pub fn vpn_start(&self) -> VirtPageNum {
        self.vpn_start
    }

    pub fn vpn_end(&self) -> VirtPageNum {
        self.vpn_end
    }

    pub fn overlaps(&self, start: VirtPageNum, end: VirtPageNum) -> bool {
        self.vpn_start < end && start < self.vpn_end
    }

    pub fn contains_vpn(&self, vpn: VirtPageNum) -> bool {
        self.vpn_start <= vpn && vpn < self.vpn_end
    }

    pub fn contained_in(&self, start: VirtPageNum, end: VirtPageNum) -> bool {
        self.vpn_start >= start && self.vpn_end <= end
    }

    pub fn permission(&self) -> MapPermission {
        self.perm
    }

    pub fn with_data(mut self, data: &'static [u8], offset: usize) -> Self {
        self.data = data;
        self.data_offset = offset;
        self
    }

    pub fn map(&self, page_table: &mut PageTable) {
        Self::map_data(
            page_table,
            self.vpn_start,
            self.vpn_end,
            self.perm,
            self.data,
            self.data_offset,
        );
    }

    /// Map PT_LOAD bytes from `data` into `page_table` (ELF buffer may be freed after this).
    pub fn map_data(
        page_table: &mut PageTable,
        vpn_start: VirtPageNum,
        vpn_end: VirtPageNum,
        perm: MapPermission,
        data: &[u8],
        data_offset: usize,
    ) {
        let seg_start = vpn_start.addr() + data_offset;
        for vpn in vpn_start.0..vpn_end.0 {
            let vpn = VirtPageNum(vpn);
            let page_vaddr = vpn.addr();

            let ppn = if let Some(pte) = page_table.translate(vpn) {
                if pte.is_valid() {
                    let merged = pte.permission().union(perm);
                    let ppn = pte.ppn();
                    page_table.remap(vpn, ppn, merged);
                    ppn
                } else {
                    let ppn = frame_alloc().expect("out of frames");
                    let dst = ppn.addr() as *mut u8;
                    unsafe {
                        core::ptr::write_bytes(dst, 0, PAGE_SIZE);
                    }
                    page_table.map(vpn, ppn, perm);
                    ppn
                }
            } else {
                let ppn = frame_alloc().expect("out of frames");
                let dst = ppn.addr() as *mut u8;
                unsafe {
                    core::ptr::write_bytes(dst, 0, PAGE_SIZE);
                }
                page_table.map(vpn, ppn, perm);
                ppn
            };

            if data.is_empty() || page_vaddr + PAGE_SIZE <= seg_start {
                continue;
            }
            let (copy_start_in_page, src_start) = if page_vaddr < seg_start {
                (seg_start - page_vaddr, 0)
            } else {
                (0, page_vaddr - seg_start)
            };
            if src_start < data.len() {
                let copy_len = (data.len() - src_start).min(PAGE_SIZE - copy_start_in_page);
                unsafe {
                    core::ptr::copy_nonoverlapping(
                        data.as_ptr().add(src_start),
                        (ppn.addr() as *mut u8).add(copy_start_in_page),
                        copy_len,
                    );
                }
            }
        }
    }

    pub fn unmap(&self, page_table: &mut PageTable) {
        for vpn in self.vpn_start.0..self.vpn_end.0 {
            let vpn = VirtPageNum(vpn);
            // Adjacent ELF PT_LOAD segments can share a boundary page (the
            // second segment remaps it with merged permissions). When two
            // areas overlap like that, the first unmap clears the PTE and
            // returns the frame; later areas must skip the already-invalid
            // page instead of asserting — the shared frame is returned once.
            if let Some(pte) = page_table.translate(vpn) {
                frame_dealloc(pte.ppn());
                page_table.unmap(vpn);
            }
        }
    }
}

const MAX_AREAS: usize = 16;

/// A collection of mapped regions backed by one page table.
pub struct MemorySet {
    page_table: PageTable,
    areas: [Option<MapArea>; MAX_AREAS],
    area_count: usize,
}

impl MemorySet {
    pub fn new_bare() -> Self {
        Self {
            page_table: PageTable::new(),
            areas: [const { None }; MAX_AREAS],
            area_count: 0,
        }
    }

    fn push_area(&mut self, area: MapArea) {
        assert!(self.area_count < MAX_AREAS, "too many map areas");
        self.areas[self.area_count] = Some(area);
        self.area_count += 1;
    }

    pub fn map_area(&mut self, area: MapArea) {
        area.map(&mut self.page_table);
        self.push_area(area);
    }

    /// Map ELF64 PT_LOAD segments from `elf`, copying bytes into user pages.
    /// The `elf` buffer is only needed during this call and may be freed afterward.
    pub fn map_elf_pt_load(&mut self, elf: &[u8], user_base: usize) {
        assert!(elf.len() >= 64, "ELF too small");
        let e_phoff = usize::from_le_bytes(elf[32..40].try_into().unwrap());
        let e_phentsize = u16::from_le_bytes(elf[54..56].try_into().unwrap()) as usize;
        let e_phnum = u16::from_le_bytes(elf[56..58].try_into().unwrap()) as usize;

        for i in 0..e_phnum {
            let off = e_phoff + i * e_phentsize;
            assert!(off + 48 <= elf.len(), "program header out of range");
            let ph = &elf[off..off + e_phentsize];
            let p_type = u32::from_le_bytes(ph[0..4].try_into().unwrap());
            if p_type != 1 {
                continue;
            }
            let p_flags = u32::from_le_bytes(ph[4..8].try_into().unwrap());
            let p_offset = usize::from_le_bytes(ph[8..16].try_into().unwrap());
            let p_vaddr = usize::from_le_bytes(ph[16..24].try_into().unwrap());
            let p_filesz = usize::from_le_bytes(ph[32..40].try_into().unwrap());
            let p_memsz = usize::from_le_bytes(ph[40..48].try_into().unwrap());

            let mut perm = MapPermission::U;
            if p_flags & 4 != 0 {
                perm = perm.union(MapPermission::R);
            }
            if p_flags & 2 != 0 {
                perm = perm.union(MapPermission::W);
            }
            if p_flags & 1 != 0 {
                perm = perm.union(MapPermission::X);
            }

            let start = user_base + p_vaddr;
            let end = start + p_memsz;
            let vpn_start = VirtAddr(start).floor();
            let vpn_end = VirtAddr(end).ceil();
            let data = &elf[p_offset..p_offset + p_filesz];
            let data_offset = start - vpn_start.addr();
            MapArea::map_data(
                &mut self.page_table,
                vpn_start,
                vpn_end,
                perm,
                data,
                data_offset,
            );
            self.push_area(MapArea::new(vpn_start, vpn_end, perm));
        }
    }

    pub fn token(&self) -> usize {
        self.page_table.token()
    }

    pub fn activate(&self) {
        activate(self.token());
    }

    pub fn translate(&self, va: VirtAddr) -> Option<PhysPageNum> {
        self.page_table
            .translate(va.floor())
            .map(|pte| pte.ppn())
    }

    pub fn translate_va(&self, va: usize) -> Option<usize> {
        let vaddr = VirtAddr(va);
        self.translate(vaddr)
            .map(|ppn| ppn.addr() + vaddr.page_offset())
    }

    pub fn leaf_perm(&self, va: usize) -> Option<MapPermission> {
        self.page_table
            .translate(VirtAddr(va).floor())
            .map(|pte| pte.permission())
    }

    pub fn page_table_mut(&mut self) -> &mut PageTable {
        &mut self.page_table
    }

    pub fn page_table(&self) -> &PageTable {
        &self.page_table
    }

    /// Whether `[start, end)` overlaps any mapped VPN range.
    pub fn range_overlaps(&self, start: usize, end: usize) -> bool {
        let vpn_start = VirtAddr(start).floor();
        let vpn_end = VirtAddr(end).ceil();
        self.areas[..self.area_count]
            .iter()
            .flatten()
            .any(|area| area.overlaps(vpn_start, vpn_end))
    }

    /// Whether every VPN in `[start, end)` is covered by a mapped area.
    pub fn range_fully_mapped(&self, start: usize, end: usize) -> bool {
        let vpn_start = VirtAddr(start).floor();
        let vpn_end = VirtAddr(end).ceil();
        let mut vpn = vpn_start;
        while vpn < vpn_end {
            let covered = self.areas[..self.area_count]
                .iter()
                .flatten()
                .any(|area| area.contains_vpn(vpn));
            if !covered {
                return false;
            }
            vpn = VirtPageNum(vpn.0 + 1);
        }
        true
    }

    /// Map anonymous zero-filled pages in `[start, end)` with `perm`.
    pub fn map_anonymous(&mut self, start: usize, end: usize, perm: MapPermission) -> bool {
        if self.range_overlaps(start, end) {
            return false;
        }
        let vpn_start = VirtAddr(start).floor();
        let vpn_end = VirtAddr(end).ceil();
        self.map_area(MapArea::new(vpn_start, vpn_end, perm));
        true
    }

    /// Unmap `[start, end)` and release backing frames.
    pub fn unmap_range(&mut self, start: usize, end: usize) -> bool {
        if !self.range_fully_mapped(start, end) {
            return false;
        }
        let vpn_start = VirtAddr(start).floor();
        let vpn_end = VirtAddr(end).ceil();
        let mut write = 0;
        for read in 0..self.area_count {
            if let Some(area) = self.areas[read].take() {
                if area.contained_in(vpn_start, vpn_end) {
                    area.unmap(&mut self.page_table);
                } else {
                    self.areas[write] = Some(area);
                    write += 1;
                }
            }
        }
        for i in write..self.area_count {
            self.areas[i] = None;
        }
        self.area_count = write;
        true
    }

    /// Map VPN to the same-numbered PPN (identity map) without copying data.
    pub fn map_identical_region(&mut self, start: usize, end: usize, perm: MapPermission) {
        let vpn_start = VirtAddr(start).floor();
        let vpn_end = VirtAddr(end).ceil();
        for vpn in vpn_start.0..vpn_end.0 {
            let vpn = VirtPageNum(vpn);
            if self.page_table.translate(vpn).is_some() {
                continue;
            }
            let ppn = PhysPageNum(vpn.0);
            self.page_table.map(vpn, ppn, perm);
        }
    }

    /// Map trampoline code at a fixed high virtual address.
    pub fn map_trampoline(&mut self, trampoline_vpn: VirtPageNum, trampoline_phys: usize) {
        let ppn = PhysPageNum::from_addr(trampoline_phys);
        self.page_table.map(
            trampoline_vpn,
            ppn,
            MapPermission::R.union(MapPermission::X),
        );
    }
}

impl Drop for MemorySet {
    fn drop(&mut self) {
        // Areas occupy slots 0..area_count (push_area fills from index 0 and
        // remove_area_range compacts toward the front), so the populated slots
        // are exactly the first `area_count`, not the last.
        for area in self.areas[..self.area_count].iter().rev().flatten() {
            area.unmap(&mut self.page_table);
        }
    }
}

/// Build map areas from ELF64 PT_LOAD segments (call once per ELF before mapping).
pub fn elf_map_areas(elf: &'static [u8], user_base: usize) -> alloc_buf::ElfAreas {
    alloc_buf::parse_elf(elf, user_base)
}

mod alloc_buf {
    use super::*;

    pub struct ElfAreas {
        pub areas: [MapArea; 8],
        pub count: usize,
    }

    pub fn parse_elf(elf: &'static [u8], user_base: usize) -> ElfAreas {
        let mut out = ElfAreas {
            areas: core::array::from_fn(|_| {
                MapArea::new(VirtPageNum(0), VirtPageNum(0), MapPermission::R)
            }),
            count: 0,
        };

        assert!(elf.len() >= 64, "ELF too small");
        let e_phoff = usize::from_le_bytes(elf[32..40].try_into().unwrap());
        let e_phentsize = u16::from_le_bytes(elf[54..56].try_into().unwrap()) as usize;
        let e_phnum = u16::from_le_bytes(elf[56..58].try_into().unwrap()) as usize;

        for i in 0..e_phnum {
            let off = e_phoff + i * e_phentsize;
            assert!(off + 48 <= elf.len(), "program header out of range");
            let ph = &elf[off..off + e_phentsize];
            let p_type = u32::from_le_bytes(ph[0..4].try_into().unwrap());
            if p_type != 1 {
                continue;
            }
            let p_flags = u32::from_le_bytes(ph[4..8].try_into().unwrap());
            let p_offset = usize::from_le_bytes(ph[8..16].try_into().unwrap());
            let p_vaddr = usize::from_le_bytes(ph[16..24].try_into().unwrap());
            let p_filesz = usize::from_le_bytes(ph[32..40].try_into().unwrap());
            let p_memsz = usize::from_le_bytes(ph[40..48].try_into().unwrap());

            let mut perm = MapPermission::U;
            if p_flags & 4 != 0 {
                perm = perm.union(MapPermission::R);
            }
            if p_flags & 2 != 0 {
                perm = perm.union(MapPermission::W);
            }
            if p_flags & 1 != 0 {
                perm = perm.union(MapPermission::X);
            }

            let start = user_base + p_vaddr;
            let end = start + p_memsz;
            let vpn_start = VirtAddr(start).floor();
            let vpn_end = VirtAddr(end).ceil();
            let data = &elf[p_offset..p_offset + p_filesz];
            let area = MapArea::new(vpn_start, vpn_end, perm).with_data(data, start - vpn_start.addr());

            out.areas[out.count] = area;
            out.count += 1;
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use os_alloc::{init_frame_allocator, PhysPageNum, PAGE_SIZE};
    use std::boxed::Box;
    use std::vec::Vec;

    fn setup_fake_frames() -> usize {
        let mut backing = Vec::with_capacity(512 * PAGE_SIZE);
        backing.resize(512 * PAGE_SIZE, 0);
        let fake_mem = backing.into_boxed_slice();
        let raw = fake_mem.as_ptr() as usize;
        let start = (raw + PAGE_SIZE - 1) & !(PAGE_SIZE - 1);
        let end = raw + fake_mem.len();
        init_frame_allocator(start, end);
        Box::leak(fake_mem);
        start
    }

    #[test]
    fn virt_page_indexes() {
        let vpn = VirtPageNum(0x80400);
        let idx = vpn.indexes();
        assert_eq!(idx.len(), 3);
        assert_eq!(idx[0], (0x80400 >> 18) & 0x1ff);
        assert_eq!(idx[1], (0x80400 >> 9) & 0x1ff);
        assert_eq!(idx[2], 0x80400 & 0x1ff);
    }

    #[test]
    fn virt_addr_floor_ceil_offset() {
        let va = VirtAddr(0x8040_0123);
        assert_eq!(va.page_offset(), 0x123);
        assert_eq!(va.floor().0, 0x80400);
        assert_eq!(va.ceil().0, 0x80401);
        assert_eq!(VirtAddr(0x8040_0000).ceil().0, 0x80400);
    }

    #[test]
    fn page_table_map_translate() {
        setup_fake_frames();
        let mut pt = PageTable::new();
        let vpn = VirtPageNum(0x100);
        let ppn = PhysPageNum(0x200);
        let perm = MapPermission::R.union(MapPermission::W);
        pt.map(vpn, ppn, perm);
        let pte = pt.translate(vpn).expect("mapped pte");
        assert_eq!(pte.ppn().0, 0x200);
        assert!(pte.is_valid());
        core::mem::forget(pt);
    }

    #[test]
    fn memory_set_identity_translate() {
        let start = setup_fake_frames();
        let mut ms = MemorySet::new_bare();
        let end = start + PAGE_SIZE * 4;
        ms.map_identical_region(start, end, MapPermission::R.union(MapPermission::W));
        let va = VirtAddr(start + 0x800);
        let ppn = ms.translate(va).expect("identity mapped");
        assert_eq!(ppn.addr() + va.page_offset(), start + 0x800);
        core::mem::forget(ms);
    }

    #[test]
    fn elf_map_areas_minimal() {
        let mut elf_box = [0u8; 128];
        elf_box[0..4].copy_from_slice(b"\x7fELF");
        elf_box[4] = 2;
        elf_box[5] = 1;
        elf_box[18..20].copy_from_slice(&(64u16).to_le_bytes());
        elf_box[32..40].copy_from_slice(&(64usize).to_le_bytes());
        elf_box[54..56].copy_from_slice(&(56u16).to_le_bytes());
        elf_box[56..58].copy_from_slice(&(1u16).to_le_bytes());
        elf_box[64..68].copy_from_slice(&(1u32).to_le_bytes());
        elf_box[68..72].copy_from_slice(&(5u32).to_le_bytes());
        elf_box[72..80].copy_from_slice(&(0usize).to_le_bytes());
        elf_box[80..88].copy_from_slice(&(0usize).to_le_bytes());
        elf_box[88..96].copy_from_slice(&(0usize).to_le_bytes());
        elf_box[96..104].copy_from_slice(&(16usize).to_le_bytes());
        elf_box[104..112].copy_from_slice(&(16usize).to_le_bytes());

        let elf: &'static [u8] = Box::leak(Box::new(elf_box));
        let areas = elf_map_areas(elf, 0x8040_0000);
        assert_eq!(areas.count, 1);
    }
}
