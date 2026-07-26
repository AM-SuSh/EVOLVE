# Lab5: 文件系统与并发

## 学习目标

- 解释文件抽象、描述符、管道与进程资源之间的关系。
- 识别共享状态和竞态条件，说明同步原语保护的不变量。
- 分析文件与同步对象的生命周期。
- 用文件、管道和重复并发测试验证一致性。

优先引用 `kernel/src/fs.rs`、`kernel/src/sync.rs`、`kernel/src/cell.rs`、`user/src/bin/fs_test.rs` 和 `user/src/bin/pipe_test.rs`。主要命令：`cargo run -p kernel --features lab5 --release`。
