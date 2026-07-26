# Lab8 文字习题：线程与同步

> 完成 [Lab8 实验](../lab8-thread-sync.md) 后做这些题。答案见 `labs/answers/lab8-answers.md` 与实验指导书第六节。

## 习题 1：进程与线程

Lab8 在 Lab4 PCB 之上增加线程层，而非重写进程管理。请回答：

- 同一进程内的多个线程共享哪些资源？哪些状态是**每线程独立**的？
- `exit` 在 Lab8 语义下退出的是进程还是线程？最后一个线程退出后进程处于什么状态？
- `thread_create` 与 Lab6 的 `spawn` 有何本质区别（地址空间、返回值、用途）？

## 习题 2：Lab5 自旋锁 vs Lab8 阻塞 mutex

请对比 `kernel/src/sync.rs` 的 `SpinMutex` 与 `os-sync` 的 `MutexBlocking`：

- 拿不到锁时各自的行为是什么？对 CPU 利用率有何影响？
- 为何 `MutexBlocking` 内部仍使用 `spin::Mutex`？这与「阻塞锁」矛盾吗？
- 若用 Lab5 自旋锁保护用户态全局变量 `COUNTER`，`mutex_test` 在单核 QEMU 上可能出现什么问题？

## 习题 3：阻塞 syscall 与用户态重试

`mutex_lock` / `semaphore_down` / `condvar_wait` 在需等待时 syscall 返回 `-1`。

- 内核在返回 `-1` 前对当前线程做了什么？
- 用户态 `syscall.rs` 为何要循环调用直到返回值不是 `-1`？
- 被唤醒的线程如何重新进入就绪队列？由 `unlock` 还是由调度器主动扫描？

## 习题 4：条件变量

`condvar_test` 中工作线程在 `condvar_wait` 里睡眠，主线程设置 `FLAG` 后 `signal`。

- 为什么条件变量必须搭配 mutex 使用？
- `condvar_wait` 被唤醒后，为何通常要再次检查条件（while 而非 if）？本测例用静态 `FLAG` 简化了什么？
- `signal` 唤醒一个线程还是全部？与 `broadcast`（本环境未实现）有何区别？

## 习题 5：死锁检测

开启 `enable_deadlock_detect(1)` 后，`mutex_lock` 可能返回 `-0xDEAD`。

- `-0xDEAD` 与阻塞返回的 `-1` 语义有何不同？用户态应如何处理？
- `deadlock_mutex_test` 检测的是哪一类死锁？为何不会真的挂死？
- 信号量死锁检测用的银行家算法中，`Available`、`Allocation`、`Need` 各表示什么？与 mutex 等待图检测有何分工？
