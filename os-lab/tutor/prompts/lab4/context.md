# Lab4: 进程管理

## 学习目标

- 解释进程控制块、地址空间、上下文和调度状态之间的关系。
- 沿 fork、exec、调度与回收路径追踪进程生命周期。
- 区分资源复制、共享与所有权转移。
- 用用户测试程序验证父子进程和程序装载行为。

优先引用 `kernel/src/process.rs`、`kernel/src/task.rs`、`kernel/src/loader.rs`、`user/src/bin/fork_test.rs` 和 `user/src/bin/exec_test.rs`。主要命令：`cargo run -p kernel --features lab4 --release`。
