//! Thread scheduling layer for lab8 (process/thread dual management).

use os_context::TrapContext;

use crate::cell::SyncUnsafeCell;
use crate::config::{KERNEL_STACK_SIZE, MAX_PROCESS_NUM, MAX_THREADS};
use crate::process::{self, ProcessStatus};
use crate::trap::{run_user_task, trap_cx_init};
use crate::println;

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum ThreadStatus {
    Ready,
    Running,
    Blocked,
    Zombie,
}

pub struct ThreadControlBlock {
    pub tid: usize,
    pub process_slot: usize,
    pub status: ThreadStatus,
    pub trap_cx: TrapContext,
    pub exit_code: i32,
    /// Extra user stack region base (`0` = main/default stack).
    pub user_stack_va: usize,
    /// Mutex was handed to this thread by unlock / condvar_wait.
    pub mutex_handoff: bool,
}

/// Fixed-capacity thread-slot list (no heap).
#[derive(Clone, Copy)]
struct ThreadSlotList {
    slots: [usize; MAX_THREADS],
    len: usize,
}

impl ThreadSlotList {
    const fn new() -> Self {
        Self {
            slots: [0; MAX_THREADS],
            len: 0,
        }
    }

    fn clear(&mut self) {
        self.len = 0;
    }

    fn push(&mut self, slot: usize) {
        assert!(self.len < MAX_THREADS, "process thread list full");
        self.slots[self.len] = slot;
        self.len += 1;
    }

    fn iter(&self) -> impl Iterator<Item = usize> + '_ {
        self.slots[..self.len].iter().copied()
    }
}

/// Fixed-capacity ready queue (no heap).
#[derive(Clone, Copy)]
struct ReadyQueue {
    slots: [usize; MAX_THREADS],
    head: usize,
    len: usize,
}

impl ReadyQueue {
    const fn new() -> Self {
        Self {
            slots: [0; MAX_THREADS],
            head: 0,
            len: 0,
        }
    }

    fn clear(&mut self) {
        self.head = 0;
        self.len = 0;
    }

    fn contains(&self, slot: usize) -> bool {
        for i in 0..self.len {
            let idx = (self.head + i) % MAX_THREADS;
            if self.slots[idx] == slot {
                return true;
            }
        }
        false
    }

    fn push_back(&mut self, slot: usize) {
        assert!(self.len < MAX_THREADS, "ready queue full");
        let tail = (self.head + self.len) % MAX_THREADS;
        self.slots[tail] = slot;
        self.len += 1;
    }

    fn pop_front(&mut self) -> Option<usize> {
        if self.len == 0 {
            return None;
        }
        let slot = self.slots[self.head];
        self.head = (self.head + 1) % MAX_THREADS;
        self.len -= 1;
        Some(slot)
    }

    fn remove(&mut self, slot: usize) {
        if self.len == 0 {
            return;
        }
        let mut write = 0;
        for read in 0..self.len {
            let idx = (self.head + read) % MAX_THREADS;
            if self.slots[idx] != slot {
                let out = (self.head + write) % MAX_THREADS;
                self.slots[out] = self.slots[idx];
                write += 1;
            }
        }
        self.len = write;
    }

    fn len(&self) -> usize {
        self.len
    }
}

struct Processor {
    next_tid: usize,
    current: Option<usize>,
    thread_count: usize,
    last_sched_slot: usize,
    ready_queue: ReadyQueue,
    slots: [Option<ThreadControlBlock>; MAX_THREADS],
    process_threads: [ThreadSlotList; MAX_PROCESS_NUM],
    /// Blocked `waittid` waiter: thread slot -> target tid.
    wait_targets: [Option<usize>; MAX_THREADS],
}

impl Processor {
    const fn new() -> Self {
        Self {
            next_tid: 0,
            current: None,
            thread_count: 0,
            last_sched_slot: 0,
            ready_queue: ReadyQueue::new(),
            slots: [const { None }; MAX_THREADS],
            process_threads: [const { ThreadSlotList::new() }; MAX_PROCESS_NUM],
            wait_targets: [const { None }; MAX_THREADS],
        }
    }

