use spin::Mutex as SpinMutex;

use crate::wait_queue::WaitQueue;
use crate::ThreadId;

/// Counting semaphore (`down` / `up`).
pub struct Semaphore {
    inner: SpinMutex<SemaphoreInner>,
}

struct SemaphoreInner {
    count: isize,
    wait_queue: WaitQueue,
}

impl Semaphore {
    pub fn new(res_count: usize) -> Self {
        Self {
            inner: SpinMutex::new(SemaphoreInner {
                count: res_count as isize,
                wait_queue: WaitQueue::new(),
            }),
        }
    }

    pub fn up(&self) -> Option<ThreadId> {
        let mut inner = self.inner.lock();
        inner.count += 1;
        inner.wait_queue.pop_front()
    }

    pub fn down(&self, tid: ThreadId) -> bool {
        let mut inner = self.inner.lock();
        inner.count -= 1;
        if inner.count < 0 {
            inner.wait_queue.push_back(tid);
            false
        } else {
            true
        }
    }
}
