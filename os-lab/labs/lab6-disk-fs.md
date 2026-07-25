# 实验 6：磁盘文件系统

> 对应 feature：`lab6`（依赖 `lab5`）。本实验把 Lab5 的**内嵌只读文件表**升级为**真实磁盘文件系统**：通过 VirtIO 块设备访问 `fs.img`，用 easy-fs 管理 inode 与目录，并补齐硬链接、`fstat` 等 ch6 exercise 能力。同时继承 ch4/ch5 前置：`mmap`/`munmap`、`spawn`、`set_priority`（stride 调度）。

## 零、开始之前

1. **已完成 Lab5**：理解 fd 表、管道与自旋锁（见 [lab5-fs-and-sync.md](lab5-fs-and-sync.md)）。
2. **进入工作目录**：`cd os-lab`，必要时先 `. .\scripts\activate-os-env.ps1` 激活环境。
3. **自检**：`rustc --version` 与 `qemu-system-riscv64 --version` 能输出版本。
4. **建议先读书**：OSTEP 第 39–40 章（I/O 设备、硬盘）+ 第 37–38 章（文件系统实现）是本实验的理论基础。

### 环境准备（Lab6 特有）

Lab6 **不能**只用 `cargo run --features lab6`——默认 runner 不带 VirtIO 块设备参数。请使用：

```powershell
cd os-lab
# 建议先预构建用户程序，避免 build.rs 嵌套 cargo 长时间占锁
cargo build -p user --target riscv64gc-unknown-none-elf --release --bins
cargo build -p kernel --features lab6 --release
make test-lab6
```

**产出文件**：

| 路径 | 说明 |
|------|------|
| `target/riscv64gc-unknown-none-elf/release/kernel` | lab6 内核 ELF |
| `target/riscv64gc-unknown-none-elf/release/fs.img` | 磁盘镜像（用户 ELF、`initproc`、`filea` 等） |

`kernel/build.rs` 在编译 lab6 时自动打包 `fs.img`；可用 `make check-fs-img`（调用 `scripts/check-fs-img.ps1`）校验镜像大小。

> **与 Lab5 的关键区别**：Lab5 文件内容编译进内核；Lab6 的 `initproc` 与用户测例从 **VirtIO 磁盘** 按路径加载，更接近真实 OS。

## 一、问题场景

Lab5 的内嵌文件表能教 fd 语义，但有三个明显局限：

- **容量固定**：所有文件在编译期写死，无法在运行时创建、截断或删除。
- **无持久化**：关机后无法保留用户写入的数据（因为根本没有"盘"）。
- **无链接语义**：硬链接、`fstat` 的 `nlink`/`ino` 等真实文件系统概念无法体现。

本实验要回答：**内核如何通过块设备驱动 + 文件系统层，让进程像操作真实磁盘一样 open/read/write/create/link？**

学完后，你的内核应能：

- 通过 VirtIO 读写 `fs.img`
- 用 easy-fs 解析 inode、目录项
- 支持 `linkat` / `unlinkat` / `fstat`
- 从磁盘 `spawn` 子进程，并用 `mmap` 映射匿名页

## 二、背景知识

### 2.0 前置知识：mmap / spawn / stride（第 0 周）

