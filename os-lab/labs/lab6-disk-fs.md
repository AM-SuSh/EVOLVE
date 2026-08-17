# 实验 6：磁盘文件系统

> 相关教材理论：
>
>  [第 36 章 · I/O 设备（P313）](/downloads/ostep-zh.pdf#page=313)
>
>  [第 37 章 · 硬盘驱动器（P324）](/downloads/ostep-zh.pdf#page=324)
>
>  [第 40 章 · 文件系统实现（P367）](/downloads/ostep-zh.pdf#page=367)

## 一、问题场景

Lab5 结束后，用户程序看起来已经「会用文件」了：可以 `open` / `read` 一份叫 `testfile` 的数据，父子进程也能用管道传一句 `hi`。  
但是如果继续追问「`testfile` 这类「文件」里读出来的内容被储存在哪里了？」，会发现 Lab5 里的「文件」仍有一层教学用的简化——对练 fd、管道和锁已经够用，但还谈不上真实的持久存储。  
真实的持久存储，至少要同时满足三点：

- **内容来自介质**：文件内容应从可持久保存的存储介质（本实验里是 VirtIO 块设备上的 `fs.img`）读出，而不是编译期写进内核镜像的静态表。
- **运行时可改写**：系统应能在运行时**新建**文件，并把修改**写回**介质，而不只限于「打开、顺序读」一份预置数据。
- **关机后仍存在**：写入介质的数据应在关机、再开机后仍然可被找到和读取。

对照这三点，Lab5 还差半步：数据尚未真正落到「盘」上。想把这一步接进内核，至少需要完成：


| 需要完成                                           | 如果没有会怎样                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| 跟块设备打交道的路径（本实验用 VirtIO + `fs.img`）             | CPU 无法像访存一样直接 `memcpy` 到「磁盘地址」；guest 也不能直接打开宿主机上的镜像路径 |
| 在扇区之上组织「名字 → 内容」（超级块 / inode / 目录项）            | 盘上只剩一串 512 字节块，程序找不到 `filea`，也无法按文件读写                 |
| 运行时可创建、链接、查询元数据（`CREATE` / `linkat` / `fstat`） | 仍停在 Lab5 静态表：不能新建、不能硬链接、看不见 `ino` / `nlink`           |
| 从盘上加载程序（如 `initproc`、`spawn`）                  | 用户程序只能继续编进内核；「真磁盘」路径走不通                               |


Lab5 与本实验对照如下：


| 执行环节       | Lab5（内嵌文件 + 管道）           | 本实验 Lab6（磁盘 FS）                 |
| ---------- | ------------------------- | ------------------------------- |
| 文件内容从哪来    | 编译期编进内核的静态表               | VirtIO 块设备上的 `fs.img` 扇区        |
| 打开之后       | `file_id` + 内嵌切片 + offset | 指向磁盘 inode 的打开对象 + offset       |
| 运行时新建 / 链接 | 基本做不到                     | `CREATE`、硬链接、`fstat` / `unlink` |
| 用户程序从哪加载   | 可编进内核                     | `initproc` 等也可从盘上按路径取出 ELF      |
| 用户接口       | 仍是 fd                     | 仍是 fd（变的是表项背后）                  |


也即完成本实验后，你需要能回答下面四个问题：

- CPU / 内核如何通过 VirtIO 访问 `fs.img` 上的扇区？
- easy-fs 如何在块之上组织超级块、inode、目录项？
- 硬链接与 `fstat` 如何体现「名字」和「内容」可分开？`unlink` 为何不能随便 `inode.clear()`？
- `spawn` 与 `exec` 有何不同？管道 fd 在磁盘 FS 路径下为何仍要单独分发？

**实验目标**：用 VirtIO 块设备访问 `fs.img`，用教学用 easy-fs 组织可打开 / 创建 / 链接 / 查询的文件，并保持 Lab5 的 fd 与管道回归通过。动手点与 Lab2–Lab5 一样落在内核：`kernel/src/fs/disk.rs` 里补全或修复 **硬链接挂别名与** `nlink` **递增**。跑通后，你应在 QEMU 里看到磁盘读写、硬链接等测例通过，且 `fs_test` / `pipe_test` 仍然可以通过。

## 二、背景知识

### 2.1 启动时如何切到磁盘 FS

Lab5 在 `kernel/src/fs/mod.rs` 里走 `embedded` 模块；打开 `lab6` feature 后，同一入口改为导出 `disk`：

```rust
#[cfg(all(feature = "lab5", not(feature = "lab6")))]
mod embedded;
#[cfg(feature = "lab6")]
mod disk;

#[cfg(all(feature = "lab5", not(feature = "lab6")))]
pub use embedded::*;
#[cfg(feature = "lab6")]
pub use disk::*;
```

因此用户态的 `open` / `read` / `write` 编号不用换；变的是内核里 `fs::sys_*` 的实现文件。

`kernel/src/main.rs` 在 Lab6 分支里大致做：

```rust
os_alloc::init_heap();
println!("EVOLVE kernel lab6: VirtIO disk filesystem.");
sync::init();
fs::init();
// ...
process::init();
process::run_initproc();
```

其中 `fs::init()`（见 `disk.rs`）会第一次触碰全局 `FS`：通过 VirtIO 打开 easy-fs，拿到根目录 inode。页表侧还要先把 VirtIO MMIO 区域映进去（见 2.2），否则设备寄存器访问会 fault。

### 2.2 接到盘：MMIO、VirtIO 与 `read_block`

先澄清一个误会：在 QEMU `virt` 机器上，guest 内核**不能**像访问普通 RAM 那样对「整块硬盘」做一次 `memcpy`，也**不能**直接 `open("D:\\...\\fs.img")`——那是宿主机路径。对 guest 而言，`fs.img` 是挂在总线上的 **VirtIO 块设备**。

本实验的 MMIO 基址写在 `kernel/src/config.rs`：

```rust
pub const VIRTIO_MMIO_BASE: usize = 0x1000_1000;
pub const VIRTIO_MMIO_SIZE: usize = 0x1000;
```

启用页表后，必须把这段地址映进内核地址空间。`kernel/src/mm.rs` 中：

```rust
#[cfg(feature = "lab6")]
pub fn map_mmio_devices() {
    let ks = kernel_space_mut();
    ks.map_identical_region(
        VIRTIO_MMIO_BASE,
        VIRTIO_MMIO_BASE + VIRTIO_MMIO_SIZE,
        MapPermission::R.union(MapPermission::W),
    );
}
```

设备驱动在 `kernel/src/virtio_block.rs`：用基址构造 `MmioTransport`，再包成实现了 `easy_fs::BlockDevice` 的 `VirtIOBlock`：

```rust
impl BlockDevice for VirtIOBlock {
    fn read_block(&self, block_id: usize, buf: &mut [u8]) {
        self.inner.lock().read_block(block_id, buf).expect("virtio read_block");
    }
    fn write_block(&self, block_id: usize, buf: &[u8]) {
        self.inner.lock().write_block(block_id, buf).expect("virtio write_block");
    }
}
```

可以把它记成：

```text
内核调用 read_block(block_id, buf)
  → virtqueue 填一张「读第 block_id 块」的订单
  → 写 MMIO 门铃通知设备
  → QEMU 把订单落到宿主机上的 fs.img（偏移 ≈ block_id × 512）
  → 数据回到 buf，上层只看见「读了一块」
```

```mermaid
flowchart LR
    CPU["内核 read_block"] --> VQ["virtqueue"]
    VQ --> DEV["VirtIO 块设备"]
    DEV --> IMG["fs.img 扇区"]
```



还要分清**两个时间点**：


| 时间点          | 谁在做什么                           | 你需要记住什么                    |
| ------------ | ------------------------------- | -------------------------- |
| **宿主机编译期**   | `kernel/build.rs` 打包生成 `fs.img` | 镜像此时只是宿主机上的一个文件            |
| **QEMU 运行时** | guest 内核经 VirtIO 读写这块设备         | guest **打不开**宿主机路径；必须挂上块设备 |


这也是为何验证必须用 `make test-lab6`（带 `-drive` / `virtio-blk-device`），而不是裸 `cargo run`。

### 2.3 编译期打包：`build.rs` 与 `fs.img`

Lab6 打开 feature 时，`kernel/build.rs` 会：

1. 编译 / 收集用户 ELF（含 `lab6_usertest`、`file_test`、`link_test` 等）；
2. 调用 `pack_fs_image`，用 easy-fs 在宿主机上写出 `target/.../release/fs.img`；
3. 把预置文本（如 `filea`、`testfile`）和各 app 写进镜像根目录；
4. 将 `**initproc` 设为 `lab6_usertest**`（不再是 Lab5 那套内嵌 app 索引）。

预置小文件在 `lab6_disk_apps()` 一类列表里，例如：

```rust
fn lab6_disk_apps() -> &'static [(&'static str, &'static [u8])] {
    &[
        ("testfile", b"Hello from testfile!\n"),
        ("filea", b"Hello from filea!\n"),
    ]
}
```

`initproc_app()` 在 Lab6 下返回 `"lab6_usertest"`。因此开机第一条用户程序，已经走「从盘上按路径取 ELF」的路径。

读代码时请对照：`app_names()` 在 `CARGO_FEATURE_LAB6` 下的列表、`pack_fs_image` 如何 `EasyFileSystem::create`、如何把 ELF 字节写入 inode。

### 2.4 在块之上：easy-fs 布局与 `DiskFs::open_file`

有了「读第 N 个 512 字节块」之后，还需要约定：哪些块是超级块、inode 区、目录项、数据块。easy-fs 用经典分层把「块」组织成「文件」：


| 概念        | 大致职责                  | 学习者可以这样记          |
| --------- | --------------------- | ----------------- |
| **超级块**   | 块总数、inode 数量等全局元数据    | 整盘的「说明书首页」        |
| **inode** | 单个文件的大小、数据块索引、链接数等    | 一份内容的「身份证」        |
| **目录项**   | 目录文件里的「名字 → inode 编号」 | 名字只是门牌；真正指向 inode |
| **数据块**   | 文件内容本身                | 真正的字节住在这里         |


内核侧入口是 `DiskFs`：`FS` 在首次使用时 `EasyFileSystem::open(BLOCK_DEVICE)`，并缓存根目录 inode。打开文件时，`open_file` 大致分两条路（对照 `kernel/src/fs/disk.rs`）：

**带** `CREATE`：在 `FileIndex` 里分配 / 复用 `FileMeta`，必要时 `root.create(path)`，再 `inode.clear()`，返回可写的 `OpenedFile`。

**普通打开**：`ensure_meta_for_path` 保证索引里有元数据，再按 `meta.backing_path` 去 `root.find`，可选 `TRUNC` 清空。

用户态 `sys_openat` 拿到 `OpenedFile` 后，把它放进本进程 fd 表：

```rust
match FD_TABLES[slot].alloc(FdType::Regular { offset: 0 }, opened) {
    Some(fd) => fd as isize,
    None => -1,
}
```

于是「打开已有文件」不再查 Lab5 的 `DEFAULT_FILES` 静态表，而更像：

```text
open("filea")
  → 找到根目录 inode
  → 在目录项里查到名字 filea
  → 得到该文件的 inode / FileMeta
  → 在本进程 fd 表占一格：Regular { offset: 0 }
  → 之后 read/write 经 VirtIO 碰数据块
```

请抓住三点：

1. **名字与内容可分开**：目录项 / 别名只回答「这个名字指向谁」；大小、块号、链接数在元数据里。
2. **一切仍经块设备**：查目录、读内容，落到底层都是若干次 `read_block` / `write_block`。
3. `**offset` 语义与 Lab5 相同**：每读 / 写一段，就要推进该 fd 上的偏移。



### 2.5 硬链接、`FileIndex` 与任务一动手点

日常使用里，「一个文件一个名字」往往够用；真实文件系统还允许：**多个名字指向同一份元数据**。这叫**硬链接（hard link）**——数据不必复制第二份。

```text
路径 file0       ──┐
                   ├──→ 同一份 FileMeta（同一 ino、同一套数据）
路径 file0_link  ──┘
```

本内核用 `FileIndex` 维护教学所需的别名与链接计数（见 `disk.rs`）：

```rust
struct FileMeta {
    ino: u64,
    mode: StatMode,
    nlink: u32,
    backing_path: String,
}

struct FileIndex {
    next_ino: u64,
    aliases: BTreeMap<String, Arc<Mutex<FileMeta>>>,
    hidden: BTreeSet<String>,
}
```

- `aliases`：路径 → 共享的 `FileMeta`（`Arc` 表示多名字可握同一份）；
- `nlink`：还剩多少个名字拴着这份内容；
- `hidden`：已被 `unlink` 掉、但可能仍需占位的名字。

参考实现里，`DiskFs::link` 在确认源存在、目标未占用后，做三件关键事：

```rust
meta.lock().nlink += 1;
index.aliases.insert(dst.to_string(), meta);
index.hidden.remove(dst);
```

任务一的 **fill** 把这三步收进 `attach_hard_link_alias`；**debug** 则可能故意漏掉其中的 `nlink += 1`。无论变体如何，不变量都是：

1. 硬链接是**共享同一** `FileMeta` **/** `ino`，不是复制文件内容——不要对 `dst` 再 `alloc_meta`；
2. `aliases.insert` 与 `**nlink += 1**` 是两件事，缺一不可；
3. `sys_fstat` 读出的 `ino` / `nlink` 来自这份共享元数据——`link_test` 正是靠它们判过。

`unlink` 时优先从 `aliases` 摘掉名字、`nlink -= 1`，并把路径记入 `hidden`。这里有一个实现陷阱：

> 若内核路径已经持有 easy-fs 的**全局自旋锁**，却又在临界区里调用内部也会抢**同一把锁**的 `inode.clear()`，哪怕只有一个线程，也会**自死锁**。

因此本实验的 `unlink` **不**在持锁路径上随便 `inode.clear()`；先把索引与计数说清楚，再谈回收。读代码时请对照 `DiskFs::unlink` 与 [lab6 参考答案](/answers/lab6-answers)。

用户测例 `link_test` 的关键断言可以记成：

```text
linkat("file0", "file0_link") 成功
→ 分别 open 两个名字并 fstat
→ 要求 st0.ino == st1.ino 且两者 nlink == 2
→ unlink 一个名字后，剩下那个 nlink == 1
→ 打印 Test link OK!
```

若只 `aliases.insert`、忘了 `nlink += 1`，常见现象是：`file_test pass` 仍在，但 `link_test` 报 `fstat nlink mismatch` 或看不到 `Test link OK!`。

### 2.6 同一张 fd 表：普通文件与管道如何分发

Lab6 的 fd 槽位类型与 Lab5 一脉相承：

```rust
enum FdType {
    Regular { offset: usize },
    PipeRead(usize),
    PipeWrite(usize),
}
```

`sys_read` / `sys_write` 先查本进程 `slots[fd]`，再按类型分发（示意）：

```rust
match ty {
    FdType::PipeRead(pipe_id) => sync::pipe_read(pipe_id, buf, len),
    FdType::Regular { offset, .. } => {
        // 取出 OpenedFile → inode.read_at(offset, ...) → 推进 offset
    }
    FdType::PipeWrite(_) => -1, // 读端才能读
}
```

因此：

- **普通文件**需要 `files[fd]` 里真有 `OpenedFile`（背后是磁盘 inode）；
- **管道**走 `sync::pipe_`*，**不能**要求 `files[]` 一定非空——管道端没有磁盘 `OpenedFile`。

这也解释了任务二里「为何管道不能要求 `files[]` 槽位一定有 `OpenedFile`」：类型在 `slots`，数据路径可以完全不同。Lab5 的 `fs_test` / `pipe_test` 在 Lab6 全链末尾仍要回归通过，正是在检查「换成磁盘 FS 之后，这套分发没有被弄坏」。

### 2.7 从盘上拉起程序：exec 链、spawn 与 mmap

`user/src/bin/lab6_usertest.rs` 是 initproc：它 `exec("file_test")`，再由各测例依次 `exec` 下一个（file → link → mass_unlink → mmap → spawn → stride → fs → pipe）。你在串口里看到的多行 `pass` / `OK!`，就是这条链跑完的结果。

配套能力里最容易混淆的是 `spawn` 与 `exec`：


|         | `exec`            | `spawn`               |
| ------- | ----------------- | --------------------- |
| 进程数量    | 不增加：替换**当前**进程的镜像 | 多出一个**子进程**           |
| 父进程     | 若当前就是自己，自己变成新程序   | 父进程继续跑                |
| 与本实验的关系 | 测例链主要靠它串起来        | 强调「ELF 从盘上按路径取出并新建进程」 |


`mmap` / `munmap`（匿名页）与 `set_priority`（stride，要求 `prio ≥ 2`）是「盘上真有文件 / 真有进程」之后的自然延伸；实现落在 `mm.rs` 与 `process.rs`，测例分别为 `mmap_test`、`stride_test`。

**串起来看整条链**：

```text
VirtIO / virtqueue  →  能碰到 fs.img 扇区
easy-fs 布局        →  扇区长成文件与目录
fd 打开表           →  用户态仍用统一入口
link / fstat        →  「名字」与「内容」可以分开谈
spawn / initproc    →  程序本身也可以从盘上加载
```

一句话概括：**设备层负责「碰到扇区」，文件系统层负责「按名字找到 inode」，fd 层负责「用户只报一个小整数」；任务一考的是硬链接路径上别名与** `nlink` **是否同时正确。**

## 三、实验任务

主要相关文件（路径相对 `os-lab/`）：


| 文件                                             | 角色                                     | 阅读时重点确认                            |
| ---------------------------------------------- | -------------------------------------- | ---------------------------------- |
| `kernel/build.rs`                              | 打包 `fs.img`                            | initproc 从哪来？与 Lab5 内嵌有何不同？        |
| `kernel/src/virtio_block.rs`                   | VirtIO 块读写                             | MMIO 基址？`read_block` 如何落到扇区？       |
| `kernel/src/fs/mod.rs`                         | FS 入口开关                                | Lab6 如何切到 `disk` 实现？               |
| `kernel/src/fs/disk.rs`                        | 磁盘 FS、fd、`linkat` / `fstat`；**任务一动手点** | `FileIndex`、`DiskFs::link`、`nlink` |
| `kernel/src/global_alloc.rs`                   | 堆分配（磁盘 FS 需要）                          | 为何 Lab6 要开全局分配器？                   |
| `kernel/src/mm.rs`                             | `mmap`、MMIO 映射                         | `map_mmio_devices` 映了哪段地址？         |
| `kernel/src/process.rs`                        | `spawn`、stride                         | spawn 与 exec 谁创建进程？                |
| `kernel/src/sync.rs`                           | 管道（Lab5 回归）                            | 磁盘路径下管道 fd 如何仍单独分发？                |
| `os-fs/src/disk.rs`                            | 宿主机布局辅助（不是任务文件）                        | 与内核 `disk.rs` 职责如何分工？              |
| `user/src/bin/lab6_usertest.rs`                | **initproc**：串起全链测例                    | 第一个 `exec` 是谁？                     |
| `user/src/bin/file_test.rs` / `link_test.rs` 等 | 磁盘读写、硬链接、回归                            | `ino` / `nlink` 期望；`pass` 行        |


> 完整代码走读与参考答案见 [lab6 参考答案](/answers/lab6-answers)。  
> 注意：任务文件是 `**kernel/src/fs/disk.rs**`，不要和 `os-fs/src/disk.rs`（宿主机辅助 crate）搞混。



### 任务一：完成实验

本实验的任务文件为 `kernel/src/fs/disk.rs`，请在工作区中打开文件，并根据注释提示完成实验。

确认环境已激活后，在 `os-lab/`（或学生工作区根目录）下运行：

```powershell
make test-lab6
```

**预期输出**（前面 OpenSBI 日志可忽略）：

```text
EVOLVE kernel lab6: VirtIO disk filesystem.
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

**通过标准**（下列断言缺一不可）：


| 断言                     | 必须看到                    |
| ---------------------- | ----------------------- |
| `file-pass`            | `file_test pass`        |
| `link-pass`            | `Test link OK!`         |
| `mmap-pass`            | `mmap_test pass`        |
| `spawn-pass`           | `spawn_test pass`       |
| `stride-pass`          | `stride_test pass`      |
| `fs-pass`              | `fs_test pass`          |
| `pipe-pass`            | `pipe_test pass`        |
| `all-processes-exited` | `All processes exited.` |


且 QEMU 正常退出（终端命令返回，没有卡住或报错）。

> 未修好时常见：`file_test pass` 仍在，但缺少 `Test link OK!` 或出现 `fstat nlink mismatch`——优先查 `DiskFs::link` / `attach_hard_link_alias`，而不是先改用户测例断言。



### 任务二：阅读理解

1. 对照 `virtio_block.rs` 与 `config.rs`：MMIO 基址是多少？`read_block` 如何把逻辑块号变成对 `fs.img` 的访问？为何 guest 内核不能直接打开宿主机上的 `fs.img` 文件路径？
2. 对照 `build.rs` 的 `pack_fs_image`：`initproc` 指向哪个 ELF？与 Lab5 内嵌 app 有何不同？运行时 `CREATE` 新文件在 Lab5 / Lab6 各如何实现？
3. 对照 `fs/disk.rs` 的 `FileIndex`：硬链接时 `nlink` 如何变化？`unlink` 为何不直接 `inode.clear()`？（对照自旋死锁）
4. 对照任务一 fill / debug：`DiskFs::link` 在共享 `FileMeta` 之后还必须做什么？若只 `aliases.insert`、不 `nlink += 1`，为什么往往是 `link_test` 坏而 `file_test` 仍过？
5. 对照 `sys_read` / `sys_write`：管道 fd 与普通文件 fd 的分发路径有何不同？为何管道不能要求 `files[]` 槽位一定有 `OpenedFile`？
6. 对照 `spawn` 与 `execve`：各自从哪加载 ELF？分别创建还是替换进程？`mmap` 匿名页与 ELF 代码段在页表上有何异同？

> 能讲清「VirtIO → easy-fs → fd → link/fstat」，Lab6 主线就过关了。



### 任务三：动手修改

**修改 1：观察用户侧错误预期**

在参考实现的 `user/src/bin/link_test.rs` 里，临时把链接后的 `nlink` 断言改成仍等于链接前（例如期望仍为 1），再跑测例。

- 预期：`link_test` 失败；这是**用户断言**错误。
- 通过标准：能区分「用户测例期望写错」与「内核漏 bump nlink」——两者都可能报 `nlink mismatch`，但排查文件不同。
- **做完务必改回并**确认 `Test link OK!` **恢复**。

**修改 2：增加预置文本文件**

在 `build.rs` 的 `lab6_disk_apps`（或等价列表）中增加一个预置文本文件，再写（或改）用户程序 `open` + `read` 并打印，走通「镜像里多一个文件 → 运行时读出」闭环。

- 通过标准：能看到新增文件内容被正确读出，且原有 `file_test pass` 等关键行仍尽量保持通过。
- **做完务必改回并** `make test-lab6` **确认恢复正常**。

**修改 3：对照参考实现写短文（进阶）**

对照 `reference-patches/ch6-exercise.patch`（若仓库中有），找出一处与本仓库实现不同的设计取舍，写成一小段话（例如锁粒度、索引结构、unlink 策略）。

- 通过标准：能说清「差在哪里、各自在换什么」。



## 四、验证命令


| 验证项      | 命令                                                    | 通过标准                                   |
| -------- | ----------------------------------------------------- | -------------------------------------- |
| 主编译      | `cargo check -p kernel --features lab6`               | 无 error                                |
| QEMU 全链  | `make test-lab6`                                      | 见任务一通过标准表（全部 `pass` / `OK!`，QEMU 正常退出） |
| fs.img   | `make check-fs-img`                                   | 脚本输出 `fs.img OK`                       |
| 组件单测（可选） | `cargo test -p os-fs --target x86_64-pc-windows-msvc` | 末尾 `test result: ok`                   |


> 组件单测在 `os-lab/` 目录下执行；`--target x86_64-pc-windows-msvc` 表示在宿主机上跑。

