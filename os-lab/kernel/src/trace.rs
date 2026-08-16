//! Minimal, opt-in teaching trace. The host binds parsed frames to runId.

use core::sync::atomic::{AtomicUsize, Ordering};

use crate::println;

static TRACE_SEQ: AtomicUsize = AtomicUsize::new(0);

#[cfg(feature = "lab3")]
const TRACE_VERSION: usize = 2;
#[cfg(feature = "lab3")]
const TRACE_MARKER: &str = "TRACE_V2";
#[cfg(not(feature = "lab3"))]
const TRACE_VERSION: usize = 1;
#[cfg(not(feature = "lab3"))]
const TRACE_MARKER: &str = "TRACE_V1";

fn next_seq() -> usize {
    TRACE_SEQ.fetch_add(1, Ordering::Relaxed)
}

fn current_ids() -> (usize, usize) {
    #[cfg(feature = "lab8")]
    {
        return (
            crate::process::current_pid(),
            crate::processor::current_tid(),
        );
    }
    #[cfg(all(feature = "lab4", not(feature = "lab8")))]
    {
        let pid = crate::process::current_pid();
        return (pid, pid);
    }
    #[cfg(not(feature = "lab4"))]
    {
        let task_id = crate::task::current_task_id();
        (task_id, task_id)
    }
}

pub fn trap_enter(cause: &str) {
    let (pid, tid) = current_ids();
    println!(
        "{} {{\"v\":{},\"seq\":{},\"ts\":{},\"cpu\":0,\"pid\":{},\"tid\":{},\"type\":\"trap_enter\",\"cause\":\"{}\"}}",
        TRACE_MARKER,
        TRACE_VERSION,
        next_seq(),
        crate::riscv::read_time(),
        pid,
        tid,
        cause,
    );
}

#[cfg(not(feature = "lab4"))]
pub fn task_switch(pid: usize, reason: &str) {
    println!(
        "{} {{\"v\":{},\"seq\":{},\"ts\":{},\"cpu\":0,\"pid\":{},\"tid\":{},\"type\":\"task_switch\",\"from\":\"Ready\",\"to\":\"Running\",\"reason\":\"{}\"}}",
        TRACE_MARKER,
        TRACE_VERSION,
        next_seq(),
        crate::riscv::read_time(),
        pid,
        pid,
        reason,
    );
}

pub fn syscall(id: usize, name: &str) {
    let (pid, tid) = current_ids();
    println!(
        "{} {{\"v\":{},\"seq\":{},\"ts\":{},\"cpu\":0,\"pid\":{},\"tid\":{},\"type\":\"syscall\",\"id\":{},\"name\":\"{}\"}}",
        TRACE_MARKER,
        TRACE_VERSION,
        next_seq(),
        crate::riscv::read_time(),
        pid,
        tid,
        id,
        name,
    );
}

pub fn address_space(space_id: usize, action: &str) {
    println!(
        "{} {{\"v\":{},\"seq\":{},\"ts\":{},\"cpu\":0,\"pid\":{},\"tid\":{},\"type\":\"address_space\",\"space\":{},\"action\":\"{}\"}}",
        TRACE_MARKER,
        TRACE_VERSION,
        next_seq(),
        crate::riscv::read_time(),
        space_id,
        space_id,
        space_id,
        action,
    );
}
