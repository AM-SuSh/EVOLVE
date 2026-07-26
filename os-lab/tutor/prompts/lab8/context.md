# Lab8: 线程与同步

## 学习目标

- 解释进程/线程双层结构：线程共享什么、独占什么，线程调度与 Lab2 的任务切换有何异同。
- 说明阻塞式互斥锁/信号量/条件变量与自旋的代价差别，以及 wait queue 的阻塞唤醒路径。
- 解释银行家式死锁检测：Available/Allocation/Need 三张表如何随 acquire/release 变化。
- 用 `make test-lab8` 的测试链（threads / mutex / condvar / deadlock）验证判断，用重复运行暴露时序问题。

优先引用 `kernel/src/processor.rs`、`kernel/src/sync_syscall.rs`、`kernel/src/deadlock.rs`、`os-sync/src/mutex.rs` 和 `user/src/bin/deadlock_mutex_test.rs`。主要命令：`make test-lab8`。
