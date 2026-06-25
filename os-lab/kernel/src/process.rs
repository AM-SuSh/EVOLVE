//! Process control blocks, fork/exec/wait, and scheduling (lab4+).

use os_context::TrapContext;

use crate::config::{
    APP_BASE_ADDRESS, APP_REGION_SIZE, INITPROC_APP_ID, KERNEL_STACK_SIZE, MAX_CHILDREN,
    MAX_PROCESS_NUM,
};
use crate::loader::{get_app_elf, get_app_elf_by_name, get_app_entry};
use crate::mm::{self, elf_entry_point};
use crate::trap::{run_user_task, trap_cx_init};
#[cfg(feature = "lab5")]
use crate::fs;
use crate::{print, println};

#[derive(Copy, Clone, PartialEq)]
pub enum ProcessStatus {
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
    pub trap_cx: TrapContext,
    pub space_id: usize,
    pub kernel_stack: [u8; KERNEL_STACK_SIZE],
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

        let user_sp = APP_BASE_ADDRESS + APP_REGION_SIZE - 16;
        let kernel_stack = [0u8; KERNEL_STACK_SIZE];
        let kstack_top = kernel_stack.as_ptr() as usize + KERNEL_STACK_SIZE;
        let trap_cx = trap_cx_init(entry, user_sp, kstack_top);

