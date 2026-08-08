//! 【Lab4 任务：补全】实现 `sys_wait4` 的阻塞等待与僵尸回收。
//!
//! 现象：当前 `sys_wait4` 是 `todo!()`，父进程调用 `waitpid` 时无法回收子进程，
//! 运行后不会出现 `fork_test pass`。
//!
//! 要求（对照手册 2.5「wait 与僵尸进程」）：
//! 1. 每次先调用 `reap_zombie_child(current_slot(), want_pid)` 找僵尸子进程；
//! 2. 找到僵尸：把它的 `exit_code` 通过 `write_user_i32(status_ptr, code)` 写回用户空间，
//!    然后返回被回收子进程的 `pid`（注意不是退出码）；
//! 3. 没有僵尸时，若 `want_pid >= 0` 且当前进程已没有活着的子进程，返回 -1；
//! 4. 还有活子进程但尚未退出：先 `cx.sepc = cx.sepc.wrapping_sub(4)` 回退到 ecall，
//!    再 `sync_current_trap_cx(cx)` 保存现场、`mark_current_ready()` 标记 Ready、
//!    `run_next_process()` 让出 CPU；被唤醒后从 syscall 重入再次检查；
//! 5. 想清楚：`reap_zombie_child` 返回的是 `(pid, exit_code)`，为什么 syscall 返回值
//!    是 pid 而不是 exit_code？
//!
//! 验证：`cargo run -p kernel --features lab4 --release`，
//! 应看到 `I am parent`、`I am child`、`fork_test pass`、`All processes exited.`。
//!
//! 原模块职责：Process control blocks, fork/exec/wait, and scheduling (lab4+)。

use os_context::TrapContext;

#[cfg(feature = "lab8")]
use alloc::{sync::Arc, vec::Vec};
#[cfg(feature = "lab8")]
use os_sync::{Condvar, MutexBlocking, Semaphore};

use crate::cell::SyncUnsafeCell;
use crate::config::{
    APP_BASE_ADDRESS, APP_REGION_SIZE, INITPROC_APP_ID, KERNEL_STACK_SIZE, MAX_CHILDREN,
    MAX_PROCESS_NUM,
};
use crate::loader::{get_app_elf, get_app_elf_by_name, get_app_entry};
use crate::mm;
use crate::trap::{run_user_task, trap_cx_init};
#[cfg(feature = "lab5")]
use crate::fs;
#[cfg(feature = "lab8")]
use crate::deadlock::DeadlockState;
#[cfg(feature = "lab8")]
use crate::processor;
use crate::{print, println};

#[derive(Copy, Clone, PartialEq)]
pub enum ProcessStatus {
    #[allow(dead_code)]
    UnInit,
    Ready,
    Running,
    Zombie,
}

pub struct ProcessControlBlock {
    pub pid: usize,
    pub parent_slot: Option<usize>,
    pub child_slots: [usize; MAX_CHILDREN],
    pub child_count: usize,
    pub exit_code: i32,
    pub status: ProcessStatus,
    #[cfg(not(feature = "lab8"))]
    pub trap_cx: TrapContext,
    pub space_id: usize,
    #[cfg(feature = "lab6")]
    pub priority: usize,
    #[cfg(feature = "lab6")]
    pub stride: u128,
    #[cfg(feature = "lab7")]
    pub signal: os_signal::SignalState,
    #[cfg(feature = "lab7")]
    pub saved_trap_cx: Option<TrapContext>,
    #[cfg(feature = "lab7")]
    pub in_signal_handler: bool,
    #[cfg(feature = "lab8")]
    pub alive_threads: usize,
    #[cfg(feature = "lab8")]
    pub mutex: Option<MutexBlocking>,
    #[cfg(feature = "lab8")]
    pub semaphore_list: Vec<Option<Arc<Semaphore>>>,
    #[cfg(feature = "lab8")]
    pub condvar: Option<Condvar>,
    #[cfg(feature = "lab8")]
    pub pending_condvar_wake: Option<usize>,
    #[cfg(feature = "lab8")]
    pub deadlock: DeadlockState,
}

