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

    /// Unlock `mutex`, enqueue `tid` on this condvar, then return the tid (if
    /// any) that the unlock handed the mutex to and that the caller must
    /// re-enqueue for scheduling. The waiting thread blocks without the mutex;
    /// re-acquisition happens through the kernel's handoff path after wake-up.
    pub fn wait_with_mutex(&self, tid: ThreadId, mutex: &MutexBlocking) -> Option<ThreadId> {
        let waking_tid = mutex.unlock();
        self.wait_enqueue(tid);
        waking_tid
    }
}

impl Default for Condvar {
    fn default() -> Self {
        Self::new()
    }
}
