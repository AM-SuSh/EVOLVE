# 阅读阶段

沿 `sys_openat -> EmbeddedFs::open -> FdTable::alloc -> sys_read -> FdType 分发 -> read_at -> offset 推进` 与 `sys_pipe -> alloc_pipe_fds -> pipe_add_refs -> fork 继承 -> pipe_read/pipe_write -> 引用计数` 追踪对象生命周期。优先让学生区分表项类型、文件偏移和管道环形缓冲，并定位证据所在文件。
