# Lab6: 磁盘文件系统

## 学习目标

- 解释 VirtIO 块设备、块缓存与 easy-fs 磁盘布局（超级块 / inode 位图 / 数据区）的分层关系。
- 说明一次 open/write/close 从系统调用到落盘要经过哪些层，以及每层的职责。
- 解释硬链接的引用计数语义：link/unlink 何时真正回收数据块，fstat 读到的是什么。
- 用 `make test-lab6` 的测试链（file_test / link_test / mass_unlink）验证判断，用最小文件操作序列定位一致性问题。

优先引用 `kernel/src/virtio_block.rs`、`kernel/src/fs/disk.rs`、`os-fs/src/disk.rs`、`user/src/bin/file_test.rs` 和 `user/src/bin/link_test.rs`。主要命令：`make test-lab6`。
