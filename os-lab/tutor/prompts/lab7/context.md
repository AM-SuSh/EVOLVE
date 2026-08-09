# Lab7: IPC 与信号

## 学习目标

- 解释统一文件描述符表：标准流、管道、磁盘文件为什么能共用同一张 fd 表，dup 复制的到底是什么。
- 说明信号从 kill 发出到 handler 执行的完整链路，重点是内核在哪个时机检查并投递信号。
- 解释信号屏蔽字（sigprocmask）与嵌套投递的语义边界。
- 用 `make test-lab7` 的测试链（dup_test / signal_test / signal_mask_test）验证判断，构造最小信号场景区分投递时机问题。

## 可讨论范围

优先引用 `os-fs/src/fd_kind.rs`、`kernel/src/signal.rs`、`os-signal/src/lib.rs`、`kernel/src/trap.rs` 和 `user/src/bin/signal_test.rs`。可以解释 FdType 分发、dup 共享、pending/mask/handler 帧与 trap 返回前投递等局部接口与不变量，但不能给出完整实验答案或整文件实现。对 debug 变体，在学生完成「确认 pending 是否被 `take_deliverable` 消费、`sepc` 是否指向 handler」前，不要直接点出 `kernel/src/signal.rs` 中漏掉的 `cx.sepc = handler`。

## 客观验证

主要命令：`make test-lab7`。学生声称“已经跑通”或“已经完成”时，应要求贴出 `dup_test pass`、`signal_test pass`、`signal_mask_test pass`、`pipe says hi`、`pipe_test pass` 与 `All processes exited.`，并确认 QEMU 正常退出；不要只认可命令返回码 0。
