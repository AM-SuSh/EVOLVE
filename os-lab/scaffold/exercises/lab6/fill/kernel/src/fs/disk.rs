//! 【Lab6 任务：fill】实现 `attach_hard_link_alias`——硬链接要共享同一 `FileMeta` 并把 `nlink + 1`。
//!
//! 现象：当前该函数是 `todo!()`，`linkat` 无法正确挂上别名 / 增加链接数，
//! `make test-lab6` 往往看不到 `Test link OK!`（`file_test` 仍可能通过）。
//!
//! 要求（对照手册 2.4「硬链接、fstat」）：
//! 1. 对 `meta` 加锁后执行 `nlink += 1`；
//! 2. `index.aliases.insert(dst.to_string(), meta)`，让新名字指向同一份元数据；
//! 3. `index.hidden.remove(dst)`，避免目标名仍被标成已删除；
//! 4. 想清楚：只 insert 不加 `nlink`，或 `alloc_meta(dst)` 造新 inode，分别会破坏 `link_test` 的哪条断言？
//!
//! 验证：`make test-lab6`，应看到 `file_test pass`、`Test link OK!` 等全部通过断言。
//!
//! Disk file system via VirtIO + easy-fs (lab6).
//! Regular files and pipes share one fd table; `read`/`write` dispatch on [`FdType`] (lab7 unified fd).

use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::{String, ToString};
use alloc::sync::Arc;
use alloc::vec::Vec;
use spin::{Lazy, Mutex};

use easy_fs::{EasyFileSystem, FileHandle, OpenFlags};
use os_syscall::{Stat, StatMode};

use crate::config::{MAX_FD, MAX_PROCESS_NUM};
use crate::mm;
use crate::process::current_slot;
use crate::sync;
use crate::virtio_block::BLOCK_DEVICE;

const MAX_READ_CHUNK: usize = 256;

static FS: Lazy<DiskFs> = Lazy::new(|| {
    let efs = EasyFileSystem::open(BLOCK_DEVICE.clone());
    DiskFs {
        root: Arc::new(EasyFileSystem::root_inode(&efs)),
    }
});

static FILE_INDEX: Lazy<Mutex<FileIndex>> = Lazy::new(|| Mutex::new(FileIndex::new()));

struct DiskFs {
    root: Arc<easy_fs::Inode>,
}

struct FileMeta {
    ino: u64,
    mode: StatMode,
    nlink: u32,
    backing_path: String,
}

struct FileIndex {
    next_ino: u64,
    aliases: BTreeMap<String, Arc<Mutex<FileMeta>>>,
    hidden: BTreeSet<String>,
}

impl FileIndex {
    const fn new() -> Self {
        Self {
            next_ino: 1,
            aliases: BTreeMap::new(),
            hidden: BTreeSet::new(),
        }
    }

    fn alloc_meta(&mut self, path: &str) -> Arc<Mutex<FileMeta>> {
        let meta = Arc::new(Mutex::new(FileMeta {
            ino: self.next_ino,
            mode: StatMode::FILE,
            nlink: 1,
            backing_path: path.to_string(),
        }));
        self.next_ino += 1;
        self.aliases.insert(path.to_string(), meta.clone());
        self.hidden.remove(path);
        meta
    }

    fn visible_meta(&self, path: &str) -> Option<Arc<Mutex<FileMeta>>> {
        self.aliases.get(path).cloned()
    }

    fn path_hidden(&self, path: &str) -> bool {
        self.hidden.contains(path)
    }
}

#[derive(Clone)]
struct OpenedFile {
    handle: FileHandle,
    meta: Option<Arc<Mutex<FileMeta>>>,
}

impl OpenedFile {
    fn new(handle: FileHandle, meta: Arc<Mutex<FileMeta>>) -> Self {
        Self {
            handle,
            meta: Some(meta),
        }
    }
}

impl DiskFs {
    fn ensure_meta_for_path(&self, path: &str) -> Option<Arc<Mutex<FileMeta>>> {
        let mut index = FILE_INDEX.lock();
        if let Some(meta) = index.visible_meta(path) {
            return Some(meta);
        }
        if index.path_hidden(path) || self.root.find(path).is_none() {
            return None;
        }
        Some(index.alloc_meta(path))
    }

