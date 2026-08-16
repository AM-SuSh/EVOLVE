use spin::Mutex as SpinMutex;

use crate::wait_queue::WaitQueue;
use crate::ThreadId;

/// Blocking mutex interface used by the kernel and condvar.
pub trait MutexTrait: Send + Sync {
    fn lock(&self, tid: ThreadId) -> bool;
    fn unlock(&self) -> Option<ThreadId>;
}

/// Blocking mutex with a FIFO wait queue.
pub struct MutexBlocking {
    inner: SpinMutex<MutexBlockingInner>,
}

struct MutexBlockingInner {
    locked: bool,
    /// Holder after `lock`; handoff target after `unlock` wakes a waiter.
    owner: Option<ThreadId>,
    wait_queue: WaitQueue,
}

impl MutexBlocking {
    pub fn new() -> Self {
        Self {
            inner: SpinMutex::new(MutexBlockingInner {
                locked: false,
                owner: None,
                wait_queue: WaitQueue::new(),
            }),
        }
    }

    pub fn admit_handoff(&self, tid: ThreadId) {
        let mut inner = self.inner.lock();
        inner.locked = true;
        inner.owner = Some(tid);
    }

    pub fn holder_is(&self, tid: ThreadId) -> bool {
        let inner = self.inner.lock();
        inner.locked && inner.owner == Some(tid)
    }
}

impl Default for MutexBlocking {
    fn default() -> Self {
        Self::new()
    }
}

impl MutexTrait for MutexBlocking {
    fn lock(&self, tid: ThreadId) -> bool {
        let mut inner = self.inner.lock();
        if inner.locked {
            if inner.owner == Some(tid) {
                return true;
            }
            inner.wait_queue.push_back(tid);
            false
        } else {
            inner.locked = true;
            inner.owner = Some(tid);
            true
        }
    }

    fn unlock(&self) -> Option<ThreadId> {
        let mut inner = self.inner.lock();
        assert!(inner.locked, "mutex unlock while not locked");
        if let Some(waking) = inner.wait_queue.pop_front() {
            inner.owner = Some(waking);
            Some(waking)
        } else {
            inner.locked = false;
            inner.owner = None;
            None
        }
    }
}