Lab6 继承参考环境 ch4/ch5 exercise 的三项能力，syscall 细节见 [lab6-8.md §十一](../../docs/lab6-8.md#十一lab6-系统调用接口)。

| 能力 | 作用 | 本环境测例 |
|------|------|-----------|
| `mmap` / `munmap` | 在当前进程地址空间映射/解除匿名页 | `mmap_test` |
| `spawn` | 从 **磁盘** 按路径加载 ELF 创建子进程（不复制父地址空间） | `spawn_test` |
| `set_priority` | 设置 stride 调度优先级（`prio ≥ 2`） | `stride_test` |

`mmap` 要求 `addr`、`len` 页对齐（4096），且区间不得与已有映射重叠。`spawn` 与 `exec` 的区别：`exec` 替换当前进程镜像，`spawn` 创建新子进程。

### 2.1 VirtIO 块设备与 MMIO

> 🤔 **先想**：CPU 怎么访问"硬盘"？是直接 memcpy 到磁盘地址吗？

在 QEMU `virt` 机器上，磁盘是 **VirtIO 块设备**，通过 **MMIO**（内存映射 I/O）暴露一组寄存器。内核把物理地址 `0x1000_1000` 映射到内核页表后，读写该区域的寄存器就是在与设备"对话"。

```mermaid
graph LR
    CPU["内核 read/write MMIO"] --> VQ["virtqueue 描述符环"]
    VQ --> DEV["VirtIO 块设备"]
    DEV --> IMG["fs.img 原始块"]

    classDef hw fill:#e3f2fd,stroke:#1565c0;
    classDef fs fill:#fff3e0,stroke:#ef6c00;
    class CPU,VQ hw;
    class DEV,IMG fs;
```

**virtqueue** 是 VirtIO 的核心：内核把"读/写哪个块、数据放哪"填进描述符环，再写 doorbell 通知设备；设备完成后通过中断或轮询告知内核。本实验的 `kernel/src/virtio_block.rs` 封装了 `read_block` / `write_block`，对上层呈现为 `BlockDevice` trait。

块大小与 easy-fs 一致：**512 字节**（`BLOCK_SZ`）。

### 2.2 easy-fs 布局（教学子集）

> 🤔 **先想**：磁盘上一串 512 字节块，怎么组织成"文件名 → 文件内容"？

easy-fs 采用经典分层：

| 概念 | 作用 |
|------|------|
| **超级块** | 记录块总数、inode 数等元数据 |
| **inode** | 文件的元数据（大小、数据块索引、`nlink` 等） |
| **目录项** | 目录文件内的 `(name → inode_id)` 映射 |
| **数据块** | 存文件内容 |

本环境在 `os-fs/src/disk.rs` 提供 host 可测的 `DirEntry`、`InodeMeta`、`MockBlockDevice`，与内核使用的 `tg-rcore-tutorial-easy-fs` 块大小对齐，便于在 PC 上理解布局而不必跑 QEMU。

**与 Lab5 对比**：

```text
Lab5: open("testfile") → 查 EMBEDDED_FILES 静态表
Lab6: open("filea")    → easy-fs 根 inode → 目录项 → 文件 inode → 数据块（经 VirtIO 读盘）
```

### 2.3 open 标志位与可写文件

Lab6 的 `openat` 支持 `CREATE`、`TRUNC`、`WRONLY` 等标志（见 syscall 接口文档）。`file_test` 会：

1. 只读打开预置的 `filea`
2. 以 `CREATE | WRONLY | TRUNC` 创建 `fileb` 并写入
3. 再读回验证

### 2.4 硬链接、fstat 与 unlink 死锁

**硬链接**：多个目录项指向同一 inode，`nlink` 计数链接数。`linkat("file0", "file0_link")` 不复制数据，只增加别名。

**fstat**：通过已打开 fd 查询 `ino`、`mode`、`nlink` 等，用户态使用 `os_syscall::Stat` 结构（与内核布局一致）。

**unlink 死锁（重要）**：若在持有 easy-fs 全局锁时调用 `inode.clear()`（内部再次加锁），会导致自旋死锁——参考环境 ch6 的 `ch6_file2`/`ch6_file3` 曾因此挂死。本内核用 `FileIndex` 维护路径别名与 `nlink`，`unlink` 时只更新索引与计数，避免在持锁路径上调用 `clear()`。详见 [lab6-answers.md](answers/lab6-answers.md)。

## 三、实验任务

> **本实验怎么学**：先跑通 `make test-lab6` 看全链输出，再按 4a（磁盘读写）→ 4b（link/fstat）顺序阅读代码。syscall 表以 [lab6-8.md §十一](../../docs/lab6-8.md#十一lab6-系统调用接口) 为准。

lab6 涉及的主要文件：

| 文件 | 角色 |
|------|------|
| `kernel/build.rs` | 构建 `fs.img`，打包用户 ELF 与 `initproc` |
| `kernel/src/virtio_block.rs` | VirtIO MMIO + 块读写 |
| `kernel/src/fs/disk.rs` | 磁盘 FS、fd 表、`linkat`/`unlinkat`/`fstat` |
| `kernel/src/mm.rs` | `mmap`/`munmap`、MMIO 映射 |
| `kernel/src/process.rs` | `spawn`、`set_priority`、stride 调度 |
| `user/src/bin/lab6_usertest.rs` | initproc，串联全链测例 |
| `user/src/bin/file_test.rs` | ch6 base：磁盘读写的 |
| `user/src/bin/link_test.rs` | ch6 exercise：硬链接 + fstat |

### 任务一：跑通 lab6（必做）

```powershell
make test-lab6
```

**预期输出**（OpenSBI 启动日志可忽略）：

```text
os-lab kernel lab6: VirtIO disk filesystem.
file_test pass
Test link OK!
mass open/unlink OK!
mmap_test pass
Hello from user app!
spawn_test pass
stride_test pass
Hello from testfile!
fs_test pass
pipe says hi
pipe_test pass
All processes exited.
```

**通过标准**：出现以上全部 `pass` / `OK!` 行，且 QEMU 正常退出。

> **注意**：请勿使用不带 VirtIO 参数的 `cargo run -p kernel --features lab6`，否则无法访问 `fs.img`。

### 任务二：阅读理解（必做）

1. `virtio_block.rs`：MMIO 基址在哪定义？`read_block` 如何把逻辑块号变成对 `fs.img` 的访问？
2. `build.rs` 的 `pack_fs_image`：`initproc` 指向哪个 ELF？与 Lab5 内嵌 app 有何不同？
3. `fs/disk.rs` 的 `FileIndex`：硬链接时 `nlink` 如何变化？`unlink` 为何不直接 `inode.clear()`？
4. `sys_read` / `sys_write`：管道 fd 与普通文件 fd 的分发路径有何不同？
5. `spawn` 与 `execve`：各自从哪加载 ELF？分别创建还是替换进程？

> 完整代码解读见 [answers/lab6-answers.md](answers/lab6-answers.md)。

### 任务三：动手小修改（选做）

**修改 1**：在 `build.rs` 的 `lab6_disk_apps()` 增加一个预置文本文件，写用户程序读取并打印。

**修改 2**：用 `fstat` 打印 `filea` 的 `ino` 与 `nlink`，观察 `linkat` 前后变化。

**修改 3**（进阶）：对照 `reference-patches/ch6-exercise.patch`，找出一处与参考实现不同的设计取舍并写成短文。

### 提交清单（自查）

- [ ] `make test-lab6` 全链通过
- [ ] 能解释 VirtIO + `fs.img` 与 Lab5 内嵌表的区别
- [ ] 能解释硬链接与 `nlink` 的关系
- [ ] 能说明 unlink 死锁成因与本内核的规避方式
- [ ] 完成 [exercises/lab6-exercises.md](exercises/lab6-exercises.md) 文字习题

## 四、验证

| 验证项 | 命令 | 通过标准 |
|--------|------|----------|
| 主编译 | `cargo check -p kernel --features lab6` | 无 error |
| QEMU 全链 | `make test-lab6` | 见任务一预期输出 |
| fs.img | `make check-fs-img` | 脚本输出 `fs.img OK` |
| host 单测（可选） | `cargo test -p os-fs --target <host-triple>` | 8 项通过 |

手册中的交互式清单见 handbook「Lab6 磁盘文件系统」页（数据来自 `handbook/data/labs.json`）。

## 五、AI 提问模板

1. **概念澄清型**：「MMIO 和端口 I/O 有什么区别？为什么 RISC-V virt 上的 VirtIO 用 MMIO？」
2. **现象解释型**：「`linkat` 成功后两个路径的 `fstat.ino` 为什么相同？`unlink` 一个路径后另一个还能读吗？」
3. **代码追因型**：「`FileIndex` 里的 `hidden` 集合是干什么的？和 easy-fs 里真正的目录项删除有何不同？」
4. **对比深化型**：「Lab5 管道 fd 在 Lab6 磁盘 FS 下为什么要单独处理 `PipeRead`/`PipeWrite`？」
5. **动手探索型**：「若要把日志写到磁盘文件，需要扩展哪些 syscall 或标志位？」

## 六、思考题与参考答案

部分习题与 [exercises/lab6-exercises.md](exercises/lab6-exercises.md) 重叠；完整答案与代码走读见 [answers/lab6-answers.md](answers/lab6-answers.md)。

### 习题 1（fd 与磁盘文件）

**Lab6 的 fd 表与 Lab5 相比多了什么？**

参考答案：Lab6 在 `fs/disk.rs` 中为每个 Regular fd 关联 `OpenedFile`（含 `FileHandle` 与可选 `FileMeta`）。管道 fd 仍用 `PipeRead`/`PipeWrite`，但 `sys_read`/`sys_write` 对管道**不再要求** `files[]` 槽位有值——这是 Lab6 联调时修过的回归点。Regular 文件通过 easy-fs 的 inode 读写磁盘块，并维护 per-fd `offset`。

### 习题 2（块设备抽象）

**为什么内核不直接 `read()` 宿主机上的 `fs.img` 文件，而要经过 VirtIO？**

参考答案：教学目标与真实路径一致：在 QEMU 里，guest 内核只能通过设备模型访问磁盘。VirtIO 驱动 + MMIO + virtqueue 模拟了真实 virtio-blk 的行为。`build.rs` 在**宿主机编译期**生成 `fs.img`；**运行时**内核把它当作块设备上的扇区来读写，而不是解析宿主机文件路径。