static mut KERNEL_STACKS: [[u8; KERNEL_STACK_SIZE]; MAX_PROCESS_NUM] =
    [[0; KERNEL_STACK_SIZE]; MAX_PROCESS_NUM];

fn kernel_stack_top(slot: usize) -> usize {
    unsafe { KERNEL_STACKS[slot].as_ptr() as usize + KERNEL_STACK_SIZE }
}

pub struct ProcessManager {
    next_pid: usize,
    current: usize,
    process_count: usize,
    slots: [Option<ProcessControlBlock>; MAX_PROCESS_NUM],
}

impl ProcessManager {
    const fn new() -> Self {
        Self {
            next_pid: 1,
            current: 0,
            process_count: 0,
            slots: [const { None }; MAX_PROCESS_NUM],
        }
    }

    fn alloc_slot(&mut self) -> usize {
        for i in 0..MAX_PROCESS_NUM {
            if self.slots[i].is_none() {
                return i;
            }
        }
        panic!("out of process slots");
    }

    fn alloc_space_id(&self) -> usize {
        for i in 0..MAX_PROCESS_NUM {
            if mm::space_is_free(i) {
                return i;
            }
        }
        panic!("out of user address spaces");
    }

    fn add_child(&mut self, parent_slot: usize, child_slot: usize) {
        let parent = self.slots[parent_slot].as_mut().unwrap();
        assert!(parent.child_count < MAX_CHILDREN, "too many children");
        parent.child_slots[parent.child_count] = child_slot;
        parent.child_count += 1;
    }

    fn find_next_ready(&mut self) -> Option<usize> {
        if self.process_count == 0 {
            return None;
        }
        #[cfg(not(feature = "lab6"))]
        {
            for offset in 1..=MAX_PROCESS_NUM {
                let idx = (self.current + offset) % MAX_PROCESS_NUM;
                if let Some(pcb) = self.slots[idx].as_ref() {
                    if pcb.status == ProcessStatus::Ready {
                        self.current = idx;
                        return Some(idx);
                    }
                }
            }
            None
        }
        #[cfg(feature = "lab6")]
        {
            let mut best: Option<(usize, u128, usize)> = None;
            for idx in 0..MAX_PROCESS_NUM {
                let Some(pcb) = self.slots[idx].as_ref() else {
                    continue;
                };
                if pcb.status != ProcessStatus::Ready {
                    continue;
                }
                match best {
                    Some((_, best_stride, best_pid))
                        if pcb.stride > best_stride
                            || (pcb.stride == best_stride && pcb.pid > best_pid) => {}
                    _ => best = Some((idx, pcb.stride, pcb.pid)),
                }
            }
            let (slot, _, _) = best?;
            self.current = slot;
            if let Some(pcb) = self.slots[slot].as_mut() {
                pcb.advance_stride();
            }
            Some(slot)
        }
    }

    fn all_done(&self) -> bool {
        self.process_count == 0
    }

    fn spawn(
        &mut self,
        slot: usize,
        space_id: usize,
        entry: usize,
        parent_slot: Option<usize>,
    ) -> usize {
        let pid = self.next_pid;
        self.next_pid += 1;

        #[cfg(feature = "lab8")]
        let _ = entry;

        self.slots[slot] = Some(ProcessControlBlock {
            pid,
            parent_slot,
            child_slots: [0; MAX_CHILDREN],
            child_count: 0,
            exit_code: 0,
            status: ProcessStatus::Ready,
            #[cfg(not(feature = "lab8"))]
            trap_cx: trap_cx_init(entry, APP_BASE_ADDRESS + APP_REGION_SIZE - 16, kernel_stack_top(slot)),
            space_id,
            #[cfg(feature = "lab6")]
            priority: 16,
            #[cfg(feature = "lab6")]
            stride: 0,
            #[cfg(feature = "lab7")]
            signal: os_signal::SignalState::new(),
            #[cfg(feature = "lab7")]
            saved_trap_cx: None,
            #[cfg(feature = "lab7")]
            in_signal_handler: false,
            #[cfg(feature = "lab8")]
            alive_threads: 0,
            #[cfg(feature = "lab8")]
            mutex: None,
            #[cfg(feature = "lab8")]
            semaphore_list: Vec::with_capacity(8),
            #[cfg(feature = "lab8")]
            condvar: None,
            #[cfg(feature = "lab8")]
            pending_condvar_wake: None,
            #[cfg(feature = "lab8")]
            deadlock: DeadlockState::default(),
        });

        if let Some(parent) = parent_slot {
            self.add_child(parent, slot);
        }

        #[cfg(feature = "lab5")]
        if let Some(parent) = parent_slot {
            fs::clone_fd_table(parent, slot);
        } else {
            fs::init_process_fds(slot);
        }

        self.process_count += 1;
        pid
    }