    fn open_file(&self, path: &str, flags: OpenFlags) -> Option<OpenedFile> {
        let (readable, writable) = flags.read_write();

        if flags.contains(OpenFlags::CREATE) {
            let meta = {
                let mut index = FILE_INDEX.lock();
                if let Some(meta) = index.visible_meta(path) {
                    meta
                } else {
                    if index.path_hidden(path) {
                        index.hidden.remove(path);
                    }
                    index.alloc_meta(path)
                }
            };
            let inode = if let Some(inode) = self.root.find(path) {
                inode
            } else {
                self.root.create(path)?
            };
            inode.clear();
            return Some(OpenedFile::new(
                FileHandle::new(readable, writable, inode),
                meta,
            ));
        }

        let meta = self.ensure_meta_for_path(path)?;
        let backing_path = meta.lock().backing_path.clone();
        let inode = self.root.find(backing_path.as_str())?;
        if flags.contains(OpenFlags::TRUNC) {
            inode.clear();
        }
        Some(OpenedFile::new(
            FileHandle::new(readable, writable, inode),
            meta,
        ))
    }

    fn link(&self, src: &str, dst: &str) -> isize {
        if src == dst {
            return -1;
        }
        let mut index = FILE_INDEX.lock();
        if index.visible_meta(dst).is_some() || index.path_hidden(dst) {
            return -1;
        }
        let Some(meta) = (if let Some(meta) = index.visible_meta(src) {
            Some(meta)
        } else if self.root.find(src).is_some() {
            Some(index.alloc_meta(src))
        } else {
            None
        }) else {
            return -1;
        };
        // 源 meta 已就绪；挂别名并 bump nlink（见下方任务函数）。
        attach_hard_link_alias(&mut index, dst, meta);
        0
    }

    fn unlink(&self, path: &str) -> isize {
        let mut index = FILE_INDEX.lock();
        let Some(meta) = (if let Some(meta) = index.aliases.remove(path) {
            Some(meta)
        } else if self.root.find(path).is_some() && !index.path_hidden(path) {
            let meta = index.alloc_meta(path);
            index.aliases.remove(path);
            Some(meta)
        } else {
            None
        }) else {
            return -1;
        };
        index.hidden.insert(path.to_string());
        let mut meta_guard = meta.lock();
        if meta_guard.nlink > 0 {
            meta_guard.nlink -= 1;
        }
        0
    }
}

/// 【Lab6 任务：fill】把 `dst` 挂成指向 `meta` 的硬链接别名，并增加链接计数。
///
/// 思路提示（先自己想清楚再动手）：
/// 1. `meta.lock().nlink += 1`；
/// 2. `index.aliases.insert(dst.to_string(), meta)`；
/// 3. `index.hidden.remove(dst)`；
/// 4. 不要 `alloc_meta(dst)`——那会新建 inode，破坏「共享同一 ino」。
#[allow(unused_variables)]
fn attach_hard_link_alias(index: &mut FileIndex, dst: &str, meta: Arc<Mutex<FileMeta>>) {
    todo!("Lab6：nlink += 1，并把 dst 插入 aliases 指向同一 meta（见上方提示）")
}

/// Unified fd kind for regular files and pipes (lab7).
#[derive(Clone, Copy)]
enum FdType {
    Regular { offset: usize },
    PipeRead(usize),
    PipeWrite(usize),
}

struct FdTable {
    slots: [Option<FdType>; MAX_FD],
    files: [Option<OpenedFile>; MAX_FD],
}

impl FdTable {
    const fn new() -> Self {
        Self {
            slots: [const { None }; MAX_FD],
            files: [const { None }; MAX_FD],
        }
    }

    fn alloc(&mut self, ty: FdType, file: OpenedFile) -> Option<usize> {
        for i in 0..MAX_FD {
            if self.slots[i].is_none() {
                self.slots[i] = Some(ty);
                self.files[i] = Some(file);
                return Some(i);
            }
        }
        None
    }
}

impl Clone for FdTable {
    fn clone(&self) -> Self {
        Self {
            slots: self.slots,
            files: self.files.clone(),
        }
    }
}

static mut FD_TABLES: [FdTable; MAX_PROCESS_NUM] = [const { FdTable::new() }; MAX_PROCESS_NUM];

pub fn init() {
    let _ = &*FS;
    let _ = &*BLOCK_DEVICE;
    init_process_fds(0);
}

pub fn init_process_fds(slot: usize) {
    unsafe {
        FD_TABLES[slot] = FdTable::new();
    }
}

pub fn clone_fd_table(parent_slot: usize, child_slot: usize) {
    unsafe {
        FD_TABLES[child_slot] = FD_TABLES[parent_slot].clone();
        for ty in FD_TABLES[child_slot].slots.iter().flatten() {
            match ty {
                FdType::PipeRead(id) => sync::pipe_add_refs(*id, true, false),
                FdType::PipeWrite(id) => sync::pipe_add_refs(*id, false, true),
                FdType::Regular { .. } => {}
            }
        }
    }
}

pub fn close_all_fds(slot: usize) {
    unsafe {
        for i in 0..MAX_FD {
            if let Some(ty) = FD_TABLES[slot].slots[i] {
                close_fd_type(ty);
            }
        }
        FD_TABLES[slot] = FdTable::new();
    }
}

