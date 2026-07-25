# Lab7 文字习题：IPC 与信号

> 完成 [Lab7 实验](../lab7-ipc-signal.md) 后做这些题。答案见 `labs/answers/lab7-answers.md` 与实验指导书第六节。

## 习题 1：统一 fd 与 Lab5 管道

Lab5 已实现管道，Lab7 任务描述为「迁移 + 重构」而非从零实现。请回答：

- `FdType` 三分支相对 Lab5 内嵌 FS 的管道路径，改变了什么、没改变什么？
- 为何管道 fd 的 `files[]` 槽位可以为 `None`？若误要求非空会导致什么测例失败？
- `os-fs/fd_kind.rs` 的 host 单测能验证什么、不能验证什么？

## 习题 2：管道 vs 信号

请对比管道与信号在以下维度上的差异：

- 通信是否需要双方事先建立连接（如 `pipe()`）？
- 发送方是否会因接收方未准备好而阻塞（本环境非阻塞管道读写的语义）？
- 数据是有序字节流还是带编号的离散事件？
- 本环境中，哪一类更适合传「一行文本」，哪一类更适合「通知进程退出」？

## 习题 3：信号生命周期

用户程序调用 `kill(pid, SIGUSR1)` 后，到 handler 执行完毕，内核与用户态各经历哪些步骤？

- `pending` 与 `mask` 分别表示什么？
- `sigaction` 注册的 handler 地址存在哪里？fork/spawn 的子进程是否继承？
- 为何 handler 必须以 `sigreturn` 结束，而不能用普通 `ret` 返回？
- `SIGKILL` 为何不能注册 handler、不能屏蔽？

## 习题 4：sigprocmask 与屏蔽字

`signal_mask_test` 的流程是：先屏蔽 `SIGUSR1` → `kill` 自己 → 解除屏蔽 → handler 运行。

- 屏蔽期间信号去了哪里？是丢失还是被缓存？
- 解除屏蔽后，为何需要再执行一次 syscall（如 `yield`）才能进入 handler？
- 若永久不解除屏蔽，pending 的 `SIGUSR1` 会怎样？

## 习题 5：dup 与管道引用计数

`dup_test` 中父进程 `dup` 管道写端后关闭原写 fd，再通过 dup fd 写入。

- `dup` 对管道 fd 应增加哪一类引用（读/写）？
- 若 `pipe_close_write` 在仍有其他写 fd 时就把 `write_closed` 置真，会出现什么现象？
- `dup` 常规文件 fd 与 `dup` 管道 fd 在内核数据结构上有何异同？
