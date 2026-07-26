# Lab6 参考答案与代码解读

> 配套实验指导：[lab6-disk-fs.md](../lab6-disk-fs.md)  
> 对应内容：【任务二：阅读理解与思考题（必做）】参考答案 + 代码解读  
> **使用建议**：先独立完成实验文档【任务二】，再来对答案。

## 一、完整代码逐行解读

### 1.1 `kernel/build.rs`：fs.img 打包

- `app_names()` 在 `CARGO_FEATURE_LAB6` 下包含 `lab6_usertest`、`file_test`、`link_test` 等测例 ELF。
- `pack_fs_image()` 创建镜像，用 easy-fs 格式化后写入各 app 与 `filea`/`testfile`。
- **`initproc` 指向 `lab6_usertest`**，不再使用 Lab5 的内嵌 app 索引。

### 1.2 `kernel/src/virtio_block.rs`

- MMIO 区域由 `config.rs` 的 `VIRTIO_MMIO_BASE`（`0x1000_1000`）定义，`mm::map_mmio_devices()` 映射进内核页表。
- 实现 `easy_fs::BlockDevice`：`read_block`/`write_block` 经 virtqueue 与 QEMU virtio-blk 交互，最终读写 `fs.img` 对应扇区。逻辑块号 × 512 = 字节偏移。

### 1.3 `kernel/src/fs/disk.rs`：FileIndex 与 unlink

```text
link:  别名表 aliases[path] → Arc<FileMeta>；同一 inode 的 nlink += 1
unlink: 从 aliases 移除路径名，nlink -= 1；路径加入 hidden，避免立即 reopen
```

**死锁规避**：不在持有 easy-fs 全局锁的路径上调用 `inode.clear()`。删除最后一个硬链接时，仅更新内存索引。

### 1.4 管道 fd 与普通文件分发

`sys_read`/`sys_write` 先根据 `slots[fd]` 判断 `FdType`：

- `PipeRead`/`PipeWrite`：直接调用 `sync::pipe_read`/`pipe_write`，**不**要求 `files[fd]` 非空。
- `Regular`：从 `files[fd]` 取 `OpenedFile`，经 inode 读写磁盘。

### 1.5 `spawn` 与 stride

- `sys_spawn`：从磁盘读 ELF → 建用户地址空间 → `ProcessManager::spawn`。
- `sys_set_priority`：`prio < 2` 拒绝；否则更新 PCB 优先级，按 stride 调度。

## 二、任务二：阅读理解与思考题参考答案

### 第 1 题：VirtIO、MMIO 与块号

MMIO 基址在 `config` 中定义为 `0x1000_1000`，映射进内核页表后，对该区域的 load/store 即访问设备寄存器。`read_block(block_id, buf)` 把请求填入 virtqueue 描述符（缓冲区地址、长度、读写方向），通知设备；设备完成后内核得到 512 字节块数据——对应 `fs.img` 上该扇区。

**为何不能直接打开宿主机 `fs.img` 路径**：guest 内核运行在虚拟机内，只能通过设备模型访问磁盘。`build.rs` 在宿主机**编译期**生成镜像；**运行时**内核把它当作块设备扇区读写。

### 第 2 题：initproc 与 CREATE

`pack_fs_image` 把 **`lab6_usertest`** 写成镜像内的 `initproc`。Lab5 从内核内嵌 ELF 索引加载；Lab6 必须经块设备 + 文件系统路径加载，才算「真实磁盘启动」。

**运行时创建文件**：Lab5 静态表无法真正 create；Lab6 通过 `openat(..., O_CREATE|...)` 在 easy-fs 根目录创建新 inode 并写数据块。

### 第 3 题：FileIndex、nlink 与 unlink 死锁

硬链接：`nlink += 1`，两路径共享同一 inode/`ino`。`unlink` 一路径：`nlink -= 1`，另一路径仍可打开。

**为何不 `inode.clear()`**：`fs.lock()` 已持自旋锁，若 `clear()` 内部再 `lock()`，同一执行流无法重入 → 永久自旋。`FileIndex` 只改索引与计数，规避该路径。

### 第 4 题：管道 vs 普通文件分发

管道走 `PipeRead`/`PipeWrite` → `sync` 环形缓冲；普通文件走 `OpenedFile` + inode。管道没有 `OpenedFile`，若误查 `files[fd]` 会得到 `pipe write failed`——这是 Lab6 联调修过的回归点。

### 第 5 题：spawn / exec / mmap

- **spawn**：创建**新**子进程，从磁盘路径加载 ELF，父进程继续。
- **execve**：替换**当前**进程镜像，不新增进程。
- **mmap 匿名页**与 ELF 段都在页表建映射；ELF 有文件 backing 与段权限，匿名 mmap 无文件、由 `map_anonymous` 分配帧。

## 三、任务三动手修改的现象参考

**修改 1**：预置文本进 `fs.img` 后，用户程序 `openat`+`read` 应能打印其内容。  
**修改 2**：`linkat` 前 `nlink` 多为 1；成功后两路径 `ino` 相同、`nlink` 为 2；`unlink` 别名后原路径 `nlink` 回到 1。  
**修改 3**：短文重点写清「教学简化 vs 参考实现」的取舍即可。