fn close_fd_type(ty: FdType) {
    match ty {
        FdType::PipeRead(id) => sync::pipe_close_read(id),
        FdType::PipeWrite(id) => sync::pipe_close_write(id),
        FdType::Regular { .. } => {}
    }
}

pub fn alloc_pipe_fds(pipe_id: usize) -> Option<(usize, usize)> {
    let slot = current_slot();
    unsafe {
        let table = &mut FD_TABLES[slot];
        let read_fd = table.slots.iter().position(|s| s.is_none())?;
        table.slots[read_fd] = Some(FdType::PipeRead(pipe_id));
        let write_fd = table.slots.iter().position(|s| s.is_none())?;
        table.slots[write_fd] = Some(FdType::PipeWrite(pipe_id));
        Some((read_fd, write_fd))
    }
}

pub fn close_fd_pair(read_fd: usize, write_fd: usize) {
    let slot = current_slot();
    unsafe {
        if let Some(ty) = FD_TABLES[slot].slots[read_fd] {
            close_fd_type(ty);
        }
        if let Some(ty) = FD_TABLES[slot].slots[write_fd] {
            close_fd_type(ty);
        }
        FD_TABLES[slot].slots[read_fd] = None;
        FD_TABLES[slot].slots[write_fd] = None;
        FD_TABLES[slot].files[read_fd] = None;
        FD_TABLES[slot].files[write_fd] = None;
    }
}

fn read_user_bytes(ptr: *const u8, len: usize) -> Option<Vec<u8>> {
    if ptr.is_null() || len == 0 || len > 256 {
        return None;
    }
    mm::activate_current_user();
    let mut buf = alloc::vec![0u8; len];
    unsafe {
        core::ptr::copy_nonoverlapping(ptr, buf.as_mut_ptr(), len);
    }
    mm::activate_kernel();
    Some(buf)
}

fn read_user_cstr(ptr: *const u8) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    mm::activate_current_user();
    let mut bytes = Vec::new();
    let mut cur = ptr;
    loop {
        let ch = unsafe { *cur };
        if ch == 0 {
            break;
        }
        bytes.push(ch);
        cur = unsafe { cur.add(1) };
        if bytes.len() > 255 {
            mm::activate_kernel();
            return None;
        }
    }
    mm::activate_kernel();
    String::from_utf8(bytes).ok()
}

fn write_user_stat(ptr: *mut Stat, stat: Stat) -> bool {
    if ptr.is_null() {
        return false;
    }
    mm::activate_current_user();
    unsafe {
        core::ptr::write_volatile(ptr, stat);
    }
    mm::activate_kernel();
    true
}

fn flags_from_bits(bits: usize) -> Option<OpenFlags> {
    OpenFlags::from_bits(bits as u32)
}

pub fn read_file_all(path: &str) -> Option<Vec<u8>> {
    let opened = FS.open_file(path, OpenFlags::RDONLY)?;
    let inode = opened.handle.inode.as_ref()?;
    let mut data = Vec::new();
    let mut offset = 0usize;
    let mut chunk = [0u8; 512];
    loop {
        let n = inode.read_at(offset, &mut chunk);
        if n == 0 {
            break;
        }
        data.extend_from_slice(&chunk[..n]);
        offset += n;
    }
    Some(data)
}

pub fn sys_openat(path: *const u8, path_len: usize, flags: usize) -> isize {
    let name = match read_user_bytes(path, path_len) {
        Some(b) => match String::from_utf8(b) {
            Ok(s) => s,
            Err(_) => return -1,
        },
        None => return -1,
    };
    let flags = match flags_from_bits(flags) {
        Some(f) => f,
        None => return -1,
    };
    let opened = match FS.open_file(name.as_str(), flags) {
        Some(f) => f,
        None => return -1,
    };
    let slot = current_slot();
    unsafe {
        match FD_TABLES[slot].alloc(FdType::Regular { offset: 0 }, opened) {
            Some(fd) => fd as isize,
            None => -1,
        }
    }
}