    #[cfg(feature = "lab8")]
    fn spawn_process(
        &mut self,
        slot: usize,
        space_id: usize,
        parent_slot: Option<usize>,
    ) -> usize {
        self.spawn(slot, space_id, 0, parent_slot)
    }
}

static PROCESS_MANAGER: SyncUnsafeCell<ProcessManager> =
    SyncUnsafeCell::new(ProcessManager::new());

pub fn current_slot() -> usize {
    #[cfg(feature = "lab8")]
    {
        return processor::current_process_slot();
    }
    #[cfg(not(feature = "lab8"))]
    PROCESS_MANAGER.with(|pm| pm.current)
}

pub fn current_space_id() -> usize {
    PROCESS_MANAGER.with_ref(|pm| {
        pm.slots[current_slot()]
            .as_ref()
            .expect("no current process")
            .space_id
    })
}

pub fn current_pid() -> usize {
    PROCESS_MANAGER.with_ref(|pm| {
        pm.slots[current_slot()]
            .as_ref()
            .expect("no current process")
            .pid
    })
}

#[cfg(feature = "lab7")]
pub fn find_slot_by_pid(pid: usize) -> Option<usize> {
    PROCESS_MANAGER.with_ref(|pm| {
        for (idx, slot) in pm.slots.iter().enumerate() {
            if slot.as_ref().is_some_and(|pcb| pcb.pid == pid) {
                return Some(idx);
            }
        }
        None
    })
}

#[cfg(any(feature = "lab7", feature = "lab8"))]
pub fn with_pcb_slot<R>(slot: usize, f: impl FnOnce(&mut ProcessControlBlock) -> R) -> R {
    PROCESS_MANAGER.with(|pm| f(pm.slots[slot].as_mut().expect("invalid pcb slot")))
}

#[cfg(any(feature = "lab7", feature = "lab8"))]
pub fn with_pcb_ref<R>(slot: usize, f: impl FnOnce(&ProcessControlBlock) -> R) -> R {
    PROCESS_MANAGER.with_ref(|pm| f(pm.slots[slot].as_ref().expect("invalid pcb slot")))
}

#[cfg(feature = "lab7")]
pub fn with_current_pcb<R>(f: impl FnOnce(&mut ProcessControlBlock) -> R) -> R {
    PROCESS_MANAGER.with(|pm| {
        let slot = pm.current;
        f(pm.slots[slot].as_mut().expect("no current process"))
    })
}

#[cfg(feature = "lab7")]
pub fn current_in_signal_handler() -> bool {
    with_current_pcb(|pcb| pcb.in_signal_handler)
}

#[cfg(any(feature = "lab6", feature = "lab8"))]
impl ProcessControlBlock {
    const BIG_STRIDE: u128 = 1u128 << 63;

    fn pass(&self) -> u128 {
        Self::BIG_STRIDE / self.priority as u128
    }

    pub fn advance_stride(&mut self) {
        self.stride = self.stride.saturating_add(self.pass());
    }
}

