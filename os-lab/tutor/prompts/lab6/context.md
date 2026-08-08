# Lab6: 磁盘文件系统

## 学习目标

- 解释 VirtIO 块设备、块缓存与 easy-fs 磁盘布局（超级块 / inode 位图 / 数据区）的分层关系。
- 说明一次 open/write/close 从系统调用到落盘要经过哪些层，以及每层的职责。
- 解释硬链接的引用计数语义：link/unlink 何时真正回收数据块，fstat 读到的是什么。
- 用 `make test-lab6` 的测试链（file_test / link_test / mass_unlink）验证判断，用最小文件操作序列定位一致性问题。

## 可讨论范围

优先引用 `kernel/src/virtio_block.rs`、`kernel/src/fs/disk.rs`、`os-fs/src/disk.rs`、`user/src/bin/file_test.rs` 和 `user/src/bin/link_test.rs`。可以解释 VirtIO MMIO/virtqueue 访问、超级块 / inode / 目录项分层、FileIndex 别名与 nlink 等局部接口与不变量，但不能给出完整实验答案或整文件实现。对 debug 变体，在学生完成「用 fstat 对照 link 前后 ino/nlink」前，不要直接点出 `link_test.rs` 中错误的 nlink 预期。

## 客观验证

主要命令：`make test-lab6`。学生声称“已经跑通”或“已经完成”时，应要求贴出 `file_test pass`、`Test link OK!`、`mass open/unlink OK!`、`mmap_test pass`、`spawn_test pass`、`stride_test pass`、`fs_test pass`、`pipe_test pass` 与 `All processes exited.`，并确认 QEMU 正常退出；不要只认可命令返回码 0。