    fn wake_waittid(&mut self, exited_tid: usize) {
        for slot in 0..MAX_THREADS {
            if self.wait_targets[slot] != Some(exited_tid) {
                continue;
            }
            self.wait_targets[slot] = None;
            if self.slots[slot]
                .as_ref()
                .is_some_and(|t| t.status == ThreadStatus::Blocked)
            {
                self.enqueue_ready(slot);
            }
        }
    }

    fn alloc_thread_slot(&mut self) -> usize {
        for i in 0..MAX_THREADS {
            if self.slots[i].is_none() {
                return i;
            }
        }
        panic!("out of thread slots");
    }

    fn kernel_stack_top(thread_slot: usize) -> usize {
        unsafe { KERNEL_STACKS[thread_slot].as_ptr() as usize + KERNEL_STACK_SIZE }
    }

    fn enqueue_ready(&mut self, thread_slot: usize) {
        let tcb = self.slots[thread_slot].as_mut().unwrap();
        if tcb.status == ThreadStatus::Zombie {
            return;
        }
        tcb.status = ThreadStatus::Ready;
        if !self.ready_queue.contains(thread_slot) {
            self.ready_queue.push_back(thread_slot);
        }
    }

    fn find_next_ready(&mut self) -> Option<usize> {
        while let Some(slot) = self.ready_queue.pop_front() {
            if self.slots[slot]
                .as_ref()
                .is_some_and(|t| t.status == ThreadStatus::Ready)
            {
                self.last_sched_slot = slot;
                return Some(slot);
            }
        }
        let mut best: Option<(usize, u128, usize)> = None;
        for offset in 0..MAX_THREADS {
            let slot = (self.last_sched_slot + 1 + offset) % MAX_THREADS;
            let Some(tcb) = self.slots[slot].as_ref() else {
                continue;
            };
            if tcb.status != ThreadStatus::Ready {
                continue;
            }
            let (stride, pid) =
                process::with_pcb_ref(tcb.process_slot, |pcb| (pcb.stride, pcb.pid));
            match best {
                Some((_, best_stride, best_pid))
                    if stride > best_stride || (stride == best_stride && pid > best_pid) => {}
                _ => best = Some((slot, stride, pid)),
            }
        }
        let (slot, _, _) = best?;
        self.last_sched_slot = slot;
        let process_slot = self.slots[slot].as_ref().unwrap().process_slot;
        process::with_pcb_slot(process_slot, |pcb| pcb.advance_stride());
        Some(slot)
    }

    fn add_thread(
        &mut self,
        process_slot: usize,
        entry: usize,
        user_sp: usize,
        stack_va: usize,
        arg: usize,
    ) -> usize {
        let thread_slot = self.alloc_thread_slot();
        let tid = self.next_tid;
        self.next_tid += 1;

        let kstack_top = Self::kernel_stack_top(thread_slot);
        let mut trap_cx = trap_cx_init(entry, user_sp, kstack_top);
        trap_cx.x[os_context::REG_A0] = arg;

        self.slots[thread_slot] = Some(ThreadControlBlock {
            tid,
            process_slot,
            status: ThreadStatus::Ready,
            trap_cx,
            exit_code: 0,
            user_stack_va: stack_va,
            mutex_handoff: false,
        });
        self.process_threads[process_slot].push(thread_slot);
        self.thread_count += 1;
        process::with_pcb_slot(process_slot, |pcb| pcb.alive_threads += 1);
        self.enqueue_ready(thread_slot);
        tid
    }
}

static mut KERNEL_STACKS: [[u8; KERNEL_STACK_SIZE]; MAX_THREADS] =
    [[0; KERNEL_STACK_SIZE]; MAX_THREADS];

static PROCESSOR: SyncUnsafeCell<Processor> = SyncUnsafeCell::new(Processor::new());

