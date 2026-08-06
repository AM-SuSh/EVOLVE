# 实验 6：磁盘文件系统

> 相关教材理论：
>
>  [第 36 章 · I/O 设备（P313）](/downloads/ostep-zh.pdf#page=313)
>
>  [第 37 章 · 硬盘驱动器（P324）](/downloads/ostep-zh.pdf#page=324)
>
>  [第 40 章 · 文件系统实现（P367）](/downloads/ostep-zh.pdf#page=367)

## 零、开始之前

在开始把「文件」落到真正的磁盘镜像之前，请确认已完成以下准备：

1. **已完成 Lab5**：理解 fd 表、管道与自旋锁（见 [Lab5 文件系统与并发](/labs/lab5-fs-and-sync)）。本实验会继续用同一套 `open` / `read` / `write`，但打开之后从盘上取字节。
2. **进入工作目录**：在本仓库根目录下，进入自研实验环境目录：
  ```powershell
   cd os-lab
  ```
3. **（可选）激活当前终端环境**：如果你新开了一个终端，请在仓库**根目录**（不是 os-lab 目录）执行以下命令，让本会话能找到 Rust 和 QEMU：
  ```powershell
   . .\scripts\activate-os-env.ps1
   cd os-lab
  ```
4. **快速自检**：以下两条命令都能输出版本号，说明环境就绪：
  ```powershell
   rustc --version          # 预期：rustc 1.96.0 ...
   qemu-system-riscv64 --version   # 预期：QEMU emulator version ...
  ```

> 如果上面任何一步报“找不到命令”，回到 [环境搭建指南](/setup/environment) 检查安装；不要急着做第 4 步预构建。

1. **预构建依赖（Lab6 新增）**：Lab6 需要 VirtIO 块设备与磁盘镜像 `fs.img`。请在**已经激活环境、并且当前目录是** `os-lab` 的前提下执行（可减少 `build.rs` 嵌套 cargo 长时间占锁）：
  ```powershell
   # 确认：pwd 应类似 ...\Or2-1-OS\os-lab
   cargo build -p user --target riscv64gc-unknown-none-elf --release --bins
   cargo build -p kernel --features lab6 --release
  ```
   成功后应能看到：

  | 路径                                                 | 说明                                 |
  | -------------------------------------------------- | ---------------------------------- |
  | `target/riscv64gc-unknown-none-elf/release/kernel` | Lab6 内核 ELF                        |
  | `target/riscv64gc-unknown-none-elf/release/fs.img` | 磁盘镜像（含用户 ELF、`initproc`、`filea` 等） |


> `kernel/build.rs` 在编译 lab6 时也会自动打包 `fs.img`；可用 `make check-fs-img` 校验镜像。

1. **建议先读书**：OSTEP 第 36–37 章（I/O 与硬盘）、第 40 章（文件系统实现）。带着「CPU 怎么碰到硬盘」「文件名如何落到扇区」进来即可。Lab6 对应 feature 为 `lab6`（依赖 `lab5`）。



## 一、问题场景

Lab5 结束后，用户程序看起来已经「会用文件」了：可以 `open` / `read` 一份叫 `testfile` 的数据，父子进程也能用管道传一句 `hi`。  
但是如果继续追问“`testfile` 这类「文件」里读出来的内容被储存在哪里了？”，会发现 Lab5 里的「文件」仍有一层教学用的简化——对练 fd、管道和锁已经够用，但还谈不上真实的持久存储。  
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

**实验目标**：用 VirtIO 块设备访问 `fs.img`，用教学用 easy-fs 组织可打开 / 创建 / 链接 / 查询的文件，并保持 Lab5 的 fd 与管道回归通过。跑通后，你应在 QEMU 里看到磁盘读写、硬链接等测例通过，且 `fs_test` / `pipe_test` 仍然可以通过。

## 二、背景知识

问题场景里的三点——内容来自介质、运行时可改写、关机后仍存在——指向同一条主线：把「文件」从 Lab5 的**编译期静态表**，换成运行时能查找、能改写的**盘上对象**。

要做到这一点，内核至少要会两件事，而且顺序不能颠倒：

1. **先接到盘**：学会按块读写一块叫 `fs.img` 的镜像（设备层）；
2. **再在块上长出文件**：用超级块、inode、目录项把「扇区」组织成「按名字打开的文件」（文件系统层）。

用户侧仍继续用 Lab5 熟悉的 `open` / `read` / `write` 与 fd；变的是表项**背后**指向哪里。下面按「设备 → 布局 → 可写打开 → 硬链接 → 从盘拉起程序」展开。

### 2.1 接到盘：VirtIO、MMIO 与 virtqueue

先回答一个直觉上的误会：在 QEMU 的 `virt` 机器上，guest 内核**并不能**像访问普通内存那样，对「整块硬盘」做一次 `memcpy`。  
宿主机上的 `fs.img` 对 guest 来说，是挂在总线上的一块 **VirtIO 块设备**：CPU 要先学会跟设备「对话」，才能读写扇区。

对话的入口通常是 **MMIO（Memory-Mapped I/O，内存映射 I/O）**：设备在物理地址空间里占用一段特殊区域（本实验常见基址一带为 `0x1000_1000`）。内核把这段地址映射进页表之后，对该区域的 load / store，硬件会当成「读写设备寄存器」，而不是普通 RAM。可以把它想成：同一套访存指令，落到这块地址上就变成了「敲设备的门铃、读状态」。

真正搬数据时，常见路径是 **virtqueue**（一套描述符环 + 通知机制）：

```mermaid
flowchart LR
    CPU["内核访问 MMIO"] --> VQ["virtqueue"]
    VQ --> DEV["VirtIO 块设备"]
    DEV --> IMG["fs.img 扇区"]
```



一次块读写，大致可以记成：

```text
1. 内核准备好缓冲区（读：空缓冲；写：已填好的数据）
2. 在 virtqueue 里填一张「订单」：读还是写、哪一块、缓冲在哪、多长
3. 写门铃（MMIO）通知设备「有活了」
4. 设备完成后，用中断或轮询告诉内核
5. 上层只看见 read_block / write_block 这类接口
```

本实验里，块大小与 easy-fs 对齐，为 **512 字节**。逻辑块号 × 512，就是镜像文件内的字节偏移——上层说「第 10 块」，底层就去碰 `fs.img` 里偏移 `10 × 512` 那一段。

还要分清**两个时间点**，否则很容易跑错命令：


| 时间点          | 谁在做什么                           | 你需要记住什么                    |
| ------------ | ------------------------------- | -------------------------- |
| **宿主机编译期**   | `kernel/build.rs` 打包生成 `fs.img` | 镜像此时只是宿主机上的一个文件            |
| **QEMU 运行时** | guest 内核经 VirtIO 读写这块设备         | guest **打不开**宿主机路径；必须挂上块设备 |


这也是为何 Lab6 要用带设备参数的 `make test-lab6`，而不是裸 `cargo run`：后者往往访不到 `fs.img`，设备层这一环就断了。

读代码时可对照：`config` 里的 MMIO 基址、`mm::map_mmio_devices`（把 MMIO 区域映进页表），以及 `kernel/src/virtio_block.rs`（填队列、按块号读写）。下一小节回答：有了「按块读写」之后，怎样才能按**文件名**找到内容。

### 2.2 在块之上：easy-fs 如何组织文件

2.1 只给了「读第 N 个 512 字节块」的能力。若盘上只剩一串扇区、没有任何约定，程序仍然找不到叫 `filea` 的东西——就像图书馆只有一排未编号的书架，却没有目录卡。

easy-fs（本实验用的教学子集）沿用经典分层，把「块」组织成「文件」：


| 概念        | 大致职责                  | 学习者可以这样记          |
| --------- | --------------------- | ----------------- |
| **超级块**   | 块总数、inode 数量等全局元数据    | 整盘的「说明书首页」        |
| **inode** | 单个文件的大小、数据块索引、链接数等    | 一份内容的「身份证」        |
| **目录项**   | 目录文件里的「名字 → inode 编号」 | 名字只是门牌；真正指向 inode |
| **数据块**   | 文件内容本身                | 真正的字节住在这里         |


于是「打开已有文件」不再查 Lab5 的 `DEFAULT_FILES` 静态表，而更像沿目录往下走：

```text
open("filea")
  → 找到根目录 inode
  → 在目录项里查到名字 filea
  → 得到该文件的 inode
  → 按 inode 记录的数据块号，经 VirtIO 读出内容
```

请抓住三点：

1. **名字与内容可分开**：目录项只存「名字 → inode 编号」；真正的大小、块号、链接数在 inode 里。这为后面的硬链接埋下伏笔。
2. **一切仍经块设备**：无论查目录还是读文件内容，落到底层都是若干次 `read_block` / `write_block`。
3. **可先在 host 侧想清楚**：`os-fs` 提供布局类型与 `MockBlockDevice`，不必每次都进 QEMU，也能先把「块 → 目录 → inode」走通。

下一小节看：有了可写的文件系统之后，`open` 的标志位多出了什么含义。

### 2.3 可写文件与打开标志

Lab5 的 `open` 大体是「按名字找到一份只读切片，塞进 fd 表」。有了真正的磁盘布局之后，`openat` 还要回答：**打开时允许做什么？文件不存在怎么办？要不要先清空再写？**

这些意图常用打开标志表达，本实验里你至少会碰到：


| 意图       | 常见标志     | 直观效果                      |
| -------- | -------- | ------------------------- |
| 只读打开已有文件 | 只读相关标志   | 能 `read`，不能当写端用           |
| 创建新文件    | `CREATE` | 名字不存在时，在盘上建出新 inode / 目录项 |
| 打开并截断    | `TRUNC`  | 已有内容先清空，再从偏移 0 写          |


`file_test` 一类测例会先读预置的 `filea`，再以创建 / 截断方式写出 `fileb` 并读回校验——这正是 Lab5 静态表做不到的「运行时新建」。

对用户程序而言，**接口外形几乎没变**：`openat` 仍返回一个小整数 fd，`read` / `write` 仍查本进程的打开表。变的是表项背后：


|          | Lab5                          | Lab6                        |
| -------- | ----------------------------- | --------------------------- |
| 打开后记住什么  | `file_id` + 内嵌字节切片 + `offset` | 指向磁盘 inode 的打开对象 + `offset` |
| 读到的字节从哪来 | 内核镜像里的静态表                     | VirtIO 读出的数据块               |
| 能不能新建    | 基本不能                          | 可以（配合 `CREATE` 等）           |


`offset` 的语义与 Lab5 相同：每读 / 写一段，就要把该 fd 上的位置往前推，否则下次仍从旧位置开始。下一小节把「名字」和「内容」拆得更开：两个路径如何指向同一份 inode。

### 2.4 硬链接、fstat，以及 unlink 时的锁陷阱

日常使用里，「一个文件一个名字」往往够用；真实文件系统还允许：**多个目录项指向同一个 inode**。这叫**硬链接（hard link）**——数据不必复制第二份，只是多个名字共用同一套元数据与数据块。

可以用门牌来想：

```text
路径 /filea  ──┐
               ├──→ 同一个 inode（一份内容、一套块号）
路径 /fileb  ──┘
```

相关系统调用与字段：

- `linkat`：再增加一个名字，拴到已有 inode 上（多一块「门牌」）；
- `nlink`：还剩多少个名字拴着这份内容；减到 0，内容才真正可以被回收；
- `fstat`：通过已打开的 fd 读出 `ino`、`nlink`、`mode` 等。若两个路径 `fstat` 得到相同 `ino`，通常就可以判断「它们是同一份东西」。

删除名字时用 `unlinkat`。这里有一个实现上很容易踩的坑，值得单独记住：

> 若内核路径已经持有 easy-fs 的**全局自旋锁**，却又在临界区里调用内部也会抢**同一把锁**的 `inode.clear()`，哪怕只有一个线程，也会**自死锁**——自己等自己放手。

本内核因此用 `FileIndex` 维护路径别名与 `nlink`：`unlink` 时优先更新索引与计数，避免在持锁临界区里二次加锁。读代码时请对照 `fs/disk.rs`，并与 [lab6 参考答案](/answers/lab6-answers) 里对锁顺序的说明一起看。

测例 `link_test` 会把「建链接 → `fstat` 看 `ino` / `nlink` → 删一个名字」串起来；通过它，你应能口头回答：为什么删掉一个名字，文件内容不一定立刻消失。

### 2.5 从盘上拉起程序：mmap / spawn / stride

有了「盘上真有文件」之后，Lab6 还会带着几项配套能力——它们不是另一条无关支线，而是「持久化文件」在进程与地址空间上的自然延伸：


| 能力                | 直觉                             | 测例            |
| ----------------- | ------------------------------ | ------------- |
| `mmap` / `munmap` | 在地址空间里映射 / 解除匿名页               | `mmap_test`   |
| `spawn`           | 从**磁盘路径**读 ELF，**新建**一个子进程     | `spawn_test`  |
| `set_priority`    | 调整 stride 调度优先级（要求 `prio ≥ 2`） | `stride_test` |


最容易混淆的是 `spawn` **与** `exec`：


|         | `exec`            | `spawn`          |
| ------- | ----------------- | ---------------- |
| 进程数量    | 不增加：替换**当前**进程的镜像 | 多出一个**子进程**      |
| 父进程     | 若当前就是自己，自己变成新程序   | 父进程继续跑           |
| 与本实验的关系 | 仍可能用到             | 强调「ELF 从盘上按路径取出」 |


`initproc` 本身也改为从 `fs.img` 加载——也就是说，开机第一条用户程序，已经走在「真磁盘」路径上了，而不再只是编进内核的内嵌镜像。

**串起来看整条链**：

```text
VirtIO / virtqueue  →  能碰到 fs.img 扇区
easy-fs 布局        →  扇区长成文件与目录
fd 打开表           →  用户态仍用统一入口
link / fstat        →  「名字」与「内容」可以分开谈
spawn / initproc    →  程序本身也可以从盘上加载
```



## 三、实验任务

本实验主要相关文件（路径相对 `os-lab/`）：


| 文件                                           | 角色                          | 阅读时重点确认                                 |
| -------------------------------------------- | --------------------------- | --------------------------------------- |
| `kernel/build.rs`                            | 打包 `fs.img`                 | initproc 从哪来？与 Lab5 内嵌有何不同？             |
| `kernel/src/virtio_block.rs`                 | VirtIO 块读写                  | MMIO 基址？逻辑块号如何落到扇区？                     |
| `kernel/src/fs/disk.rs`                      | 磁盘 FS、fd、`linkat` / `fstat` | `FileIndex` 如何记 nlink？unlink 为何不 clear？ |
| `kernel/src/mm.rs`                           | `mmap`、MMIO 映射              | 匿名页与 ELF 段有何不同？                         |
| `kernel/src/process.rs`                      | `spawn`、stride              | spawn 与 exec 谁创建进程？                     |
| `user/src/bin/lab6_usertest.rs`              | initproc 全链                 | 测例顺序如何串联？                               |
| `user/src/bin/file_test.rs` / `link_test.rs` | 磁盘读写 / 硬链接                  | CREATE、link、fstat 现象                    |


> 完整代码走读与参考答案见 [lab6 参考答案](/answers/lab6-answers)。



### 任务一：跑通内核

确认环境已激活，并已按「零、开始之前」完成预构建（可选但推荐）。然后在 `os-lab/` 下运行：

```powershell
make test-lab6
```

> **请勿**使用裸的 `cargo run -p kernel --features lab6`，否则访问不到 `fs.img`。

**预期输出**：屏幕会先刷出 **OpenSBI 启动日志**（可忽略），随后是内核与用户测例输出。示意如下：

```text
OpenSBI v1.7
  ...（OpenSBI 平台/HART 日志，可忽略）...
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

**通过标准**：出现以上全部 `pass` / `OK!` 行，且 QEMU 正常退出（终端命令返回，没有卡住或报错）。

### 任务二：阅读理解

参考答案见 [lab6 参考答案](/answers/lab6-answers)。每道题建议先合上代码想答案，再打开对照。

1. 对照 `virtio_block.rs`：MMIO 基址在哪定义？`read_block` 如何把逻辑块号变成对 `fs.img` 的访问？为何 guest 内核不能直接打开宿主机上的 `fs.img` 文件路径？
2. 对照 `build.rs` 的 `pack_fs_image`：`initproc` 指向哪个 ELF？与 Lab5 内嵌 app 有何不同？运行时 `CREATE` 新文件在 Lab5 / Lab6 各如何实现？
3. 对照 `fs/disk.rs` 的 `FileIndex`：硬链接时 `nlink` 如何变化？`unlink` 为何不直接 `inode.clear()`？（对照自旋死锁）
4. 对照 `sys_read` / `sys_write`：管道 fd 与普通文件 fd 的分发路径有何不同？为何管道不能要求 `files[]` 槽位一定有 `OpenedFile`？
5. 对照 `spawn` 与 `execve`：各自从哪加载 ELF？分别创建还是替换进程？`mmap` 匿名页与 ELF 代码段在页表上有何异同？

> 能讲清「VirtIO → easy-fs → fd → link/fstat」，Lab6 主线就过关了。



### 任务三：动手修改

**修改 1：增加预置文本文件**

在 `build.rs` 打包列表中增加一个预置文本文件，再写（或改）用户程序 `open` + `read` 并打印，走通「镜像里多一个文件 → 运行时读出」闭环。

```powershell
make test-lab6
```

- 通过标准：能看到你新增文件的内容被正确读出，且原有 `file_test pass` 等关键行仍尽量保持通过。
- **做完务必改回并** `make test-lab6` **确认恢复正常**（若希望保留作展示，可另开分支）。

**修改 2：观察 linkat 前后的 ino / nlink**

用 `fstat` 打印 `filea` 的 `ino` 与 `nlink`，再 `linkat` 出一个新名字，再次 `fstat` 两个路径，观察前后变化。

- 预期现象：两个路径的 `ino` 相同；`nlink` 在链接后增加。
- 通过标准：能用自己的话解释**为什么**硬链接共享 inode、删一个名字后另一个仍可能可读。
- **做完务必改回并** `make test-lab6` **确认恢复正常**。

**修改 3：对照参考实现写短文（进阶）**

对照 `reference-patches/ch6-exercise.patch`，找出一处与本仓库实现不同的设计取舍，写成一小段话（例如锁粒度、索引结构、unlink 策略）。

- 通过标准：能说清「差在哪里、各自在换什么」。



## 四、验证命令


| 验证项      | 命令                                                    | 通过标准                                   |
| -------- | ----------------------------------------------------- | -------------------------------------- |
| 主编译      | `cargo check -p kernel --features lab6`               | 无 error                                |
| QEMU 全链  | `make test-lab6`                                      | 见任务一预期输出（全部 `pass` / `OK!`，QEMU 正常退出）  |
| fs.img   | `make check-fs-img`                                   | 脚本输出 `fs.img OK`                       |
| 组件单测（可选） | `cargo test -p os-fs --target x86_64-pc-windows-msvc` | **11** 项通过（内嵌/布局与 `fd_kind`、disk 辅助测例） |


> 组件单测在 `os-lab/` 目录下执行；`--target x86_64-pc-windows-msvc` 表示在宿主机上跑。终端末尾应看到类似：`test result: ok. 11 passed; 0 failed; …`。

