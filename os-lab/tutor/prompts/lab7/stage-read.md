# 阅读阶段

沿 `sys_kill -> SignalState::receive -> trap 返回前 try_deliver_signals -> handle_pending -> take_deliverable -> saved_trap_cx -> sepc=handler -> sys_sigreturn` 追踪信号生命周期，另沿 `sys_dup -> FdType 复制 -> pipe_add_refs` 追踪 fd 共享。优先让学生区分 pending、mask 与 handler 帧三个状态，并定位证据所在文件。
