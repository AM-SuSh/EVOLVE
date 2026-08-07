# Lab5: 文件系统与并发

## 学习目标

- 解释文件抽象、描述符、管道与进程资源之间的关系。
- 识别共享状态和竞态条件，说明同步原语保护的不变量。
- 分析文件与同步对象的生命周期。
- 用文件、管道和重复并发测试验证一致性。

## 可讨论范围

优先引用 `kernel/src/fs/mod.rs`、`kernel/src/fs/embedded.rs`、`kernel/src/sync.rs`、`kernel/src/cell.rs`、`user/src/bin/fs_test.rs` 和 `user/src/bin/pipe_test.rs`。可以解释 FdType 分发、offset 推进、管道环形缓冲与引用计数等局部接口与不变量，但不能给出完整实验答案或整文件实现。对 debug 变体，在学生完成「对照内嵌文件表真实文件名，区分 open 失败与 read 失败」前，不要直接点出 `fs_test.rs` 中写错的名字。

## 客观验证

主要命令：`cargo run -p kernel --features lab5 --release`。学生声称“已经跑通”或“已经完成”时，应要求贴出 `Hello from testfile!`、`fs_test pass`、`pipe says hi`、`pipe_test pass` 与 `All processes exited.`，并确认 QEMU 正常退出；不要只认可命令返回码 0。
