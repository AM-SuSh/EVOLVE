//! Minimal, opt-in teaching trace for Lab2. The host binds parsed frames to runId.

use core::sync::atomic::{AtomicUsize, Ordering};

use crate::println;

static TRACE_SEQ: AtomicUsize = AtomicUsize::new(0);

fn next_seq() -> usize {
    TRACE_SEQ.fetch_add(1, Ordering::Relaxed)
}

pub fn trap_enter(pid: usize, cause: &str) {
    println!(
        "TRACE_V1 {{\"v\":1,\"seq\":{},\"ts\":{},\"cpu\":0,\"pid\":{},\"tid\":{},\"type\":\"trap_enter\",\"cause\":\"{}\"}}",
        next_seq(),
        crate::riscv::read_time(),
        pid,
        pid,
        cause,
    );
}

pub fn task_switch(pid: usize, reason: &str) {
    println!(
        "TRACE_V1 {{\"v\":1,\"seq\":{},\"ts\":{},\"cpu\":0,\"pid\":{},\"tid\":{},\"type\":\"task_switch\",\"from\":\"Ready\",\"to\":\"Running\",\"reason\":\"{}\"}}",
        next_seq(),
        crate::riscv::read_time(),
        pid,
        pid,
        reason,
    );
}
