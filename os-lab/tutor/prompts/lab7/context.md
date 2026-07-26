# Lab7: IPC 与信号

## 学习目标

- 解释统一文件描述符表：标准流、管道、磁盘文件为什么能共用同一张 fd 表，dup 复制的到底是什么。
- 说明信号从 kill 发出到 handler 执行的完整链路，重点是内核在哪个时机检查并投递信号。
- 解释信号屏蔽字（sigprocmask）与嵌套投递的语义边界。
- 用 `make test-lab7` 的测试链（dup_test / signal_test / signal_mask_test）验证判断，构造最小信号场景区分投递时机问题。

优先引用 `os-fs/src/fd_kind.rs`、`kernel/src/signal.rs`、`os-signal/src/lib.rs`、`kernel/src/trap.rs` 和 `user/src/bin/signal_test.rs`。主要命令：`make test-lab7`。
