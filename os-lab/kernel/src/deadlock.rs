//! Per-process deadlock detection state (banker's algorithm + mutex wait graph).

use alloc::{
    collections::BTreeMap,
    vec,
    vec::Vec,
};

use os_sync::ThreadId;

/// Process-local deadlock detection bookkeeping.
#[derive(Default)]
pub struct DeadlockState {
    pub enabled: bool,
    semaphore_total: Vec<usize>,
    semaphore_alloc: BTreeMap<ThreadId, Vec<usize>>,
    semaphore_need: BTreeMap<ThreadId, Vec<usize>>,
    mutex_owner: Vec<Option<ThreadId>>,
    mutex_wait: BTreeMap<ThreadId, usize>,
}

impl DeadlockState {
    fn ensure_sem_row(
        rows: &mut BTreeMap<ThreadId, Vec<usize>>,
        tid: ThreadId,
        width: usize,
    ) -> &mut Vec<usize> {
        let row = rows.entry(tid).or_insert_with(|| vec![0; width]);
        if row.len() < width {
            row.resize(width, 0);
        }
        row
    }

    fn trim_sem_row(rows: &mut BTreeMap<ThreadId, Vec<usize>>, tid: ThreadId) {
        if rows
            .get(&tid)
            .is_some_and(|row| row.iter().all(|&v| v == 0))
        {
            rows.remove(&tid);
        }
    }

    pub fn register_semaphore(&mut self, total: usize) -> usize {
        self.semaphore_total.push(total);
        let new_width = self.semaphore_total.len();
        self.semaphore_alloc
            .values_mut()
            .for_each(|row| row.resize(new_width, 0));
        self.semaphore_need
            .values_mut()
            .for_each(|row| row.resize(new_width, 0));
        new_width - 1
    }

    pub fn register_mutex(&mut self) -> usize {
        self.mutex_owner.push(None);
        self.mutex_owner.len() - 1
    }

    pub fn semaphore_acquired(&mut self, tid: ThreadId, sem_id: usize) {
        let width = self.semaphore_total.len();
        let row = Self::ensure_sem_row(&mut self.semaphore_alloc, tid, width);
        row[sem_id] += 1;
    }

    pub fn semaphore_wait(&mut self, tid: ThreadId, sem_id: usize) {
        let width = self.semaphore_total.len();
        let row = Self::ensure_sem_row(&mut self.semaphore_need, tid, width);
        row[sem_id] += 1;
    }

    pub fn semaphore_cancel_wait(&mut self, tid: ThreadId, sem_id: usize) {
        if let Some(row) = self.semaphore_need.get_mut(&tid) {
            if sem_id < row.len() && row[sem_id] > 0 {
                row[sem_id] -= 1;
            }
        }
        Self::trim_sem_row(&mut self.semaphore_need, tid);
    }

    pub fn semaphore_release(
        &mut self,
        tid: ThreadId,
        sem_id: usize,
        waking_tid: Option<ThreadId>,
    ) {
        if let Some(row) = self.semaphore_alloc.get_mut(&tid) {
            if sem_id < row.len() && row[sem_id] > 0 {
                row[sem_id] -= 1;
            }
        }
        Self::trim_sem_row(&mut self.semaphore_alloc, tid);
        if let Some(waking_tid) = waking_tid {
            self.semaphore_cancel_wait(waking_tid, sem_id);
            self.semaphore_acquired(waking_tid, sem_id);
        }
    }

    fn semaphore_available(&self) -> Vec<usize> {
        let mut available = self.semaphore_total.clone();
        for row in self.semaphore_alloc.values() {
            for (idx, count) in row.iter().enumerate() {
                available[idx] = available[idx].saturating_sub(*count);
            }
        }
        available
    }

    pub fn semaphore_would_deadlock(
        &self,
        active_threads: &[ThreadId],
        tid: ThreadId,
        sem_id: usize,
    ) -> bool {
        let width = self.semaphore_total.len();
        if sem_id >= width {
            return false;
        }
        let mut work = self.semaphore_available();
        let mut finish = vec![false; active_threads.len()];
        loop {
            let mut progressed = false;
            for (idx, thread_id) in active_threads.iter().copied().enumerate() {
                if finish[idx] {
                    continue;
                }
                let mut need = self
                    .semaphore_need
                    .get(&thread_id)
                    .cloned()
                    .unwrap_or_else(|| vec![0; width]);
                if thread_id == tid {
                    need[sem_id] += 1;
                }
                if need
                    .iter()
                    .zip(work.iter())
                    .all(|(need, work)| need <= work)
                {
                    let alloc = self
                        .semaphore_alloc
                        .get(&thread_id)
                        .cloned()
                        .unwrap_or_else(|| vec![0; width]);
                    for (work_item, alloc_item) in work.iter_mut().zip(alloc.iter()) {
                        *work_item += *alloc_item;
                    }
                    finish[idx] = true;
                    progressed = true;
                }
            }
            if !progressed {
                break;
            }
        }
        finish.iter().any(|finished| !finished)
    }

    pub fn mutex_acquired(&mut self, tid: ThreadId, mutex_id: usize) {
        self.mutex_wait.remove(&tid);
        if mutex_id < self.mutex_owner.len() {
            self.mutex_owner[mutex_id] = Some(tid);
        }
    }

    pub fn mutex_wait(&mut self, tid: ThreadId, mutex_id: usize) {
        self.mutex_wait.insert(tid, mutex_id);
    }

    pub fn mutex_release(&mut self, tid: ThreadId, mutex_id: usize, waking_tid: Option<ThreadId>) {
        if self.mutex_owner.get(mutex_id).copied().flatten() == Some(tid) {
            if let Some(waking_tid) = waking_tid {
                self.mutex_wait.remove(&waking_tid);
                self.mutex_owner[mutex_id] = Some(waking_tid);
            } else {
                self.mutex_owner[mutex_id] = None;
            }
        }
    }

    pub fn mutex_would_deadlock(&self, tid: ThreadId, mutex_id: usize) -> bool {
        let Some(mut holder) = self.mutex_owner.get(mutex_id).copied().flatten() else {
            return false;
        };
        loop {
            if holder == tid {
                return true;
            }
            let Some(wait_mutex_id) = self.mutex_wait.get(&holder).copied() else {
                return false;
            };
            let Some(next_holder) = self.mutex_owner.get(wait_mutex_id).copied().flatten() else {
                return false;
            };
            holder = next_holder;
        }
    }

    pub fn on_thread_exit(&mut self, tid: ThreadId) {
        self.semaphore_need.remove(&tid);
        self.mutex_wait.remove(&tid);
    }
}

/// Syscall return value when deadlock detection rejects an operation.
pub const DEADLOCK_DETECTED: isize = -0xDEAD;