pub fn spawn_main_thread(process_slot: usize, entry: usize, user_sp: usize) {
    PROCESSOR.with(|proc| {
        let thread_slot = proc.alloc_thread_slot();
        let tid = proc.next_tid;
        proc.next_tid += 1;
        let kstack_top = Processor::kernel_stack_top(thread_slot);
        let trap_cx = trap_cx_init(entry, user_sp, kstack_top);
        proc.slots[thread_slot] = Some(ThreadControlBlock {
            tid,
            process_slot,
            status: ThreadStatus::Running,
            trap_cx,
            exit_code: 0,
            user_stack_va: 0,
            mutex_handoff: false,
        });
        proc.process_threads[process_slot].push(thread_slot);
        proc.thread_count += 1;
        process::with_pcb_slot(process_slot, |pcb| {
            pcb.alive_threads = 1;
        });
        proc.current = Some(thread_slot);
    });
}

pub fn current_tid() -> usize {
    PROCESSOR.with_ref(|proc| {
        let slot = proc.current.expect("no current thread");
        proc.slots[slot].as_ref().unwrap().tid
    })
}

pub fn current_thread_slot() -> usize {
    PROCESSOR.with_ref(|proc| proc.current.expect("no current thread"))
}

pub fn current_process_slot() -> usize {
    PROCESSOR.with_ref(|proc| {
        let slot = proc.current.expect("no current thread");
        proc.slots[slot].as_ref().unwrap().process_slot
    })
}

pub fn sync_current_trap_cx(cx: &TrapContext) {
    PROCESSOR.with(|proc| {
        let slot = proc.current.expect("no current thread");
        proc.slots[slot].as_mut().unwrap().trap_cx = *cx;
    });
}

pub fn with_current_trap_cx<R>(f: impl FnOnce(&mut TrapContext) -> R) -> R {
    PROCESSOR.with(|proc| {
        let slot = proc.current.expect("no current thread");
        f(&mut proc.slots[slot].as_mut().unwrap().trap_cx)
    })
}

pub fn sync_trap_cx_for_slot(slot: usize, cx: &TrapContext) {
    PROCESSOR.with(|proc| {
        proc.slots[slot].as_mut().unwrap().trap_cx = *cx;
    });
}

pub fn mark_thread_ready(slot: usize) {
    PROCESSOR.with(|proc| proc.enqueue_ready(slot));
}

pub fn mark_current_ready() {
    PROCESSOR.with(|proc| {
        let slot = proc.current.expect("no current thread");
        proc.enqueue_ready(slot);
    });
}

pub fn make_current_blocked() {
    PROCESSOR.with(|proc| {
        let slot = proc.current.expect("no current thread");
        proc.ready_queue.remove(slot);
        proc.slots[slot].as_mut().unwrap().status = ThreadStatus::Blocked;
    });
}

pub fn re_enque(tid: usize) {
    PROCESSOR.with(|proc| {
        for slot in 0..MAX_THREADS {
            let Some(tcb) = proc.slots[slot].as_ref() else {
                continue;
            };
            if tcb.tid == tid {
                if tcb.status == ThreadStatus::Zombie {
                    return;
                }
                proc.enqueue_ready(slot);
                return;
            }
        }
    });
}

pub fn active_thread_ids(process_slot: usize, out: &mut [usize; MAX_THREADS]) -> usize {
    PROCESSOR.with_ref(|proc| {
        let mut n = 0usize;
        for slot in proc.process_threads[process_slot].iter() {
            let Some(tcb) = proc.slots[slot].as_ref() else {
                continue;
            };
            if matches!(tcb.status, ThreadStatus::Zombie) {
                continue;
            }
            if n < MAX_THREADS {
                out[n] = tcb.tid;
                n += 1;
            }
        }
        n
    })
}

pub fn run_init_thread() -> ! {
    PROCESSOR.with(|proc| {
        let slot = proc.current.expect("no init thread");
        proc.slots[slot].as_mut().unwrap().status = ThreadStatus::Running;
        let trap_cx = &mut proc.slots[slot].as_mut().unwrap().trap_cx;
        run_user_task(trap_cx)
    })
}

