# Lab8: 线程与同步

## 学习目标

- 解释进程/线程双层结构：线程共享什么、独占什么，线程调度与 Lab2 的任务切换有何异同。
- 说明阻塞式互斥锁/信号量/条件变量与自旋的代价差别，以及 wait queue 的阻塞唤醒路径。
- 解释银行家式死锁检测：Available/Allocation/Need 三张表如何随 acquire/release 变化。
- 用 `make test-lab8` 的测试链（threads / mutex / condvar / deadlock）验证判断，用重复运行暴露时序问题。

## 可讨论范围

优先引用 `kernel/src/processor.rs`、`kernel/src/sync_syscall.rs`、`kernel/src/deadlock.rs`、`os-sync/src/mutex.rs` 和 `user/src/bin/deadlock_mutex_test.rs`。可以解释 TCB 状态、wait queue 阻塞唤醒、handoff 与 -0xDEAD 短路等局部接口与不变量，但不能给出完整实验答案或整文件实现。对 debug 变体，在学生完成「计算理论计数并核对每线程循环上界」前，不要直接点出 `lab8_integration_test.rs` 中错误的工作量。

## 客观验证

主要命令：`make test-lab8`。学生声称“已经跑通”或“已经完成”时，应要求贴出 `threads_test pass`、`threads_arg_test pass`、`mutex_test pass`、`condvar_test pass`、`pipetest passed!`、`deadlock test mutex 1 OK!`、`deadlock test semaphore 1 OK!`、`pipe_test pass` 与 `All processes exited.`，并确认 QEMU 正常退出；不要只认可命令返回码 0。