pub fn init() {
    PROCESS_MANAGER.with(|pm| {
        let slot = pm.alloc_slot();
        let space_id = pm.alloc_space_id();
        #[cfg(feature = "lab6")]
        let entry = if let Some(elf) = fs::read_file_all("initproc") {
            let entry = mm::elf_entry_point(&elf);
            mm::create_user_space_from_elf(space_id, elf);
            entry
        } else {
            let elf = get_app_elf(INITPROC_APP_ID);
            mm::create_user_space(space_id, elf);
            get_app_entry(INITPROC_APP_ID)
        };
        #[cfg(not(feature = "lab6"))]
        let entry = {
            let elf = get_app_elf(INITPROC_APP_ID);
            mm::create_user_space(space_id, elf);
            get_app_entry(INITPROC_APP_ID)
        };
        #[cfg(feature = "lab8")]
        {
            pm.spawn_process(slot, space_id, None);
            pm.current = slot;
            let user_sp = APP_BASE_ADDRESS + APP_REGION_SIZE - 16;
            processor::spawn_main_thread(slot, entry, user_sp);
        }
        #[cfg(all(not(feature = "lab8"), any(feature = "lab4", feature = "lab5", feature = "lab6", feature = "lab7")))]
        {
            pm.spawn(slot, space_id, entry, None);
            pm.current = slot;
        }
    });
}

pub fn run_initproc() -> ! {
    #[cfg(feature = "lab8")]
    {
        processor::run_init_thread();
    }
    #[cfg(not(feature = "lab8"))]
    PROCESS_MANAGER.with(|pm| {
        let slot = pm.current;
        pm.slots[slot].as_mut().unwrap().status = ProcessStatus::Running;
        let trap_cx = &mut pm.slots[slot].as_mut().unwrap().trap_cx;
        run_user_task(trap_cx)
    })
}

pub fn mark_current_ready() {
    #[cfg(feature = "lab8")]
    {
        processor::mark_current_ready();
        return;
    }
    #[cfg(not(feature = "lab8"))]
    PROCESS_MANAGER.with(|pm| {
        let slot = pm.current;
        let pcb = pm.slots[slot].as_mut().unwrap();
        pcb.status = ProcessStatus::Ready;
    });
}

pub fn sync_current_trap_cx(cx: &TrapContext) {
    #[cfg(feature = "lab8")]
    {
        processor::sync_current_trap_cx(cx);
        return;
    }
    #[cfg(not(feature = "lab8"))]
    PROCESS_MANAGER.with(|pm| {
        let slot = pm.current;
        if let Some(pcb) = pm.slots[slot].as_mut() {
            pcb.trap_cx = *cx;
        }
    });
}

pub fn run_next_process() -> ! {
    #[cfg(feature = "lab8")]
    {
        processor::run_next_thread();
    }
    #[cfg(not(feature = "lab8"))]
    PROCESS_MANAGER.with(|pm| {
        if pm.all_done() {
            println!("All processes exited.");
            os_sbi::shutdown();
        }
        if let Some(next) = pm.find_next_ready() {
            pm.slots[next].as_mut().unwrap().status = ProcessStatus::Running;
            let trap_cx = &mut pm.slots[next].as_mut().unwrap().trap_cx;
            run_user_task(trap_cx)
        } else {
            println!("All processes exited.");
            os_sbi::shutdown();
        }
    })
}

pub fn sys_getpid() -> isize {
    current_pid() as isize
}

