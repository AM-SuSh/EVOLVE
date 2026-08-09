# Lab7 参考答案与代码解读

> 配套实验指导：[lab7-ipc-signal.md](../lab7-ipc-signal.md)  
> 对应内容：【任务二：阅读理解（思考题）】参考答案 + 代码解读  
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
| `handle_pending` | 致命默认 → `Kill`；`SIGKILL` 绕过 mask；有 handler → 保存 cx、`sepc=handler`、`a0=signum`、`in_signal_handler=true` |

`handle_pending` 的完整投递分支（任务一参考实现）：

```rust
let Some(signum) = pcb.signal.take_deliverable() else {
    return SignalOutcome::Continue;
};
if signum == SIGKILL {
    return SignalOutcome::Kill(signum as i32);
}
if pcb.signal.is_fatal_default(signum) {
    return SignalOutcome::Kill(signum as i32);
}
let handler = pcb.signal.handler(signum);
if handler == 0 {
    continue;
}
pcb.saved_trap_cx = Some(*cx);
pcb.in_signal_handler = true;
cx.x[10] = signum as usize;
cx.sepc = handler;
return SignalOutcome::Continue;
```

顺序要点：**先保存整帧，再改 `a0` / `sepc`**；`in_signal_handler` 防止 handler 执行期间又被当成普通上下文重复投递。

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

### 第 2 题：dup 后普通文件的 offset

`sys_dup` 把 `FdType` 原样复制到新空槽；`Regular` 分支 `files[new_fd] = files[old_fd].clone()` 共享同一个 inode 打开对象，但 `offset` 存在各自的 `FdType` 槽位里，所以两个 fd 各持一份 offset，读写各自推进自己的位置。真实 Unix 的 `dup` 共享同一个 open file description（offset 也共享）；本教学实现把 offset 放在 fd 槽位里，是刻意简化。

### 第 3 题：dup 管道写端与 write_refs

`dup(PipeWrite)` 会 `pipe_add_refs(id, false, true)` 给写端引用计数加一。之后 `close` 原写 fd 只减一次计数；只要 dup 出的写端还活着，`write_refs > 0`，`write_closed` 不应置位，对端也就不会提前看到 EOF。只有写端引用真正降到 `0`，才适合标记写端已全部关闭。

### 第 4 题：SIGKILL、pending、mask

`SIGKILL` 教学语义为「必杀」，必须绕过 mask，否则无法保证终止。  
**pending**：已收到未交付；**mask**：交付时屏蔽的位。交付条件大致为 `pending & !mask`（再加 SIGKILL 特例）。

### 第 5 题：saved_trap_cx 与 sigreturn

有可交付信号且存在 handler 时：内核保存当前 `TrapContext` 到 `saved_trap_cx`，改 `sepc=handler`、`a0=signum`。handler 末尾调用 `sigreturn`，内核恢复保存的上下文。普通 `ret` 无法还原被内核改过的 trap 帧（sepc/通用寄存器等）。

### 第 6 题：投递路径、yield 与 sigprocmask

trap 末尾对多数 syscall 调用 `handle_pending`；`yield` 路径在调度前也必须检查——否则子进程在 `yield` 循环里永远收不到信号，`signal_test` 会超时。若已进入 handler（`in_signal_handler`），则不再切换走调度。  
`sigprocmask` 屏蔽期间：信号进入 `pending`，因被 mask 而不交付，**不丢失**；解除屏蔽后需再陷入内核，才能在返回用户态前交付。

### 第 7 题：默认动作差异

`is_fatal_default` 只把未注册处理函数的 `SIGINT` / `SIGKILL` 判为致命，`handle_pending` 返回 `Kill`；`SIGUSR1` 没有 handler 且非致命，会在交付循环里 `continue` 被忽略，不会终止进程。

### 第 8 题：测例链与低号 fd 占位

`lab7_usertest` 用 `exec` 依次串联 `dup_test` → `signal_test` → `signal_mask_test` → `pipe_test`：先验证 dup / 统一 fd，再验证信号投递与 mask，最后回归 Lab5 管道。测试开头 `open("testfile")` 占住低号 fd，避免管道端意外落到 `fd 1`（本内核常作控制台输出）而干扰打印与读写。

### 第 9 题：用 dup + close 重定向 stdout

先 `open` 一个可写文件得到 fd，再 `close(1)`，然后 `dup` 该文件 fd：`sys_dup` 找第一个空槽位，正好是 `1`，于是后续 `write(1, ...)` 走同一份打开对象写进文件。顺序必须是**先 close 再 dup**，否则空槽位不是 `1`。
## 三、任务三动手修改的现象参考

**修改 1**：handler 打印的 `signum` 应与 `kill` 发出的编号一致（如 `SIGUSR1=10`）。  
**修改 2**：对 `SIGINT` 注册忽略 handler 后，`kill(SIGINT)` 不应终止子进程。  
**修改 3**：常见简化包括无信号栈、无 `SA_RESTART`、无多线程信号投递规则等。
