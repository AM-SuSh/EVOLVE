use os_signal::{SignalState, SIGKILL, SIGUSR1};

#[test]
fn pending_and_mask() {
    let mut st = SignalState::new();
    st.receive(SIGUSR1);
    assert!(st.take_deliverable().is_some());
    st.set_mask(1 << SIGUSR1);
    st.receive(SIGUSR1);
    assert!(st.take_deliverable().is_none());
}

#[test]
fn fork_inherits_handlers() {
    let mut parent = SignalState::new();
    parent.set_handler(SIGUSR1 as usize, 0x1000);
    let child = parent.from_fork();
    assert_eq!(child.handler(SIGUSR1), 0x1000);
}

#[test]
fn fatal_default() {
    let st = SignalState::new();
    assert!(st.is_fatal_default(SIGKILL));
    assert!(!st.is_fatal_default(SIGUSR1));
}

#[test]
fn sigkill_bypasses_mask() {
    let mut st = SignalState::new();
    st.set_mask(u32::MAX);
    st.receive(SIGKILL);
    assert_eq!(st.take_deliverable(), Some(SIGKILL));
}
