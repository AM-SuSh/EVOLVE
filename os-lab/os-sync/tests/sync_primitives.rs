use os_sync::{Condvar, MutexBlocking, MutexTrait, Semaphore};

#[test]
fn mutex_blocks_second_locker() {
    let m = MutexBlocking::new();
    assert!(m.lock(1));
    assert!(!m.lock(2));
    assert_eq!(m.unlock(), Some(2));
}

#[test]
fn semaphore_counts() {
    let s = Semaphore::new(1);
    assert!(s.down(1));
    assert!(!s.down(2));
    assert_eq!(s.up(), Some(2));
}

#[test]
fn condvar_signal_before_wait() {
    let cv = Condvar::new();
    let m = MutexBlocking::new();
    assert!(m.lock(1));
    assert_eq!(cv.signal(), None);
    let (got, wake) = cv.wait_with_mutex(1, &m);
    assert_eq!(wake, None);
    assert!(!got);
}

#[test]
fn condvar_enqueue_on_wait() {
    let cv = Condvar::new();
    let m = MutexBlocking::new();
    assert!(m.lock(1));
    let (got, wake) = cv.wait_with_mutex(1, &m);
    assert!(!got);
    assert_eq!(wake, None);
    assert_eq!(cv.signal(), Some(1));
}

#[test]
fn condvar_unlock_handoff_before_relock() {
    let cv = Condvar::new();
    let m = MutexBlocking::new();
    assert!(m.lock(1));
    assert!(!m.lock(2));
    let (got, wake) = cv.wait_with_mutex(1, &m);
    assert!(!got);
    assert_eq!(wake, Some(2));
    assert_eq!(cv.signal(), Some(1));
}

#[test]
fn mutex_fifo_wake_order() {
    let m = MutexBlocking::new();
    assert!(m.lock(1));
    assert!(!m.lock(2));
    assert!(!m.lock(3));
    assert_eq!(m.unlock(), Some(2));
    assert_eq!(m.unlock(), Some(3));
    assert_eq!(m.unlock(), None);
}

#[test]
fn semaphore_fifo_wake_order() {
    let s = Semaphore::new(0);
    assert!(!s.down(10));
    assert!(!s.down(11));
    assert_eq!(s.up(), Some(10));
    assert_eq!(s.up(), Some(11));
}
