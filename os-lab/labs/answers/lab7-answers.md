# Lab7 参考答案与代码解读

> 本文件是 [lab7-ipc-signal.md](../lab7-ipc-signal.md) 的配套答案，含代码走读与 [lab7-exercises.md](../exercises/lab7-exercises.md) 习题答案。  
> **使用建议**：先独立完成实验任务二与文字习题，再对照本文件。

## 一、代码走读要点

### 1.1 `os-signal/src/lib.rs`

- `SignalSet`：32 位位图表示 pending / mask。
- `take_deliverable`：**先**检查 `SIGKILL`（绕过 mask），再取 `pending & !mask` 的最低编号信号。
- `from_fork`：子进程继承父进程 handler 与 mask（与 Linux 一致的教学子集）。
- host 集成测试：`tests/signal_state.rs`（须 `--target` 指定宿主机 triple）。

### 1.2 `kernel/src/signal.rs`

| syscall | 要点 |
|---------|------|
| `kill` | `find_slot_by_pid` → `receive(signum)` 仅置 pending，不立即跑 handler |
| `sigaction` | 读写 `SignalAction`（handler + 保留 mask 字段）；更新 handler 表 |
| `sigprocmask` | 替换 mask，返回旧值 |
| `sigreturn` | 从 `saved_trap_cx` 恢复 `TrapContext`，清除 `in_signal_handler` |
| `handle_pending` | 致命默认 → `exit`；有 handler → 保存 cx，`sepc=handler`，`a0=signum` |

### 1.3 `kernel/src/trap.rs`：yield 与信号

- 普通 syscall 返回前：`handle_pending`（trap 末尾）。
- **`SYS_YIELD`**：`yield_and_schedule` 在调度前先 `handle_pending`；若已跳入 handler（`in_signal_handler`），**不再** `run_next_process`，直接返回用户态执行 handler。
- 若无此逻辑，`signal_test` 中子进程在 `yield` 循环里永远收不到信号。

### 1.4 `kernel/src/fs/disk.rs`：dup

```text
dup(Regular)  → 复制 FdType + clone OpenedFile
dup(PipeWrite) → 复制 FdType + pipe_add_refs(write=true)
dup(PipeRead)  → 复制 FdType + pipe_add_refs(read=true)
```

### 1.5 `kernel/src/sync.rs`：写端关闭

修复后语义：`write_refs` 减到 0 时才 `write_closed = true`。保证 dup 出的写 fd 仍可向管道写入。

### 1.6 用户测例链

```text
initproc (lab7_usertest)
  → exec dup_test → exec signal_test → exec signal_mask_test → exec pipe_test
```

- `signal_test`：`spawn("signal_child")` 后 `kill(SIGUSR1)`，子进程 handler 置位后退出。
- `signal_mask_test`：单进程自测 mask，不依赖父子竞态。

## 二、文字习题答案

### 习题 1：统一 fd

**改变**：读写入口统一到 `disk.rs` 的 `FdType` match；Lab7 新增 `sys_dup`。  
**未改变**：底层环形缓冲仍在 `sync.rs`，Lab6 已修复管道 fd 不要求 `files[]` 槽位。

**files[] 为 None**：管道无 `OpenedFile`；若 `sys_write` 误查 `files[fd]`，会得到 `pipe write failed`（Lab6 回归）。

**fd_kind host 测**：验证读写矩阵逻辑；**不能**替代 QEMU 上的真实管道/磁盘集成。

### 习题 2：管道 vs 信号

| 维度 | 管道 | 信号 |
|------|------|------|
| 连接 | 需 `pipe()` 建立 fd 对 | 只需目标 pid |
| 阻塞 | 本环境读空返回 -1，需 yield | kill 不阻塞发送方 |
| 数据形态 | 字节流 | 带编号的离散事件 |
| 适用场景 | 传文本/数据 | 异步通知、终止 |

### 习题 3：信号生命周期

1. `kill` → 目标 PCB 的 `pending` 置位  
2. 目标下次 syscall 返回前（或 yield 路径）`take_deliverable`  
3. 有 handler：保存 `trap_cx` → `sepc = handler`，`a0 = signum`  
4. 用户 handler 执行 → `sigreturn` → 恢复 `saved_trap_cx`  

**pending**：已收到未交付；**mask**：交付时忽略的位。  
**handler 表**：在 PCB 的 `SignalState`；`fork`/`spawn` 子进程继承（spawn 为新 PCB 默认空，fork 复制父状态）。  
**sigreturn**：内核需恢复 sepc/寄存器；普通 `ret` 无法恢复被篡改的 trap 上下文。  
**SIGKILL**：教学语义强制终止，若可屏蔽/捕获则无法保证「必杀」。

### 习题 4：sigprocmask

**屏蔽期间**：信号进入 `pending`，因 `pending & !mask` 为空而不交付，**不丢失**。  
**解除屏蔽后**：需再陷入内核（syscall）才能在返回用户态前 `handle_pending`。  
**永久屏蔽**：`SIGUSR1` 一直 pending，除非进程退出或被 `SIGKILL`。

### 习题 5：dup 与引用计数

**dup 管道写端**：`pipe_add_refs(id, read=false, write=true)`。  
**过早 write_closed**：dup 写端 `write` 返回 -1，子进程读 EOF → `dup_test` 失败。  
**异同**：管道 dup 只复制 `FdType` + 增减 pipe 引用；常规文件 dup 还 `clone` `OpenedFile`（共享 inode）。
