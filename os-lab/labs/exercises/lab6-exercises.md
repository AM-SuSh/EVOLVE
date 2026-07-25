# Lab6 文字习题：磁盘文件系统

> 完成 [Lab6 实验](../lab6-disk-fs.md) 后做这些题。答案见 `labs/answers/lab6-answers.md` 与实验指导书第六节。

## 习题 1：从 Lab5 内嵌表到 Lab6 磁盘 FS

Lab5 用 `EMBEDDED_FILES` 静态表，Lab6 用 VirtIO + easy-fs + `fs.img`。请回答：

- 运行时创建新文件（如 `file_test` 里的 `fileb`）在两种方案下分别如何实现？
- `initproc` 在 Lab5 与 Lab6 各从哪里加载？这对"文件系统是否真实"意味着什么？
- 若忘记在 QEMU 命令行挂载 VirtIO 块设备，会出现什么现象？

## 习题 2：VirtIO 与 MMIO

请解释：

- MMIO 是什么？内核访问 `0x1000_1000` 附近地址时，实际在做什么？
- virtqueue 中"描述符"大致描述什么信息？
- 块大小 512 字节与 easy-fs 的关系是什么？

## 习题 3：硬链接与 fstat

用户程序执行：

```text
linkat("file0", "file0_link")
fstat(fd_of_file0, ...)
fstat(fd_of_file0_link, ...)
```

请回答：

- 两次 `fstat` 的 `ino` 应满足什么关系？`nlink` 应为多少？
- `unlinkat("file0_link")` 之后，再对 `file0` 做 `fstat`，`nlink` 如何变化？
- 硬链接与复制文件（再写一个同名新文件）的本质区别是什么？

## 习题 4：unlink 死锁

参考环境曾出现：在持有 `fs.lock()` 时调用 `inode.clear()` 导致 QEMU 挂死。

- 为什么"锁里再抢同一把锁"在自旋锁实现下会死锁？
- 本内核的 `FileIndex` + 细粒度更新如何规避该问题？
- `mass open/unlink` 回归测例想验证什么？

## 习题 5：mmap、spawn 与 stride

Lab6 继承了 ch4/ch5 的三项 syscall。请对比：

- `mmap` 映射的匿名页与 ELF 加载的代码段，在页表上有何异同？
- `spawn("hello")` 与 `exec("hello")` 对进程树的影响有何不同？
- `set_priority(1)` 为何返回 `-1`？stride 调度中优先级数值大小与 CPU 时间份额的关系如何直观理解？