pub fn sys_fork(cx: &mut TrapContext) -> isize {
    let parent_slot = current_slot();
    PROCESS_MANAGER.with(|pm| {
        let parent = pm.slots[parent_slot]
            .as_ref()
            .expect("fork without current process");
        let parent_space = parent.space_id;
        let child_slot = pm.alloc_slot();
        let child_space = pm.alloc_space_id();

        mm::fork_user_space(parent_space, child_space);

        let mut child_trap_cx = *cx;
        child_trap_cx.set_return_value(0);

        #[cfg(feature = "lab8")]
        let child_pid = pm.spawn_process(child_slot, child_space, Some(parent_slot));
        #[cfg(not(feature = "lab8"))]
        let child_pid = pm.spawn(child_slot, child_space, cx.sepc, Some(parent_slot));

        #[cfg(feature = "lab6")]
        let (parent_priority, parent_stride) = {
            let parent_pcb = pm.slots[parent_slot].as_ref().unwrap();
            (parent_pcb.priority, parent_pcb.stride)
        };
        #[cfg(feature = "lab7")]
        let parent_signal = pm.slots[parent_slot].as_ref().unwrap().signal.clone();

        #[cfg(feature = "lab8")]
        {
            let child_pcb = pm.slots[child_slot].as_mut().unwrap();
            #[cfg(feature = "lab6")]
            {
                child_pcb.priority = parent_priority;
                child_pcb.stride = parent_stride;
            }
            #[cfg(feature = "lab7")]
            {
                child_pcb.signal = parent_signal.from_fork();
                child_pcb.saved_trap_cx = None;
                child_pcb.in_signal_handler = false;
            }
            child_pcb.status = ProcessStatus::Ready;
            processor::fork_thread(parent_slot, child_slot, child_trap_cx);
            return child_pid as isize;
        }

        #[cfg(not(feature = "lab8"))]
        {
            let child_pcb = pm.slots[child_slot].as_mut().unwrap();
            child_pcb.trap_cx = child_trap_cx;
            child_pcb.trap_cx.kernel_sp = kernel_stack_top(child_slot);
            #[cfg(feature = "lab6")]
            {
                child_pcb.priority = parent_priority;
                child_pcb.stride = parent_stride;
            }
            #[cfg(feature = "lab7")]
            {
                child_pcb.signal = parent_signal.from_fork();
                child_pcb.saved_trap_cx = None;
                child_pcb.in_signal_handler = false;
            }
            child_pcb.status = ProcessStatus::Ready;
            child_pid as isize
        }
    })
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

pub fn sys_execve(cx: &mut TrapContext, path: *const u8, path_len: usize, _envp: usize) -> isize {
    let name_buf = match read_user_str(path, path_len) {
        Some(b) => b,
        None => return -1,
    };
    let name = match core::str::from_utf8(&name_buf[..path_len]) {
        Ok(s) => s,
        Err(_) => return -1,
    };

    let slot = current_slot();
    let space_id = PROCESS_MANAGER.with(|pm| {
        pm.slots[slot]
            .as_ref()
            .expect("exec without process")
            .space_id
    });

    #[cfg(feature = "lab8")]
    {
        processor::reset_process_for_exec(slot);
        with_pcb_slot(slot, |pcb| {
            pcb.mutex = None;
            pcb.semaphore_list.clear();
            pcb.condvar = None;
            pcb.pending_condvar_wake = None;
            pcb.deadlock = DeadlockState::default();
            pcb.alive_threads = 1;
        });
    }

    #[cfg(feature = "lab6")]
    {
        let entry = if let Some(elf) = get_app_elf_by_name(name) {
            let entry = mm::elf_entry_point(elf);
            mm::replace_user_space_from_static(space_id, elf);
            entry
        } else if cfg!(not(feature = "lab8")) {
            if let Some(elf) = fs::read_file_all(name) {
                let entry = mm::elf_entry_point(&elf);
                mm::replace_user_space_from_elf(space_id, elf);
                entry
            } else {
                return -1;
            }
        } else {
            return -1;
        };
        let user_sp = APP_BASE_ADDRESS + APP_REGION_SIZE - 16;
        #[cfg(not(feature = "lab8"))]
        let kstack_top = kernel_stack_top(slot);
        #[cfg(feature = "lab8")]
        let kstack_top = cx.kernel_sp;
        *cx = trap_cx_init(entry, user_sp, kstack_top);
        #[cfg(feature = "lab8")]
        {
            processor::reset_current_thread_after_exec(slot, entry, user_sp, kstack_top);
        }
        run_user_task(cx);
    }
    #[cfg(not(feature = "lab6"))]
    {
        let elf = match get_app_elf_by_name(name) {
            Some(e) => e,
            None => return -1,
        };
        mm::replace_user_space(space_id, elf);
        let entry = mm::elf_entry_point(elf);
        let user_sp = APP_BASE_ADDRESS + APP_REGION_SIZE - 16;
        let kstack_top = kernel_stack_top(slot);
        *cx = trap_cx_init(entry, user_sp, kstack_top);
        run_user_task(cx);
    }
}

#[cfg(feature = "lab6")]
pub fn sys_spawn(path: *const u8, path_len: usize) -> isize {
    let name_buf = match read_user_str(path, path_len) {
        Some(b) => b,
        None => return -1,
    };
    let name = match core::str::from_utf8(&name_buf[..path_len]) {
        Ok(s) => s,
        Err(_) => return -1,
    };
    let elf = match fs::read_file_all(name) {
        Some(e) => e,
        None => return -1,
    };
    PROCESS_MANAGER.with(|pm| {
        let parent_slot = pm.current;
        let child_slot = pm.alloc_slot();
        let child_space = pm.alloc_space_id();
        let entry = mm::elf_entry_point(&elf);
        mm::create_user_space_from_elf(child_space, elf);
        let child_pid = pm.spawn(child_slot, child_space, entry, Some(parent_slot));
        let child_pcb = pm.slots[child_slot].as_mut().unwrap();
        child_pcb.status = ProcessStatus::Ready;
        child_pid as isize
    })
}

#[cfg(feature = "lab6")]
pub fn sys_set_priority(prio: isize) -> isize {
    if prio < 2 {
        return -1;
    }
    PROCESS_MANAGER.with(|pm| {
        let slot = pm.current;
        let pcb = pm.slots[slot].as_mut().expect("set_priority without process");
        pcb.priority = prio as usize;
        prio
    })
}

fn write_user_i32(ptr: *mut i32, value: i32) -> bool {
    if ptr.is_null() {
        return true;
    }
    mm::activate_current_user();
    unsafe {
        core::ptr::write_volatile(ptr, value);
    }
    mm::activate_kernel();
    true
}

fn reap_zombie_child(parent_slot: usize, want_pid: isize) -> Option<(usize, i32)> {
    PROCESS_MANAGER.with(|pm| {
        for i in 0..MAX_PROCESS_NUM {
            let Some(pcb) = pm.slots[i].as_ref() else {
                continue;
            };
            if pcb.status != ProcessStatus::Zombie {
                continue;
            }
            if pcb.parent_slot != Some(parent_slot) {
                continue;
            }
            if want_pid >= 0 && pcb.pid as isize != want_pid {
                continue;
            }
            let pid = pcb.pid;
            let code = pcb.exit_code;
            let space_id = pcb.space_id;
            #[cfg(feature = "lab5")]
            fs::close_all_fds(i);
            pm.slots[i] = None;
            pm.process_count -= 1;
            mm::free_user_space(space_id);
            return Some((pid, code));
        }
        None
    })
}

/// 【Lab4 任务：补全】阻塞等待子进程并回收僵尸，见文件头要求。
///
/// 预期行为：
/// 1. 循环先尝试 `reap_zombie_child(current_slot(), want_pid)`；
/// 2. 找到僵尸：写回退出码并返回 pid；
/// 3. `want_pid >= 0` 且无活子进程：返回 -1；
/// 4. 子进程未退出：回退 sepc、保存上下文、标记 Ready、`run_next_process()` 让出 CPU。
pub fn sys_wait4(cx: &mut TrapContext, want_pid: isize, status_ptr: *mut i32) -> isize {
    todo!("Lab4：实现阻塞等待与僵尸回收（见上方思路提示）")
}

pub fn sys_exit(exit_code: i32) -> ! {
    #[cfg(feature = "lab8")]
    {
        processor::thread_exit(exit_code);
    }
    #[cfg(not(feature = "lab8"))]
    PROCESS_MANAGER.with(|pm| {
        let slot = pm.current;
        let pid = pm.slots[slot].as_ref().unwrap().pid;
        let pcb = pm.slots[slot].as_mut().unwrap();
        pcb.exit_code = exit_code;
        pcb.status = ProcessStatus::Zombie;
        println!("Process {} exited with code {}", pid, exit_code);
        run_next_process()
    })
}

pub fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize {
    if fd == 1 {
        mm::activate_current_user();
        let user_slice = unsafe { core::slice::from_raw_parts(buf, len) };
        let mut kbuf = [0u8; 256];
        let n = len.min(kbuf.len());
        kbuf[..n].copy_from_slice(&user_slice[..n]);
        mm::activate_kernel();
        match core::str::from_utf8(&kbuf[..n]) {
            Ok(s) => {
                print!("{}", s);
                n as isize
            }
            Err(_) => -1,
        }
    } else {
        #[cfg(feature = "lab5")]
        {
            fs::sys_write(fd, buf, len)
        }
        #[cfg(not(feature = "lab5"))]
        {
            let _ = (buf, len);
            -1
        }
    }
}