pub fn run_next_thread() -> ! {
    PROCESSOR.with(|proc| {
        if proc.thread_count == 0 {
            println!("All threads exited.");
            os_sbi::shutdown();
        }
        if let Some(next) = proc.find_next_ready() {
            proc.current = Some(next);
            proc.slots[next].as_mut().unwrap().status = ThreadStatus::Running;
            let trap_cx = &mut proc.slots[next].as_mut().unwrap().trap_cx;
            run_user_task(trap_cx)
        } else {
            println!(
                "Scheduler stall: {} threads, none ready.",
                proc.thread_count
            );
            os_sbi::shutdown();
        }
    })
}

pub fn yield_current_and_run_next(cx: &TrapContext) -> ! {
    sync_current_trap_cx(cx);
    mark_current_ready();
    run_next_thread()
}

pub fn block_thread_slot_and_run_next(slot: usize, cx: &TrapContext) -> ! {
    PROCESSOR.with(|proc| {
        let tcb = proc.slots[slot].as_mut().unwrap();
        if tcb.mutex_handoff {
            let mut updated = *cx;
            updated.set_return_value(0);
            updated.sepc = updated.sepc.wrapping_add(4);
            tcb.trap_cx = updated;
            proc.enqueue_ready(slot);
        } else {
            tcb.trap_cx = *cx;
            proc.ready_queue.remove(slot);
            tcb.status = ThreadStatus::Blocked;
        }
    });
    run_next_thread()
}

pub fn block_thread_by_tid(tid: usize, cx: &TrapContext) -> ! {
    PROCESSOR.with(|proc| {
        for slot in 0..MAX_THREADS {
            if proc.slots[slot]
                .as_ref()
                .is_some_and(|t| t.tid == tid)
            {
                proc.slots[slot].as_mut().unwrap().trap_cx = *cx;
                proc.slots[slot].as_mut().unwrap().status = ThreadStatus::Blocked;
                return;
            }
        }
    });
    run_next_thread()
}

pub fn block_current_and_run_next(cx: &TrapContext) -> ! {
    let slot = PROCESSOR.with_ref(|proc| proc.current.expect("no current thread"));
    block_thread_slot_and_run_next(slot, cx)
}

pub fn thread_exit(exit_code: i32) -> ! {
    PROCESSOR.with(|proc| {
        let slot = proc.current.expect("no current thread");
        let (tid, process_slot) = {
            let tcb = proc.slots[slot].as_mut().unwrap();
            tcb.exit_code = exit_code;
            tcb.status = ThreadStatus::Zombie;
            (tcb.tid, tcb.process_slot)
        };
        println!("Thread {} exited with code {}", tid, exit_code);
        process::with_pcb_slot(process_slot, |pcb| {
            pcb.deadlock.on_thread_exit(tid);
            pcb.alive_threads -= 1;
            if pcb.alive_threads == 0 {
                pcb.exit_code = exit_code;
                pcb.status = ProcessStatus::Zombie;
                println!("Process {} exited with code {}", pcb.pid, exit_code);
            }
        });
        proc.wake_waittid(tid);
        proc.thread_count -= 1;
        run_next_thread()
    })
}

pub fn reset_process_for_exec(process_slot: usize) {
    PROCESSOR.with(|proc| {
        let current = proc.current;
        for thread_slot in 0..MAX_THREADS {
            let Some(tcb) = proc.slots[thread_slot].as_ref() else {
                continue;
            };
            if tcb.process_slot != process_slot {
                continue;
            }
            if Some(thread_slot) == current {
                continue;
            }
            let stack_va = tcb.user_stack_va;
            proc.slots[thread_slot] = None;
            proc.wait_targets[thread_slot] = None;
            proc.thread_count = proc.thread_count.saturating_sub(1);
            if stack_va != 0 {
                crate::mm::free_thread_user_stack(process_slot, stack_va);
            }
        }
        proc.process_threads[process_slot].clear();
        proc.process_threads[process_slot].push(
            proc.current.expect("exec without current thread"),
        );
        proc.ready_queue.clear();
    });
}

