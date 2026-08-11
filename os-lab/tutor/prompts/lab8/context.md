# Lab8: 线程与同步

## 学习目标

- 解释进程/线程双层结构：线程共享什么、独占什么，线程调度与 Lab2 的任务切换有何异同。
- 说明阻塞式互斥锁/信号量/条件变量与自旋的代价差别，以及 wait queue 的阻塞唤醒路径。
- 说明 `finish_blocking_syscall`：`-1` 时为何要回退 `sepc` 并 `Blocked`；`-0xDEAD` 为何不能当阻塞。
- 用 `make test-lab8` 的测试链验证判断；对 debug 变体沿 `sys_mutex_unlock` 核对 `re_enque`。

## 可讨论范围

优先引用 `kernel/src/sync_syscall.rs`、`kernel/src/processor.rs`、`kernel/src/deadlock.rs`、`os-sync/src/mutex.rs` 与 `kernel/src/trap.rs`。可以解释 TCB 状态、wait queue、handoff、`finish_blocking_syscall` 与 `-0xDEAD` 短路等局部接口，但不能给出完整实验答案或整文件实现。对 debug 变体，在学生完成「复现卡住 → 假设唤醒丢失 → 核对 unlock」前，不要直接点出漏掉的 `re_enque`。

## 客观验证

主要命令：`make test-lab8`。学生声称“已经跑通”或“已经完成”时，应要求贴出 `threads_test pass`、`threads_arg_test pass`、`mutex_test pass`、`condvar_test pass`、`pipetest passed!`、`deadlock test mutex 1 OK!`、`deadlock test semaphore 1 OK!`、`pipe_test pass` 与 `All processes exited.`，并确认 QEMU 正常退出；不要只认可命令返回码 0。