pub fn sys_read(fd: usize, buf: *mut u8, len: usize) -> isize {
    if buf.is_null() {
        return -1;
    }
    let slot = current_slot();
    let ty = unsafe {
        match FD_TABLES[slot].slots.get(fd).and_then(|s| *s) {
            Some(ty) => ty,
            None => return -1,
        }
    };
    match ty {
        FdType::PipeRead(pipe_id) => sync::pipe_read(pipe_id, buf, len),
        FdType::Regular { offset, .. } => {
            let opened = unsafe {
                match FD_TABLES[slot].files[fd].clone() {
                    Some(opened) => opened,
                    None => return -1,
                }
            };
            let inode = match opened.handle.inode.as_ref() {
                Some(i) => i,
                None => return -1,
            };
            let to_read = len.min(MAX_READ_CHUNK);
            let mut kbuf = [0u8; MAX_READ_CHUNK];
            let n = inode.read_at(offset, &mut kbuf[..to_read]);
            if n == 0 {
                return 0;
            }
            mm::activate_current_user();
            unsafe {
                core::ptr::copy_nonoverlapping(kbuf.as_ptr(), buf, n);
            }
            mm::activate_kernel();
            unsafe {
                if let Some(FdType::Regular {
                    offset: ref mut off,
                    ..
                }) = FD_TABLES[slot].slots[fd]
                {
                    *off += n;
                }
            }
            n as isize
        }
        FdType::PipeWrite(_) => -1,
    }
}

pub fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize {
    let slot = current_slot();
    let ty = unsafe {
        match FD_TABLES[slot].slots.get(fd).and_then(|s| *s) {
            Some(ty) => ty,
            None => return -1,
        }
    };
    match ty {
        FdType::PipeWrite(pipe_id) => sync::pipe_write(pipe_id, buf, len),
        FdType::Regular { offset, .. } => {
            let opened = unsafe {
                match FD_TABLES[slot].files[fd].clone() {
                    Some(opened) => opened,
                    None => return -1,
                }
            };
            if !opened.handle.writable() {
                return -1;
            }
            let inode = match opened.handle.inode.as_ref() {
                Some(i) => i,
                None => return -1,
            };
            let to_write = len.min(MAX_READ_CHUNK);
            let mut kbuf = [0u8; MAX_READ_CHUNK];
            mm::activate_current_user();
            unsafe {
                core::ptr::copy_nonoverlapping(buf, kbuf.as_mut_ptr(), to_write);
            }
            mm::activate_kernel();
            let n = inode.write_at(offset, &kbuf[..to_write]);
            unsafe {
                if let Some(FdType::Regular {
                    offset: ref mut off,
                    ..
                }) = FD_TABLES[slot].slots[fd]
                {
                    *off += n;
                }
            }
            n as isize
        }
        FdType::PipeRead(_) => -1,
    }
}

pub fn sys_close(fd: usize) -> isize {
    let slot = current_slot();
    unsafe {
        let ty = match FD_TABLES[slot].slots[fd] {
            Some(t) => t,
            None => return -1,
        };
        close_fd_type(ty);
        FD_TABLES[slot].slots[fd] = None;
        FD_TABLES[slot].files[fd] = None;
    }
    0
}

#[cfg(feature = "lab7")]
pub fn sys_dup(old_fd: usize) -> isize {
    let slot = current_slot();
    unsafe {
        let ty = match FD_TABLES[slot].slots.get(old_fd).and_then(|s| *s) {
            Some(ty) => ty,
            None => return -1,
        };
        let new_fd = match FD_TABLES[slot].slots.iter().position(|s| s.is_none()) {
            Some(i) => i,
            None => return -1,
        };
        FD_TABLES[slot].slots[new_fd] = Some(ty);
        match ty {
            FdType::Regular { .. } => {
                FD_TABLES[slot].files[new_fd] = FD_TABLES[slot].files[old_fd].clone();
            }
            FdType::PipeRead(id) => {
                sync::pipe_add_refs(id, true, false);
                FD_TABLES[slot].files[new_fd] = None;
            }
            FdType::PipeWrite(id) => {
                sync::pipe_add_refs(id, false, true);
                FD_TABLES[slot].files[new_fd] = None;
            }
        }
        new_fd as isize
    }
}

pub fn sys_linkat(oldpath: *const u8, newpath: *const u8) -> isize {
    match (read_user_cstr(oldpath), read_user_cstr(newpath)) {
        (Some(old), Some(new)) => FS.link(old.as_str(), new.as_str()),
        _ => -1,
    }
}

pub fn sys_unlinkat(path: *const u8) -> isize {
    match read_user_cstr(path) {
        Some(p) => FS.unlink(p.as_str()),
        None => -1,
    }
}

pub fn sys_fstat(fd: usize, st: *mut Stat) -> isize {
    let slot = current_slot();
    let opened = unsafe { FD_TABLES[slot].files.get(fd).and_then(|f| f.clone()) };
    let opened = match opened {
        Some(f) => f,
        None => return -1,
    };
    let meta = match opened.meta.as_ref() {
        Some(m) => m,
        None => return -1,
    };
    let meta = meta.lock();
    let mut stat = Stat::new();
    stat.dev = 0;
    stat.ino = meta.ino;
    stat.mode = meta.mode;
    stat.nlink = meta.nlink;
    if write_user_stat(st, stat) {
        0
    } else {
        -1
    }
}
