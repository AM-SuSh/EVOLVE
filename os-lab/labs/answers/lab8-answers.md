# Lab8 参考答案与代码解读

> 本文件是 [lab8-thread-sync.md](../lab8-thread-sync.md) 的配套答案，含代码走读与 [lab8-exercises.md](../exercises/lab8-exercises.md) 习题答案。  
> **使用建议**：先独立完成实验任务二与文字习题，再对照本文件。

## 一、代码走读要点

### 1.1 `kernel/src/processor.rs`

| 概念 | 要点 |
|------|------|
| TCB | `tid`、`process_slot`、`status`、`trap_cx`、`user_stack_va` |
| `thread_create` | 分配独立用户栈 → 初始化 `trap_cx`（入口 + 参数 a0）→ 入就绪队列 |
| `waittid` | 目标已 zombie 则立即返回退出码；否则当前线程 `Blocked`，记录 `wait_targets` |
| 线程 `exit` | TCB 变 zombie → 唤醒 `waittid` 等待者 → 若进程无线程则 PCB zombie |

### 1.2 `kernel/src/sync_syscall.rs`

| syscall | 要点 |
|---------|------|
| `mutex_create` | 仅 `blocking=true`；注册 `DeadlockState::register_mutex` |
| `mutex_lock` | 先 `mutex_would_deadlock` → `-0xDEAD`；否则 `lock(tid)`，失败则 `make_current_blocked` 返回 `-1` |
| `mutex_unlock` | `unlock()` 返回待唤醒 `tid` → `re_enque` |
| `semaphore_down` / `up` | 与 mutex 类似；`up` 唤醒 FIFO 等待者 |
| `condvar_wait` | 释放关联 mutex → 入 condvar 等待队列 → 阻塞；唤醒后用户重试并需重新持锁 |

### 1.3 `os-sync/src/mutex.rs`

```text
lock(tid):
  已 locked → push_back(wait_queue), return false
  未 locked → locked=true, return true

unlock():
  wait_queue 非空 → pop_front 作为下一持有者（locked 保持 true）
  wait_queue 空   → locked=false
```

host 集成测试：`os-sync/tests/sync_primitives.rs`（5 项，须 `--target` 指定宿主机）。

### 1.4 `kernel/src/deadlock.rs`

- **Mutex**：`mutex_owner[id]` + `mutex_wait` 图；同线程重复 `lock` 或环 → `mutex_would_deadlock`
- **Semaphore**：银行家算法；`semaphore_down` 前检查安全性
- 返回码：`DEADLOCK_DETECTED = -0xDEAD`（`os-syscall` 与 `syscall.rs` 一致）

### 1.5 用户测例链

```text
initproc (lab8_usertest)
  → exec lab8_integration_test（单进程内顺序执行各段）

独立调试：threads_test → threads_arg_test → mutex_test → condvar_test → …
```

`lab8_integration_test` 避免链式 `exec` 多次加载 ELF，减轻内核堆压力。

### 1.6 `user/src/syscall.rs` 阻塞重试

```text
loop {
  r = raw_mutex_lock(id);
  if r != -1 { return r; }  // 0 成功，-0xDEAD 死锁
}
```

`semaphore_down`、`condvar_wait` 同理。

## 二、文字习题答案

### 习题 1：进程与线程

**共享**：地址空间、fd 表、信号状态、同步原语列表（mutex/sem/condvar）、`DeadlockState`。  
**每线程独立**：`tid`、`trap_cx`、线程状态、用户栈、`exit_code`。

**`exit`**：退出**当前线程**；最后一个线程退出 → 进程 zombie → 父进程 `wait4` 回收。

**`thread_create` vs `spawn`**：`thread_create` 在同进程内创建执行流，返回 `tid`；`spawn` 创建**新进程**（新 PCB + 新地址空间），返回子 `pid`。

### 习题 2：自旋 vs 阻塞

| 维度 | SpinMutex | MutexBlocking |
|------|-----------|---------------|
| 等待 | CPU 空转重试 CAS | 入 FIFO 队列，线程阻塞 |
| CPU | 竞争时浪费 | 让出给其他线程 |
| 内部 spin | 保护锁元数据本身 | 同样用 spin 保护**短**元数据临界区 |

**不矛盾**：外层语义是阻塞（线程挂起）；内层 `spin::Mutex` 只保护 `wait_queue` 等几行代码。

**单核 + 用户态自旋锁**：持锁线程若需 syscall 让出 CPU，等待线程自旋占满 CPU → 持锁者无法运行 → **死锁**。`mutex_test` 依赖阻塞语义才能通过。

### 习题 3：阻塞 syscall

1. 返回 `-1` 前：`make_current_blocked()`，当前线程移出就绪队列，调度其他线程。  
2. 用户重试：一次 syscall 只表达「尝试」；唤醒后须再次陷入内核完成加锁。  
3. 唤醒：`unlock` / `up` / `signal` 内调用 `re_enque(waking_tid)`，非扫描全表。

### 习题 4：条件变量

**必须配 mutex**：检查/修改共享条件与睡眠必须是原子的，否则 lost wakeup（设置 FLAG 与 wait 竞态）。

**while vs if**：标准模式是 `while (!cond) wait`，防止虚假唤醒或多消费者。本测例用单次 `FLAG` 赋值 + 单消费者，可用 `if` 简化。

**signal**：唤醒**一个**等待者；`broadcast` 唤醒全部（本环境未实现）。

### 习题 5：死锁检测

**`-0xDEAD` vs `-1`**：`-1` 表示正常阻塞等待；`-0xDEAD` 表示检测到死锁，**不应阻塞**，用户应中止或释放资源。

**`deadlock_mutex_test`**：同一线程对同一 mutex 二次 `lock`；等待图检测到自环，立即 `-0xDEAD`。

**银行家算法**：`Available` = 各信号量剩余资源；`Allocation[t]` = 线程 t 已持有；`Need[t]` = t 将再请求的最大量。安全序列不存在则拒绝 `down`。  
**分工**：信号量用银行家；mutex 用等待图——互斥锁资源数恒为 1，银行家退化为图检测更直观。

## 三、对照 ch8 exercise 自查

| 检查项 | 本仓库 |
|--------|--------|
| 线程 create/join/exit | `threads_test`、`threads_arg_test` |
| 阻塞 mutex | `mutex_test` |
| condvar | `condvar_test` |
| fork + pipe | `pipetest` |
| 死锁 mutex/sem | `deadlock_*` |
| Lab7 管道回归 | `pipe_test` |

详见 [lab6-8.md §十四](../../../docs/lab6-8.md#十四ch8-exercise-继承项清单)。
