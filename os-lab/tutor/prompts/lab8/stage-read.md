# 阅读阶段

沿 `mutex_lock -> MutexBlocking::lock -> 返回 -1 -> finish_blocking_syscall(sepc-=4 + Blocked)` 与 `mutex_unlock -> mark_mutex_handoff -> re_enque` 追踪阻塞与唤醒。优先让学生区分 TCB 状态、wait queue、handoff 与入队、死锁检测短路，并定位证据所在文件（任务文件是 `kernel/src/sync_syscall.rs`）。
