# Lab8 参考答案与代码解读

> 配套实验指导：[lab8-thread-sync.md](../lab8-thread-sync.md)  
> 对应内容：【任务二：阅读理解与思考题（必做）】参考答案 + 代码解读  
> **使用建议**：先独立完成实验文档【任务二】，再来对答案。

## 一、完整代码逐行解读

### 1.1 `kernel/src/processor.rs`

| 概念 | 要点 |
|------|------|
| TCB | `tid`、`process_slot`、`status`、`trap_cx`、`user_stack_va` |
| `thread_create` | 分配独立用户栈 → 初始化 trap 上下文 → 入就绪队列 |
| `waittid` | 目标已 zombie 则返回退出码；否则当前线程 `Blocked` |
| 线程 `exit` | TCB 变 zombie → 唤醒 waittid 等待者 → 若进程无线程则 PCB zombie |

### 1.2 `kernel/src/sync_syscall.rs`

| syscall / 函数 | 要点 |
|---------|------|
| `mutex_lock` | 先死锁检测 → 可能 `-0xDEAD`；否则 `lock(tid)`，失败则记录等待并返回 `-1` |
| `mutex_unlock` | `unlock()` 得到待唤醒 tid → `mark_mutex_handoff` + **`re_enque`** |
| `semaphore_down` / `up` | 与 mutex 类似 |
| `condvar_wait` | 释放关联 mutex → 入等待队列 → 返回 `-1`；唤醒后用户重试并重新持锁 |
| `finish_blocking_syscall` | **仅当** `ret == -1`：回退 `sepc` 并 `block_thread_slot_and_run_next`（任务一 fill） |

`finish_blocking_syscall` 参考实现（任务一 fill）：

```rust
pub fn finish_blocking_syscall(ret: isize, cx: &mut TrapContext, thread_slot: usize) {
    if ret == -1 {
        cx.sepc = cx.sepc.wrapping_sub(4);
        processor::block_thread_slot_and_run_next(thread_slot, cx);
    }
}
```

debug 变体常埋点在 `sys_mutex_unlock`：只做了 `mark_mutex_handoff`，漏掉 `re_enque(tid)`，等待者永久 Blocked。

### 1.3 `os-sync` 阻塞 mutex

```text
lock(tid):
  已 locked → push_back(wait_queue), return false
  未 locked → locked=true, return true

unlock():
  wait_queue 非空 → pop_front 作为下一持有者
  wait_queue 空   → locked=false
```

### 1.4 `kernel/src/deadlock.rs`

- Mutex：等待图；同线程重复 `lock` 或环 → `-0xDEAD`
- Semaphore：银行家算法
- 返回码：`DEADLOCK_DETECTED = -0xDEAD`

### 1.5 用户态阻塞重试

```text
loop {
  r = raw_mutex_lock(id);
  if r != -1 { return r; }  // 0 成功，-0xDEAD 死锁
}
```

## 二、任务二：阅读理解与思考题参考答案

### 第 1 题：线程栈、waittid、exit

`thread_create` 为新线程分配独立用户栈并写入 TCB 的 `user_stack_va`，初始化入口与参数。`waittid` 在目标变为 zombie 后回收，并 `free_thread_user_stack`。  
**`exit` 退出当前线程**；最后一个线程退出 → 进程 zombie → 父进程 `wait4` 回收。  
共享：地址空间、fd、信号、同步原语列表；每线程独立：tid、trap 上下文、状态、用户栈。

### 第 2 题：Blocked 与重试

`mutex_lock` 返回 `-1` 后，`trap` 调用 `finish_blocking_syscall`：回退 `sepc`（trap 入口已 `advance_sepc`，否则唤醒后不会重试同一条 `ecall`），再 `block_thread_slot_and_run_next` 标 Blocked 并调度他人。`unlock`/`up`/`signal` 内对等待者 `re_enque`。用户态 while 重试：一次 syscall 只表示「尝试」；唤醒后须再次陷入内核完成加锁。  
若只 `mark_mutex_handoff` 而不 `re_enque`，等待线程永远停在 Blocked，典型现象是 `mutex_test` / `condvar_test` 卡住。

### 第 3 题：自旋 vs 阻塞

用户态临界区可能很长：自旋浪费 CPU，单核上还可能饿死持锁者。阻塞 mutex 让出 CPU。内核极短临界区仍用自旋锁；`os-sync` 内部保护等待队列元数据时仍可用短自旋——外层语义是阻塞，内层自旋只保护几行元数据。

### 第 4 题：条件变量与 mutex

检查/修改共享条件与睡眠必须在同一把 mutex 保护下，否则 lost wakeup。唤醒后必须重新 `mutex_lock`，因为 wait 期间已释放锁，条件可能再次不成立（标准写法常用 `while (!cond) wait`）。

### 第 5 题：`-0xDEAD` vs `-1`

`-1`：正常「暂时拿不到，已阻塞，稍后再试」。  
`-0xDEAD`：检测到死锁，**不应再阻塞**，用户应中止或改设计。  
`deadlock_mutex_test`：同线程对同一 mutex 二次 `lock`，等待图见自环，在真正入队阻塞前短路返回 `-0xDEAD`。  
`finish_blocking_syscall` 只认 `ret == -1`：若把 `-0xDEAD` 也当成阻塞，调用者会被送进永远等不到的 `Blocked`，与「再试也无意义」的语义相反。

## 三、任务三动手修改的现象参考

**修改 1**：主线程与子线程 `gettid()` 不同（主线程多为 0）。  
**修改 2**：关闭检测后，重复加锁可能永久阻塞（教学环境勿长时间挂起）。  
**修改 3**：常见简化包括测例集合裁剪、无哲学家就餐、无 `sleep`/`clock_gettime` 等。
