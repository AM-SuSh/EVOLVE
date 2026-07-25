//! Fixed-capacity FIFO wait queue (no heap).

use crate::ThreadId;

const MAX_WAITERS: usize = 32;

#[derive(Clone, Copy)]
pub(crate) struct WaitQueue {
    items: [ThreadId; MAX_WAITERS],
    head: usize,
    len: usize,
}

impl WaitQueue {
    pub const fn new() -> Self {
        Self {
            items: [0; MAX_WAITERS],
            head: 0,
            len: 0,
        }
    }

    pub fn push_back(&mut self, tid: ThreadId) {
        assert!(self.len < MAX_WAITERS, "wait queue full");
        let tail = (self.head + self.len) % MAX_WAITERS;
        self.items[tail] = tid;
        self.len += 1;
    }

    pub fn pop_front(&mut self) -> Option<ThreadId> {
        if self.len == 0 {
            return None;
        }
        let tid = self.items[self.head];
        self.head = (self.head + 1) % MAX_WAITERS;
        self.len -= 1;
        Some(tid)
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn remove(&mut self, tid: ThreadId) {
        if self.len == 0 {
            return;
        }
        let mut write = 0;
        for read in 0..self.len {
            let idx = (self.head + read) % MAX_WAITERS;
            if self.items[idx] != tid {
                let out = (self.head + write) % MAX_WAITERS;
                self.items[out] = self.items[idx];
                write += 1;
            }
        }
        self.len = write;
    }
}
