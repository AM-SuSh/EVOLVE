//! Signal sets, actions, and per-process state for lab7+.
//!
//! Host-testable logic lives here; trap-context delivery is handled in `kernel/src/signal.rs`.

#![no_std]

/// Maximum signal number (Linux-compatible teaching subset).
pub const MAX_SIG: usize = 31;

/// `kill(2)` / default terminate.
pub const SIGKILL: u8 = 9;
/// Interactive interrupt.
pub const SIGINT: u8 = 2;
/// User-defined signal 1 (used by teaching tests).
pub const SIGUSR1: u8 = 10;

/// Bitmap of signals (bit `n` = signal `n`).
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct SignalSet(pub u32);

impl SignalSet {
    pub const fn empty() -> Self {
        Self(0)
    }

    pub const fn contains(self, signum: u8) -> bool {
        signum <= MAX_SIG as u8 && (self.0 & (1 << signum)) != 0
    }

    pub fn insert(&mut self, signum: u8) {
        if signum as usize <= MAX_SIG {
            self.0 |= 1 << signum;
        }
    }

    pub fn remove(&mut self, signum: u8) {
        if signum as usize <= MAX_SIG {
            self.0 &= !(1 << signum);
        }
    }

    pub fn lowest_signal(self) -> Option<u8> {
        if self.0 == 0 {
            return None;
        }
        Some(self.0.trailing_zeros() as u8)
    }
}

/// Per-process signal state (no trap context — kernel stores that separately).
///
/// The `sigaction` ABI struct shared between kernel and userland lives in
/// `os-syscall` (`os_syscall::SignalAction`); do not duplicate it here.
#[derive(Clone, Debug)]
pub struct SignalState {
    handlers: [usize; MAX_SIG + 1],
    mask: SignalSet,
    pending: SignalSet,
}

impl SignalState {
    pub const fn new() -> Self {
        Self {
            handlers: [0; MAX_SIG + 1],
            mask: SignalSet::empty(),
            pending: SignalSet::empty(),
        }
    }

    pub fn from_fork(&self) -> Self {
        self.clone()
    }

    pub fn receive(&mut self, signum: u8) {
        if signum as usize > MAX_SIG {
            return;
        }
        self.pending.insert(signum);
    }

    pub fn set_handler(&mut self, signum: usize, handler: usize) -> usize {
        if signum > MAX_SIG {
            return 0;
        }
        let old = self.handlers[signum];
        self.handlers[signum] = handler;
        old
    }

    pub fn handler(&self, signum: u8) -> usize {
        self.handlers[signum as usize]
    }

    pub fn set_mask(&mut self, mask: u32) -> u32 {
        let old = self.mask.0;
        self.mask = SignalSet(mask);
        old
    }

    pub fn mask(&self) -> u32 {
        self.mask.0
    }

    /// SIGKILL is always deliverable even when masked.
    pub fn take_deliverable(&mut self) -> Option<u8> {
        if self.pending.contains(SIGKILL) {
            self.pending.remove(SIGKILL);
            return Some(SIGKILL);
        }
        let deliverable = SignalSet(self.pending.0 & !self.mask.0);
        let signum = deliverable.lowest_signal()?;
        self.pending.remove(signum);
        Some(signum)
    }

    pub fn is_fatal_default(&self, signum: u8) -> bool {
        matches!(signum, SIGKILL | SIGINT) && self.handler(signum) == 0
    }
}