        self.slots[slot] = Some(ProcessControlBlock {
            pid,
            parent_slot,
            child_slots: [0; MAX_CHILDREN],
            child_count: 0,
            exit_code: 0,
            status: ProcessStatus::Ready,
            trap_cx,
            space_id,
            kernel_stack,
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
}

static mut PROCESS_MANAGER: ProcessManager = ProcessManager::new();

pub fn current_slot() -> usize {
    unsafe { PROCESS_MANAGER.current }
}

pub fn current_space_id() -> usize {
    unsafe {
        PROCESS_MANAGER.slots[PROCESS_MANAGER.current]
            .as_ref()
            .expect("no current process")
            .space_id
    }
}

pub fn current_pid() -> usize {
    unsafe {
        PROCESS_MANAGER.slots[PROCESS_MANAGER.current]
            .as_ref()
            .expect("no current process")
            .pid
    }
}

pub fn init() {
    unsafe {
        let slot = PROCESS_MANAGER.alloc_slot();
        let space_id = PROCESS_MANAGER.alloc_space_id();
        let elf = get_app_elf(INITPROC_APP_ID);
        mm::create_user_space(space_id, elf);
        let entry = get_app_entry(INITPROC_APP_ID);
        PROCESS_MANAGER.spawn(slot, space_id, entry, None);
        PROCESS_MANAGER.current = slot;
    }
}

pub fn run_initproc() -> ! {
    unsafe {
        let slot = PROCESS_MANAGER.current;
        PROCESS_MANAGER.slots[slot].as_mut().unwrap().status = ProcessStatus::Running;
        let trap_cx = &mut PROCESS_MANAGER.slots[slot].as_mut().unwrap().trap_cx;
        run_user_task(trap_cx);
    }
}

pub fn mark_current_ready() {
    unsafe {
        let slot = PROCESS_MANAGER.current;
        let pcb = PROCESS_MANAGER.slots[slot].as_mut().unwrap();
        pcb.status = ProcessStatus::Ready;
    }
}

pub fn sync_current_trap_cx(cx: &TrapContext) {
    unsafe {
        let slot = PROCESS_MANAGER.current;
        if let Some(pcb) = PROCESS_MANAGER.slots[slot].as_mut() {
            pcb.trap_cx = *cx;
        }
    }
}

pub fn run_next_process() -> ! {
    unsafe {
        if PROCESS_MANAGER.all_done() {
            println!("All processes exited.");
            os_sbi::shutdown();
        }
        if let Some(next) = PROCESS_MANAGER.find_next_ready() {
            PROCESS_MANAGER.slots[next].as_mut().unwrap().status = ProcessStatus::Running;
            let trap_cx = &mut PROCESS_MANAGER.slots[next].as_mut().unwrap().trap_cx;
            run_user_task(trap_cx);
        } else {
            println!("All processes exited.");
            os_sbi::shutdown();
        }
    }
}

pub fn sys_getpid() -> isize {
    current_pid() as isize
}

pub fn sys_fork(cx: &mut TrapContext) -> isize {
    unsafe {
        let parent_slot = PROCESS_MANAGER.current;
        let parent = PROCESS_MANAGER.slots[parent_slot]
            .as_ref()
            .expect("fork without current process");
        let parent_space = parent.space_id;
        let child_slot = PROCESS_MANAGER.alloc_slot();
        let child_space = PROCESS_MANAGER.alloc_space_id();

        mm::fork_user_space(parent_space, child_space);

        let mut child_trap_cx = *cx;
        child_trap_cx.set_return_value(0);

        let child_pid = PROCESS_MANAGER.spawn(
            child_slot,
            child_space,
            cx.sepc,
            Some(parent_slot),
        );
        let child_pcb = PROCESS_MANAGER.slots[child_slot].as_mut().unwrap();
        child_pcb.trap_cx = child_trap_cx;
        child_pcb.trap_cx.kernel_sp =
            child_pcb.kernel_stack.as_ptr() as usize + KERNEL_STACK_SIZE;
        child_pcb.status = ProcessStatus::Ready;

        child_pid as isize
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

pub fn sys_execve(cx: &mut TrapContext, path: *const u8, path_len: usize, _envp: usize) -> isize {
    let name_buf = match read_user_str(path, path_len) {
        Some(b) => b,
        None => return -1,
    };
    let name = match core::str::from_utf8(&name_buf[..path_len]) {
        Ok(s) => s,
        Err(_) => return -1,
    };
    let elf = match get_app_elf_by_name(name) {
        Some(e) => e,
        None => return -1,
    };

    let slot = unsafe { PROCESS_MANAGER.current };
    let space_id = unsafe {
        PROCESS_MANAGER.slots[slot]
            .as_ref()
            .expect("exec without process")
            .space_id
    };

    mm::replace_user_space(space_id, elf);
    let entry = elf_entry_point(elf);
    let user_sp = APP_BASE_ADDRESS + APP_REGION_SIZE - 16;
    let kstack_top = unsafe {
        PROCESS_MANAGER.slots[slot]
            .as_mut()
            .unwrap()
            .kernel_stack
            .as_ptr() as usize
            + KERNEL_STACK_SIZE
    };
    *cx = trap_cx_init(entry, user_sp, kstack_top);
    run_user_task(cx);
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
  unsafe {
    for i in 0..MAX_PROCESS_NUM {
        let Some(pcb) = PROCESS_MANAGER.slots[i].as_ref() else {
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
        PROCESS_MANAGER.slots[i] = None;
        PROCESS_MANAGER.process_count -= 1;
        mm::free_user_space(space_id);
        return Some((pid, code));
    }
    None
  }
}

pub fn sys_wait4(cx: &mut TrapContext, want_pid: isize, status_ptr: *mut i32) -> isize {
    unsafe {
        let parent_slot = PROCESS_MANAGER.current;
        if let Some((pid, code)) = reap_zombie_child(parent_slot, want_pid) {
            if !write_user_i32(status_ptr, code) {
                return -1;
            }
            return pid as isize;
        }
        if want_pid >= 0 {
            let has_child = PROCESS_MANAGER.slots.iter().any(|slot| {
                slot.as_ref().is_some_and(|pcb| {
                    pcb.parent_slot == Some(parent_slot) && pcb.status != ProcessStatus::Zombie
                })
            });
            if !has_child {
                return -1;
            }
        }
    }
    // Cooperative wait: yield and re-enter this syscall when scheduled again.
    sync_current_trap_cx(cx);
    mark_current_ready();
    run_next_process();
}

pub fn sys_exit(exit_code: i32) -> ! {
    unsafe {
        let slot = PROCESS_MANAGER.current;
        let pid = PROCESS_MANAGER.slots[slot].as_ref().unwrap().pid;
        let pcb = PROCESS_MANAGER.slots[slot].as_mut().unwrap();
        pcb.exit_code = exit_code;
        pcb.status = ProcessStatus::Zombie;
        println!("Process {} exited with code {}", pid, exit_code);
        run_next_process();
    }
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