pub fn reset_current_thread_after_exec(
    process_slot: usize,
    entry: usize,
    user_sp: usize,
    kstack_top: usize,
) {
    PROCESSOR.with(|proc| {
        let thread_slot = proc.current.expect("exec without current thread");
        let tcb = proc.slots[thread_slot].as_mut().unwrap();
        assert_eq!(tcb.process_slot, process_slot);
        tcb.user_stack_va = 0;
        tcb.status = ThreadStatus::Running;
        tcb.trap_cx = trap_cx_init(entry, user_sp, kstack_top);
        proc.process_threads[process_slot].clear();
        proc.process_threads[process_slot].push(thread_slot);
        proc.thread_count = 1;
    });
}

pub fn mark_mutex_handoff(tid: usize) {
    PROCESSOR.with(|proc| {
        for slot in 0..MAX_THREADS {
            if proc.slots[slot]
                .as_ref()
                .is_some_and(|t| t.tid == tid)
            {
                proc.slots[slot].as_mut().unwrap().mutex_handoff = true;
                return;
            }
        }
    });
}

pub fn take_mutex_handoff(tid: usize) -> bool {
    PROCESSOR.with(|proc| {
        for slot in 0..MAX_THREADS {
            if proc.slots[slot]
                .as_ref()
                .is_some_and(|t| t.tid == tid)
            {
                let tcb = proc.slots[slot].as_mut().unwrap();
                let handoff = tcb.mutex_handoff;
                tcb.mutex_handoff = false;
                return handoff;
            }
        }
        false
    })
}

pub fn sys_thread_create(entry: usize, arg: usize) -> isize {
    let process_slot = current_process_slot();
    let space_id = process::with_pcb_ref(process_slot, |pcb| pcb.space_id);
    let (user_sp, stack_va) = match crate::mm::alloc_thread_user_stack(space_id) {
        Some(v) => v,
        None => return -1,
    };
    PROCESSOR.with(|proc| proc.add_thread(process_slot, entry, user_sp, stack_va, arg) as isize)
}

pub fn sys_gettid() -> isize {
    current_tid() as isize
}

pub fn sys_waittid(cx: &mut TrapContext, tid: usize) -> isize {
    if tid == current_tid() {
        return -1;
    }
    loop {
        if let Some(code) = try_reap_thread(tid) {
            PROCESSOR.with(|proc| {
                if let Some(slot) = proc.current {
                    proc.wait_targets[slot] = None;
                }
            });
            return code;
        }
        PROCESSOR.with(|proc| {
            let slot = proc.current.expect("no current thread");
            proc.wait_targets[slot] = Some(tid);
        });
        cx.sepc = cx.sepc.wrapping_sub(4);
        sync_current_trap_cx(cx);
        make_current_blocked();
        run_next_thread();
    }
}

fn try_reap_thread(tid: usize) -> Option<isize> {
    PROCESSOR.with(|proc| {
        for slot in 0..MAX_THREADS {
            let Some(tcb) = proc.slots[slot].as_ref() else {
                continue;
            };
            if tcb.tid == tid && tcb.status == ThreadStatus::Zombie {
                let code = tcb.exit_code;
                let process_slot = tcb.process_slot;
                let stack_va = tcb.user_stack_va;
                proc.slots[slot] = None;
                if stack_va != 0 {
                    crate::mm::free_thread_user_stack(process_slot, stack_va);
                }
                return Some(code as isize);
            }
        }
        None
    })
}

pub fn fork_thread(_parent_process_slot: usize, child_process_slot: usize, child_trap_cx: TrapContext) {
    PROCESSOR.with(|proc| {
        let thread_slot = proc.alloc_thread_slot();
        let tid = proc.next_tid;
        proc.next_tid += 1;
        let kstack_top = Processor::kernel_stack_top(thread_slot);
        let mut trap_cx = child_trap_cx;
        trap_cx.kernel_sp = kstack_top;
        proc.slots[thread_slot] = Some(ThreadControlBlock {
            tid,
            process_slot: child_process_slot,
            status: ThreadStatus::Ready,
            trap_cx,
            exit_code: 0,
            user_stack_va: 0,
            mutex_handoff: false,
        });
        proc.process_threads[child_process_slot].push(thread_slot);
        proc.thread_count += 1;
        process::with_pcb_slot(child_process_slot, |pcb| pcb.alive_threads = 1);
        proc.enqueue_ready(thread_slot);
    })
}
