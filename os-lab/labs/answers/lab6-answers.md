# Lab6 参考答案与代码解读

> 本文件是 [lab6-disk-fs.md](../lab6-disk-fs.md) 的配套答案，含代码走读与 [lab6-exercises.md](../exercises/lab6-exercises.md) 习题答案。  
> **使用建议**：先独立完成实验任务二与文字习题，再对照本文件。

## 一、代码走读要点

### 1.1 `kernel/build.rs`：fs.img 打包

- `app_names()` 在 `CARGO_FEATURE_LAB6` 下包含 `lab6_usertest`、`file_test`、`link_test` 等全部测例 ELF。
- `pack_fs_image()` 创建 64×2048 个块（512 B/块）的镜像，用 easy-fs 格式化后写入各 app 与 `filea`/`testfile`。
- **`initproc` 指向 `lab6_usertest`**，不再使用 Lab5 的内嵌 app 索引。

### 1.2 `kernel/src/virtio_block.rs`

- MMIO 区域由 `config.rs` 的 `VIRTIO_MMIO_BASE`（`0x1000_1000`）定义，`mm::map_mmio_devices()` 映射进内核页表。
- 实现 `easy_fs::BlockDevice`：`read_block`/`write_block` 通过 virtqueue 与 QEMU virtio-blk 交互，最终读写 `fs.img` 对应扇区。

### 1.3 `kernel/src/fs/disk.rs`：FileIndex 与 unlink

```text
link:  别名表 aliases[path] → Arc<FileMeta>；同一 inode 的 nlink += 1
unlink: 从 aliases 移除路径名，nlink -= 1；路径加入 hidden，避免立即 reopen
```

**死锁规避**：不在持有 easy-fs 全局锁的路径上调用 `inode.clear()`。删除最后一个硬链接时，仅更新内存索引；磁盘 inode 的清理由 easy-fs 在合适时机处理，或保持教学简化。这与 progress.md 中 06-27 记录的参考环境修复思路一致。

### 1.4 管道 fd 回归修复

`sys_read`/`sys_write` 先根据 `slots[fd]` 判断 `FdType`：

- `PipeRead`/`PipeWrite`：直接调用 `sync::pipe_read`/`pipe_write`，**不**要求 `files[fd]` 非空。
- `Regular`：从 `files[fd]` 取 `OpenedFile`，经 inode 读写磁盘。

Lab5 内嵌 FS 中管道与普通文件共用一套槽位逻辑；Lab6 磁盘 FS 曾误要求管道 fd 也有 `OpenedFile`，导致 `pipe write failed`，已在联调中修复。

### 1.5 `spawn` 与 stride

- `sys_spawn`：`fs::read_file_all(path)` 从磁盘读 ELF → `create_user_space_from_elf` → `ProcessManager::spawn`，子进程独立地址空间。
- `sys_set_priority`：`prio < 2` 拒绝；否则更新 PCB 的 `priority`，`find_next_ready` 按 stride 最小者调度。

## 二、文字习题答案

### 习题 1：内嵌表 vs 磁盘 FS

**运行时创建文件**：Lab5 无法在运行时创建（表编译期固定）。Lab6 通过 `openat(..., O_CREATE|...)` 在 easy-fs 根目录下 `create` 新 inode 并写数据块。

**initproc 来源**：Lab5 为内核镜像内嵌 ELF 索引；Lab6 从 `fs.img` 内文件 `initproc` 加载，必须经过块设备与文件系统路径。

**无 VirtIO 时**：内核无法访问 `fs.img`，`initproc` 加载失败或磁盘 FS 初始化失败，测例无法运行。

### 习题 2：VirtIO 与 MMIO

**MMIO**：把设备寄存器映射到物理地址空间，CPU 用普通 load/store 访问设备，而非专用 I/O 指令。

**描述符**：通常包含缓冲区地址、长度、读写方向；设备按描述符完成 DMA 或模拟传输后标记完成。

**512 字节**：easy-fs 与 VirtIO 块设备统一块大小，逻辑块号 × 512 = 字节偏移。

### 习题 3：硬链接与 fstat

**link 后**：两次 `fstat` 的 `ino` 相同；`nlink` 为 2（两个路径指向同一 inode 元数据）。

**unlink 别名后**：`file0` 的 `nlink` 变为 1；`file0` 仍可打开读写。

**与复制的区别**：硬链接共享数据块与 inode，不增加磁盘数据副本；复制会创建新 inode 并拷贝内容。

### 习题 4：unlink 死锁

**死锁原因**：`fs.lock()` 已持有自旋锁，若 `clear()` 内部再次 `lock()`，同一线程无法重入，永远自旋。

**本内核做法**：`FileIndex` 维护路径别名与 `nlink`，`unlink` 只改索引与计数，避免在持锁临界区调用会再次加锁的 `clear()`。

**mass 回归**：快速连续 create/unlink 多文件，验证无挂死、无泄漏，锁粒度足够细。

### 习题 5：mmap、spawn、stride

**mmap vs ELF**：二者都在页表建立映射；ELF 段有文件 backing 与特定权限，匿名 mmap 无文件、由 `map_anonymous` 分配帧。

**spawn vs exec**：`spawn` 创建子进程，父进程继续；`exec` 替换**当前**进程镜像，不新增进程。

**set_priority(1)**：教学内核要求 `prio ≥ 2`；数值越大 stride 步长越大，在 stride 调度中通常获得相对更多 CPU 时间（与具体 `pass()` 实现相关，见 `process.rs`）。
