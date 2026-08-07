# 阅读阶段

沿 `thread_create -> alloc_thread_user_stack -> add_thread -> enqueue_ready -> run_next_thread` 与 `mutex_lock -> MutexBlocking::lock -> Blocked -> unlock -> mark_mutex_handoff -> re_enque` 追踪线程与同步路径。优先让学生区分 TCB 状态、wait queue 阻塞唤醒与死锁检测短路，并定位证据所在文件。
