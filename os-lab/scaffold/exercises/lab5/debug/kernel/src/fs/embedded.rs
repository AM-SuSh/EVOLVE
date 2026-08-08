//! 【Lab5 任务：debug】fork 之后管道测例失败，往往看不到 `pipe says hi` / `pipe_test pass`。
//!
//! 现象：运行 `cargo run -p kernel --features lab5 --release` 时，`fs_test` 仍可能通过，
//! 但 `pipe_test` 缺少 `pipe says hi` / `pipe_test pass`（或读侧异常结束）。
//!
//! 按「现象 → 假设 → 最小实验 → 证据 → 结论」排查：
//! 1. 先复现：有没有 `fs_test pass`？有没有 `pipe_test pass`？不要只看退出码；
//! 2. 假设：用户测例关端是否正确？若用户侧看起来正常，内核在 fork 复制 fd 表时
//!    有没有为管道端增加引用计数？
//! 3. 沿 `process` fork → `fs::clone_fd_table` 核对：表项复制之后，对 `PipeRead` /
//!    `PipeWrite` 是否调用了 `sync::pipe_add_refs`（参数分别是读端 / 写端）？
//! 4. 修复后必须看到 hello / fs_test pass / pipe says hi / pipe_test pass /
//!    All processes exited.，不要只看「内核没 panic」。

use crate::config::{MAX_FD, MAX_PROCESS_NUM};
use crate::mm;
use crate::process::current_slot;
use crate::sync;
use os_fs::{EmbeddedFs, FileId};

static FS: EmbeddedFs = EmbeddedFs::default_fs();
const MAX_READ_CHUNK: usize = 256;

#[derive(Clone, Copy)]
enum FdType {
    Regular {
        file_id: FileId,
        offset: usize,
    },
    PipeRead(usize),
    PipeWrite(usize),
}

struct FdTable {
    slots: [Option<FdType>; MAX_FD],
}

impl FdTable {
    const fn new() -> Self {
        Self {
            slots: [const { None }; MAX_FD],
        }
    }

    fn alloc(&mut self, ty: FdType) -> Option<usize> {
        for i in 0..MAX_FD {
            if self.slots[i].is_none() {
                self.slots[i] = Some(ty);
                return Some(i);
            }
        }
        None
    }
}

impl Clone for FdTable {
    fn clone(&self) -> Self {
        *self
    }
}

impl Copy for FdTable {}

static mut FD_TABLES: [FdTable; MAX_PROCESS_NUM] = [const { FdTable::new() }; MAX_PROCESS_NUM];

pub fn init() {
    init_process_fds(0);
}

pub fn init_process_fds(slot: usize) {
    unsafe {
        FD_TABLES[slot] = FdTable::new();
    }
}

fn find_file(path: &str) -> Option<FileId> {
    FS.open(path)
}

/// fork 时复制父进程打开表，并为继承到的管道端增加引用计数。
pub fn clone_fd_table(parent_slot: usize, child_slot: usize) {
    unsafe {
        FD_TABLES[child_slot] = FD_TABLES[parent_slot];
        // PLANTED BUG: 只复制了 fd 表项，没有为管道端 bump 引用计数。
        // 对比手册：sys_pipe 时两侧 refs=1；fork 后父子各握一份，必须再加。
        // 子进程 close(写端) 若把 write_refs 减到 0，父进程还在用写端就会坏。
        for ty in FD_TABLES[child_slot].slots.iter().flatten() {
            match ty {
                FdType::PipeRead(_id) => {
                    // 这里应 pipe_add_refs(*id, true, false)
                }
                FdType::PipeWrite(_id) => {
                    // 这里应 pipe_add_refs(*id, false, true)
                }
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
        let read_fd = table.alloc(FdType::PipeRead(pipe_id))?;
        let write_fd = table.alloc(FdType::PipeWrite(pipe_id))?;
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
    }
}

fn read_user_str(ptr: *const u8, len: usize) -> Option<[u8; 32]> {
    if ptr.is_null() || len == 0 || len > 31 {
        return None;
    }
    mm::activate_current_user();
    let mut buf = [0u8; 32];
    unsafe {
        core::ptr::copy_nonoverlapping(ptr, buf.as_mut_ptr(), len);
    }
    mm::activate_kernel();
    Some(buf)
}

fn get_fd(slot: usize, fd: usize) -> Option<FdType> {
    unsafe { FD_TABLES[slot].slots.get(fd).and_then(|s| *s) }
}

fn set_fd_offset(slot: usize, fd: usize, offset: usize) {
    unsafe {
        if let Some(FdType::Regular { file_id, .. }) = FD_TABLES[slot].slots[fd] {
            FD_TABLES[slot].slots[fd] = Some(FdType::Regular { file_id, offset });
        }
    }
}

pub fn sys_openat(path: *const u8, path_len: usize, _flags: usize) -> isize {
    let name_buf = match read_user_str(path, path_len) {
        Some(b) => b,
        None => return -1,
    };
    let name = match core::str::from_utf8(&name_buf[..path_len]) {
        Ok(s) => s,
        Err(_) => return -1,
    };
    let file_id = match find_file(name) {
        Some(id) => id,
        None => return -1,
    };
    let slot = current_slot();
    unsafe {
        match FD_TABLES[slot].alloc(FdType::Regular {
            file_id,
            offset: 0,
        }) {
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
    let ty = match get_fd(slot, fd) {
        Some(t) => t,
        None => return -1,
    };
    match ty {
        FdType::PipeRead(pipe_id) => sync::pipe_read(pipe_id, buf, len),
        FdType::Regular { file_id, offset } => {
            let file_size = FS.size(file_id);
            if offset >= file_size {
                return 0;
            }
            let to_read = len.min(file_size - offset).min(MAX_READ_CHUNK);
            let mut kbuf = [0u8; MAX_READ_CHUNK];
            let n = FS.read_at(file_id, offset, &mut kbuf[..to_read]);
            if n == 0 {
                return 0;
            }
            mm::activate_current_user();
            unsafe {
                core::ptr::copy_nonoverlapping(kbuf.as_ptr(), buf, n);
            }
            mm::activate_kernel();
            set_fd_offset(slot, fd, offset + n);
            n as isize
        }
        FdType::PipeWrite(_) => -1,
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
    }
    0
}

pub fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize {
    let slot = current_slot();
    let ty = match get_fd(slot, fd) {
        Some(t) => t,
        None => return -1,
    };
    match ty {
        FdType::PipeWrite(pipe_id) => sync::pipe_write(pipe_id, buf, len),
        _ => -1,
    }
}
