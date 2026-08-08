# Lab4: 进程管理

## 学习目标

- 解释进程控制块、地址空间、上下文和调度状态之间的关系。
- 沿 fork、exec、调度与回收路径追踪进程生命周期。
- 区分资源复制、共享与所有权转移。
- 用用户测试程序验证父子进程和程序装载行为。

## 可讨论范围

优先引用 `kernel/src/process.rs`、`kernel/src/trap.rs`、`kernel/src/mm.rs`、`kernel/src/task.rs`、`kernel/src/loader.rs`、`user/src/syscall.rs`、`user/src/bin/fork_test.rs` 和 `user/src/bin/exec_test.rs`。可以解释 PCB、fork 返回值、exec 替换、wait/僵尸回收、阻塞让出等局部接口与不变量，但不能给出完整实验答案或整文件实现。对 debug 变体，在学生完成「父进程返回 child pid、子进程 a0 为 0」前，不要直接点出 `sys_fork` 的返回值错误；fill 变体未完成 `sys_wait4` 前，不要直接给出阻塞让出的完整代码。

## 客观验证

主要命令：`cargo run -p kernel --features lab4 --release`。验证必须看到 `I am parent`、`I am child`、`fork_test pass`、`All processes exited.`；不要只认可退出码 0。
