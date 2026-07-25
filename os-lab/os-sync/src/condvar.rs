use spin::Mutex as SpinMutex;

use crate::mutex::{MutexBlocking, MutexTrait};
use crate::wait_queue::WaitQueue;
use crate::ThreadId;

/// Mesa-style condition variable with a FIFO wait queue.
pub struct Condvar {
    inner: SpinMutex<CondvarInner>,
}

struct CondvarInner {
    wait_queue: WaitQueue,
}

impl Condvar {
    pub fn new() -> Self {
        Self {
            inner: SpinMutex::new(CondvarInner {
                wait_queue: WaitQueue::new(),
            }),
        }
    }

    pub fn signal(&self) -> Option<ThreadId> {
        let mut inner = self.inner.lock();
        inner.wait_queue.pop_front()
    }

    /// Block `tid` on this condition variable (caller must release the mutex separately).
    pub fn wait_enqueue(&self, tid: ThreadId) {
        self.inner.lock().wait_queue.push_back(tid);
    }

    /// Unlock `mutex`, enqueue `tid` on this condvar, release the mutex again if re-acquired.
    pub fn wait_with_mutex(
        &self,
        tid: ThreadId,
        mutex: &MutexBlocking,
    ) -> (bool, Option<ThreadId>) {
        let waking_tid = mutex.unlock();
        if mutex.lock(tid) {
            self.wait_enqueue(tid);
            let extra_wake = mutex.unlock();
            return (false, extra_wake.or(waking_tid));
        }
        self.wait_enqueue(tid);
        (false, waking_tid)
    }
}

impl Default for Condvar {
    fn default() -> Self {
        Self::new()
    }
}
