//! 【Lab8 任务：fill】实现 `finish_blocking_syscall`——阻塞式同步返回 `-1` 时要回退 `sepc` 并切换走调度。
//!
//! 现象：当前该函数是 `todo!()`。拿不到 mutex / 信号量的线程无法真正阻塞重试，
//! `make test-lab8` 往往看不到 `mutex_test pass` / `condvar_test pass`（或会挂住）。
//!
//! 要求（对照手册「阻塞与用户态重试」）：
//! 1. 仅当 `ret == -1` 时处理（`-0xDEAD` 等死锁码不要当阻塞）；
//! 2. `cx.sepc = cx.sepc.wrapping_sub(4)`，让唤醒后重新执行这次 `ecall`；
//! 3. 调用 `processor::block_thread_slot_and_run_next(thread_slot, cx)` 标 Blocked 并调度；
//! 4. 想清楚：若不回退 `sepc`，只阻塞，唤醒后用户态会从哪条指令继续？
//!
//! 验证：`make test-lab8`，应看到 `threads_test pass`、`mutex_test pass`、
//! `condvar_test pass`、死锁与 `pipe_test pass` 等全部关键行。

//! Lab8 blocking sync and deadlock-detection syscalls.

use alloc::sync::Arc;

use os_sync::{Condvar, MutexBlocking, MutexTrait, Semaphore};

use crate::deadlock::DEADLOCK_DETECTED;
use crate::processor::{self, current_process_slot, current_tid, make_current_blocked, re_enque};
use crate::process;

fn check_mutex_id(mutex_id: usize) -> bool {
    mutex_id == 0
}

pub fn sys_enable_deadlock_detect(is_enable: i32) -> isize {
    match is_enable {
        0 => {
            process::with_pcb_slot(current_process_slot(), |pcb| pcb.deadlock.enabled = false);
            0
        }
        1 => {
            process::with_pcb_slot(current_process_slot(), |pcb| pcb.deadlock.enabled = true);
            0
        }
        _ => -1,
    }
}

pub fn sys_mutex_create(blocking: bool) -> isize {
    if !blocking {
        return -1;
    }
    process::with_pcb_slot(current_process_slot(), |pcb| {
        let first = pcb.mutex.is_none();
        pcb.mutex = Some(MutexBlocking::new());
        if first {
            pcb.deadlock.register_mutex();
        }
        0
    })
}

pub fn sys_mutex_lock(mutex_id: usize) -> isize {
    if !check_mutex_id(mutex_id) {
        return -1;
    }
    let tid = current_tid();
    let process_slot = current_process_slot();
    if processor::take_mutex_handoff(tid) {
        let acquired = process::with_pcb_slot(process_slot, |pcb| {
            if let Some(mutex) = pcb.mutex.as_ref() {
                mutex.admit_handoff(tid);
                pcb.deadlock.mutex_acquired(tid, mutex_id);
                true
            } else {
                false
            }
        });
        return if acquired { 0 } else { -1 };
    }
    let would_deadlock = process::with_pcb_ref(process_slot, |pcb| {
        pcb.deadlock.enabled && pcb.deadlock.mutex_would_deadlock(tid, mutex_id)
    });
    if would_deadlock {
        return DEADLOCK_DETECTED;
    }
    let locked = process::with_pcb_ref(process_slot, |pcb| {
        Some(pcb.mutex.as_ref()?.lock(tid))
    });
    let Some(locked) = locked else {
        return -1;
    };
    if locked {
        process::with_pcb_slot(process_slot, |pcb| pcb.deadlock.mutex_acquired(tid, mutex_id));
        0
    } else if process::with_pcb_ref(process_slot, |pcb| {
        pcb.mutex
            .as_ref()
            .is_some_and(|m| m.holder_is(tid))
    }) {
        process::with_pcb_slot(process_slot, |pcb| pcb.deadlock.mutex_acquired(tid, mutex_id));
        0
    } else {
        process::with_pcb_slot(process_slot, |pcb| pcb.deadlock.mutex_wait(tid, mutex_id));
        -1
    }
}

pub fn sys_mutex_unlock(mutex_id: usize) -> isize {
    if !check_mutex_id(mutex_id) {
        return -1;
    }
    let tid = current_tid();
    let process_slot = current_process_slot();
    let waking_tid = process::with_pcb_slot(process_slot, |pcb| {
        let waking = match pcb.mutex.as_ref() {
            Some(mutex) => mutex.unlock(),
            None => return None,
        };
        pcb.deadlock.mutex_release(tid, mutex_id, waking);
        waking
    });
    if waking_tid.is_none() && process::with_pcb_ref(process_slot, |pcb| pcb.mutex.is_none()) {
        return -1;
    }
    if let Some(tid) = waking_tid {
        processor::mark_mutex_handoff(tid);
        re_enque(tid);
    } else if let Some(tid) = process::with_pcb_slot(process_slot, |pcb| pcb.pending_condvar_wake.take()) {
        process::with_pcb_slot(process_slot, |pcb| {
            if let Some(mutex) = pcb.mutex.as_ref() {
                mutex.admit_handoff(tid);
                pcb.deadlock.mutex_acquired(tid, mutex_id);
            }
        });
        processor::mark_mutex_handoff(tid);
        re_enque(tid);
    }
    0
}

