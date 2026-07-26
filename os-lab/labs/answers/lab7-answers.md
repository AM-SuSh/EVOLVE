# Lab7 参考答案与代码解读

> 配套实验指导：[lab7-ipc-signal.md](../lab7-ipc-signal.md)  
> 对应内容：【任务二：阅读理解与思考题（必做）】参考答案 + 代码解读  
> **使用建议**：先独立完成实验文档【任务二】，再来对答案。

## 一、完整代码逐行解读

### 1.1 `os-signal/src/lib.rs`

- `SignalSet`：32 位位图表示 pending / mask。
- `take_deliverable`：**先**检查 `SIGKILL`（绕过 mask），再取 `pending & !mask` 的最低编号信号。
- `from_fork`：子进程继承父进程 handler 与 mask（教学子集）。

### 1.2 `kernel/src/signal.rs`

| syscall | 要点 |
|---------|------|
| `kill` | 仅置 pending，不立即跑 handler |
| `sigaction` | 更新 handler 表 |
| `sigprocmask` | 替换 mask，返回旧值 |
| `sigreturn` | 从 `saved_trap_cx` 恢复 `TrapContext` |
| `handle_pending` | 致命默认 → `exit`；有 handler → 保存 cx，`sepc=handler`，`a0=signum` |

### 1.3 `kernel/src/trap.rs`：yield 与信号

- 普通 syscall 返回前：`handle_pending`。
- **`SYS_YIELD`**：调度前先 `handle_pending`；若已跳入 handler，不再 `run_next_process`，直接回用户态执行 handler。

### 1.4 `dup` 与管道写端关闭

```text
dup(Regular)   → 复制 FdType + clone OpenedFile
dup(PipeWrite) → 复制 FdType + pipe_add_refs(write=true)
```

`write_refs` 减到 0 时才 `write_closed = true`。

### 1.5 用户测例链

```text
initproc (lab7_usertest)
  → exec dup_test → exec signal_test → exec signal_mask_test → exec pipe_test
```

## 二、任务二：阅读理解与思考题参考答案

### 第 1 题：统一 fd 与 PipeWrite 不可读

写端只能写：`sys_read` 遇到 `PipeWrite` 返回 `-1`。统一走 `read`/`write` 与真实 Unix 一致——管道也是 fd，便于 `dup` 等复用同一张表，用户态不必记两套 syscall。

### 第 2 题：SIGKILL、pending、mask

`SIGKILL` 教学语义为「必杀」，必须绕过 mask，否则无法保证终止。  
**pending**：已收到未交付；**mask**：交付时屏蔽的位。交付条件大致为 `pending & !mask`（再加 SIGKILL 特例）。

### 第 3 题：saved_trap_cx 与 sigreturn

有可交付信号且存在 handler 时：内核保存当前 `TrapContext` 到 `saved_trap_cx`，改 `sepc=handler`、`a0=signum`。handler 末尾调用 `sigreturn`，内核恢复保存的上下文。普通 `ret` 无法还原被内核改过的 trap 帧（sepc/通用寄存器等）。

### 第 4 题：投递路径与 yield

trap 末尾对多数 syscall 调用 `handle_pending`；`yield` 路径在调度前也必须检查——否则子进程在 `yield` 循环里永远收不到信号，`signal_test` 会超时。若已进入 handler（`in_signal_handler`），则不再切换走调度。

### 第 5 题：dup 引用计数与 sigprocmask

`dup` 写端会 `pipe_add_refs(..., write=true)`；关闭原 fd 只减一次引用，只要 dup 出的写端仍在，缓冲就不该 `write_closed`。  
`sigprocmask` 屏蔽期间：信号进入 `pending`，因被 mask 而不交付，**不丢失**；解除屏蔽后需再陷入内核，才能在返回用户态前交付。

## 三、任务三动手修改的现象参考

**修改 1**：handler 打印的 `signum` 应与 `kill` 发出的编号一致（如 `SIGUSR1=10`）。  
**修改 2**：对 `SIGINT` 注册忽略 handler 后，`kill(SIGINT)` 不应终止子进程。  
**修改 3**：常见简化包括无信号栈、无 `SA_RESTART`、无多线程信号投递规则等。