pub fn sys_semaphore_create(res_count: usize) -> isize {
    process::with_pcb_slot(current_process_slot(), |pcb| {
        let sem = Arc::new(Semaphore::new(res_count));
        let id = if let Some(id) = pcb
            .semaphore_list
            .iter()
            .position(|item| item.is_none())
        {
            pcb.semaphore_list[id] = Some(sem);
            id
        } else {
            pcb.semaphore_list.push(Some(sem));
            pcb.semaphore_list.len() - 1
        };
        pcb.deadlock.register_semaphore(res_count);
        id as isize
    })
}

pub fn sys_semaphore_up(sem_id: usize) -> isize {
    let tid = current_tid();
    let process_slot = current_process_slot();
    let waking_tid = process::with_pcb_slot(process_slot, |pcb| {
        if sem_id >= pcb.semaphore_list.len() || pcb.semaphore_list[sem_id].is_none() {
            return None;
        }
        let sem = Arc::clone(pcb.semaphore_list[sem_id].as_ref().unwrap());
        let waking = sem.up();
        pcb.deadlock.semaphore_release(tid, sem_id, waking);
        Some(waking)
    });
    let Some(waking_tid) = waking_tid else {
        return -1;
    };
    if let Some(tid) = waking_tid {
        re_enque(tid);
    }
    0
}

pub fn sys_semaphore_down(sem_id: usize) -> isize {
    let tid = current_tid();
    let process_slot = current_process_slot();
    let mut active = [0usize; crate::config::MAX_THREADS];
    let active_len = processor::active_thread_ids(process_slot, &mut active);
    let would_deadlock = process::with_pcb_ref(process_slot, |pcb| {
        pcb.deadlock.enabled
            && pcb
                .deadlock
                .semaphore_would_deadlock(&active[..active_len], tid, sem_id)
    });
    if would_deadlock {
        return DEADLOCK_DETECTED;
    }
    let acquired = process::with_pcb_ref(process_slot, |pcb| {
        if sem_id >= pcb.semaphore_list.len() || pcb.semaphore_list[sem_id].is_none() {
            return None;
        }
        let sem = Arc::clone(pcb.semaphore_list[sem_id].as_ref().unwrap());
        Some(sem.down(tid))
    });
    let Some(acquired) = acquired else {
        return -1;
    };
    if acquired {
        process::with_pcb_slot(process_slot, |pcb| pcb.deadlock.semaphore_acquired(tid, sem_id));
        0
    } else {
        process::with_pcb_slot(process_slot, |pcb| pcb.deadlock.semaphore_wait(tid, sem_id));
        -1
    }
}

pub fn sys_condvar_create() -> isize {
    process::with_pcb_slot(current_process_slot(), |pcb| {
        if pcb.condvar.is_none() {
            pcb.condvar = Some(Condvar::new());
        }
        0
    })
}

pub fn sys_condvar_signal(condvar_id: usize) -> isize {
    if condvar_id != 0 {
        return -1;
    }
    let process_slot = current_process_slot();
    process::with_pcb_slot(process_slot, |pcb| {
        if let Some(cv) = pcb.condvar.as_ref() {
            if let Some(tid) = cv.signal() {
                pcb.pending_condvar_wake = Some(tid);
            }
        }
    });
    0
}

pub fn sys_condvar_wait(condvar_id: usize, mutex_id: usize) -> isize {
    if condvar_id != 0 || !check_mutex_id(mutex_id) {
        return -1;
    }
    let tid = current_tid();
    let process_slot = current_process_slot();

    if processor::take_mutex_handoff(tid) {
        let acquired = process::with_pcb_slot(process_slot, |pcb| {
            if let Some(mutex) = pcb.mutex.as_ref() {
                mutex.admit_handoff(tid);
                pcb.deadlock.mutex_acquired(tid, mutex_id);
                true
            } else {
                false
            }
        });
        if acquired {
            return 0;
        }
    }

    let result = process::with_pcb_slot(process_slot, |pcb| {
        let cv = pcb.condvar.as_ref()?;
        let mutex = pcb.mutex.as_ref()?;
        let (got_lock, waking_tid) = cv.wait_with_mutex(tid, mutex);
        pcb.deadlock.mutex_release(tid, mutex_id, waking_tid);
        if got_lock {
            pcb.deadlock.mutex_acquired(tid, mutex_id);
        } else {
            pcb.deadlock.mutex_wait(tid, mutex_id);
        }
        Some((got_lock, waking_tid))
    });
    let Some((got_lock, waking_tid)) = result else {
        return -1;
    };
    if let Some(w_tid) = waking_tid {
        re_enque(w_tid);
    }
    if got_lock {
        0
    } else {
        -1
    }
}

/// 【Lab8 任务：fill】阻塞式同步返回 `-1` 时，把当前线程真正送进调度阻塞路径。
///
/// 思路提示（先自己想清楚再动手）：
/// 1. 只处理 `ret == -1`（死锁码 `-0xDEAD` 由用户态直接处理，不要当阻塞）；
/// 2. `cx.sepc = cx.sepc.wrapping_sub(4)`——trap 入口已对 syscall 做过 `advance_sepc`，
///    阻塞唤醒后必须重新执行同一条 `ecall`；
/// 3. `processor::block_thread_slot_and_run_next(thread_slot, cx)`：标 Blocked 并切走；
/// 4. 想清楚：若漏掉回退 `sepc`，唤醒后会从哪继续？若漏掉 `block_...`，用户 while 重试会怎样？
pub fn finish_blocking_syscall(ret: isize, cx: &mut os_context::TrapContext, thread_slot: usize) {
    todo!("Lab8：ret==-1 时回退 sepc 并 block_thread_slot_and_run_next（见上方提示）")
}

#[allow(dead_code)]
pub fn note_blocked() {
    make_current_blocked();
}
