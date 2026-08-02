# 实验 6：磁盘文件系统

> 对应 feature：`lab6`（依赖 `lab5`）。

> **配套教材**（《操作系统导论》OSTEP 中译）：[第 36 章 · I/O 设备（PDF 第 313 页）](/downloads/ostep-zh.pdf#page=313) · [第 37 章 · 硬盘驱动器（PDF 第 324 页）](/downloads/ostep-zh.pdf#page=324) · [第 40 章 · 文件系统实现（PDF 第 367 页）](/downloads/ostep-zh.pdf#page=367) · [全书入口](/downloads/ostep-zh.pdf)

读到这里，你已经会用 **fd** 打开一份数据、用 **管道** 在进程间传一句话，也知道共享结构需要 **锁** 来保护。Lab5 把「文件」这层抽象第一次接进了内核，但若回头细想，会发现那些所谓的文件其实有点「假」。Lab5里的内容是编译期写进内核镜像的字节切片，运行时既不好真正新建，关机后也谈不上把修改写回什么地方。对学习 fd 语义来说够用了；但是对照《操作系统导论》里的**持久性（Persistence）**，却还差半步：数据还没有真正落到「盘」上。

教材里的持久性，主要围绕着两件事：字节如何在存储设备上长期保存，以及程序如何按名字找到它们。真实系统通常自下而上分成几层：最底下由设备驱动跟硬件打交道，把存储看成一块块可读写的扇区；中间由文件系统在这些块之上建立目录、inode 等结构，把「名字」对应到「内容」；最上面，用户程序仍然只调用熟悉的 `open` / `read` / `write`，不必直接碰扇区编号。本实验按同样的层次来理解，但只把中间最关键的一段接起来：用 **VirtIO 块设备** 访问镜像 `fs.img`（相当于驱动层），再用教学用的 **easy-fs** 把扇区组织成可以打开、创建、链接和查询的文件（相当于文件系统层）。你在 Lab5 学过的 fd 不必丢掉，用户程序那一层接口还在，变的是**打开之后，内核到底从哪里取出那些字节**。

## 零、开始之前

1. **已完成 Lab5**：理解 fd 表、管道与自旋锁（见 [lab5-fs-and-sync.md](lab5-fs-and-sync.md)）。
2. **进入工作目录**：`cd os-lab`；新开终端先 `. .\scripts\activate-os-env.ps1`。
3. **自检**：`rustc --version` 与 `qemu-system-riscv64 --version` 能输出版本。
4. **建议先翻书**：I/O 设备与硬盘、文件系统实现相关章节。带着「CPU 怎么碰到硬盘」「文件名如何落到扇区」进来即可。



### 环境准备（Lab6 特有）

Lab6 依赖 VirtIO 块设备与 `fs.img`。进入 `os-lab` 后建议先预构建（避免 `build.rs` 嵌套 cargo 长时间占锁）：

```powershell
cd os-lab
cargo build -p user --target riscv64gc-unknown-none-elf --release --bins
cargo build -p kernel --features lab6 --release
```

**产出文件**：

| 路径                                                 | 说明                                |
| -------------------------------------------------- | --------------------------------- |
| `target/riscv64gc-unknown-none-elf/release/kernel` | lab6 内核 ELF                       |
| `target/riscv64gc-unknown-none-elf/release/fs.img` | 磁盘镜像（用户 ELF、`initproc`、`filea` 等） |

`kernel/build.rs` 在编译 lab6 时自动打包 `fs.img`；可用 `make check-fs-img` 校验镜像。

> 跑通验证请用【任务一】中的 `make test-lab6`（已封装 VirtIO）。请勿用裸 `cargo run -p kernel --features lab6`，否则访问不到 `fs.img`。

## 一、问题场景

Lab5 结束后，用户程序已经能 `open` / `read` 一份叫 `testfile` 的数据，父子进程也能用管道传 `hi`。但若你继续追问：

> 「这些字节真的在『盘』上吗？运行时能不能新建一个文件？两个文件名能不能指向同一份内容？」

对照现状，至少有几个问题还悬着：

- **CPU 怎样访问硬盘？**  
内核能不能像访问普通内存一样 `memcpy` 到某个「磁盘地址」？若不能，设备寄存器、请求队列大致扮演什么角色？为何 guest 里通常不能直接打开宿主机上的 `fs.img` 路径？
- **一串扇区如何变成「文件名 → 内容」？**  
磁盘上只有块。名字、大小、数据分别记在哪一层？打开 `filea` 时，内核要经过哪些查找步骤？
- **运行时创建、链接、查询元数据意味着什么？**  
`CREATE` 一个新文件时，盘上多了什么？两个路径指向同一 inode 时，`ino` / `nlink` 应满足什么关系？删除一个名字后，另一个名字还能读吗？
- **程序本身从哪加载？**  
Lab5 的用户程序可以编进内核；若 `initproc` 也改成「从盘上按路径取出 ELF」，和 `exec` / `spawn` 各是什么关系？

本实验继续围绕教材的**持久性**主题，把「假文件」推进到「真磁盘上的教学文件系统」。跑通后，你应能在 QEMU 里看到磁盘读写、硬链接等测例通过，并且 Lab5 的文件 / 管道回归仍然站住。

## 二、背景知识

本实验要抓住的主线其实不复杂：把「文件」从编译期的静态表，换成运行时能查找、能改写的盘上对象。为此，内核得先学会跟块设备打交道，再在块之上建立起名字与元数据——下面就按这个顺序往下看。

### 2.1 接到盘：VirtIO、MMIO 与 virtqueue

在 QEMU 的 `virt` 机器上，磁盘通常以 **VirtIO 块设备** 的形式出现。CPU 并不能把某个物理地址当成「整块硬盘」直接 `memcpy`；设备通过 **MMIO（内存映射 I/O）** 暴露一组寄存器——内核把例如 `0x1000_1000` 一带映射进页表后，对该区域的 load/store，就是在与设备对话。

真正搬数据时，常见路径是 **virtqueue**：内核把「读/写哪个块、缓冲区在哪、长度多少」填进描述符环，再写门铃通知设备；设备完成后用中断或轮询告诉内核。上层于是只需面对 `read_block` / `write_block` 这类接口。本实验块大小与 easy-fs 对齐，为 **512 字节**；逻辑块号 × 512 即镜像内字节偏移。

```mermaid
graph LR
    CPU["内核访问 MMIO"] --> VQ["virtqueue"]
    VQ --> DEV["VirtIO 块设备"]
    DEV --> IMG["fs.img 扇区"]

    classDef hw fill:#e3f2fd,stroke:#1565c0;
    classDef fs fill:#fff3e0,stroke:#ef6c00;
    class CPU,VQ hw;
    class DEV,IMG fs;
```



`fs.img` 本身在**宿主机编译期**由 `kernel/build.rs` 打包生成；**运行时** guest 内核只能把它当作挂在 VirtIO 上的块设备来读写。这也是为何 Lab6 必须用带设备参数的 `make test-lab6`，而不是裸 `cargo run`。

读代码时可对照：`config` 里的 MMIO 基址、`mm::map_mmio_devices`，以及 `kernel/src/virtio_block.rs`。

### 2.2 在块之上：easy-fs 如何组织文件

有了按块读写的能力，还要把「一串 512 字节」组织成人类熟悉的文件。easy-fs（教学子集）沿用经典分层：


| 概念        | 大致职责                     |
| --------- | ------------------------ |
| **超级块**   | 块总数、inode 数量等全局元数据       |
| **inode** | 单个文件的大小、数据块索引、链接数等       |
| **目录项**   | 目录文件里的 `(名字 → inode 编号)` |
| **数据块**   | 文件内容本身                   |


于是打开一个已有文件，不再是查 `DEFAULT_FILES` 静态表，而更像：

```text
open("filea")
  → 找到根目录 inode
  → 在目录项里查到名字 filea
  → 得到文件 inode
  → 按 inode 记录的块号，经 VirtIO 读出数据
```

`os-fs` 里还有一套 host 可测的布局类型与 `MockBlockDevice`，方便你在不跑 QEMU 时先把「块 → 目录 → inode」想清楚。

### 2.3 可写文件与打开标志

有了真正的文件系统，`openat` 就不只是「查表返回只读切片」了。标志位可以表达：只读打开、只写、创建（`CREATE`）、截断（`TRUNC`）等。`file_test` 一类测例会先读预置的 `filea`，再以创建/截断方式写出 `fileb` 并读回校验——这正是 Lab5 静态表做不到的「运行时新建」。

对用户程序而言，接口仍是熟悉的 fd：`openat` 返回下标，`read` / `write` 继续查表。变的是表项背后从 `file_id + 内嵌切片`，换成了指向磁盘 inode 的打开对象（并继续维护 per-fd 的 `offset`）。

### 2.4 硬链接、fstat，以及 unlink 时的锁陷阱

真实文件系统里，**硬链接**允许多个目录项指向同一 inode：数据不必复制一份，只是多个名字共用同一套元数据与数据块。`linkat` 增加一个名字；`nlink` 记录还有多少个名字拴着这份内容。`fstat` 则让你通过已打开的 fd 读出 `ino`、`nlink`、`mode` 等——用来确认「两个路径是不是同一份东西」。

删除名字时（`unlinkat`）要格外小心锁的粒度。若在已经持有 easy-fs 全局自旋锁的路径上，再调用内部也会抢同一把锁的 `inode.clear()`，单线程也会**自死锁**（参考环境的 ch6 测例曾踩过）。本内核用 `FileIndex` 维护路径别名与 `nlink`：unlink 时优先更新索引与计数，避免在持锁临界区里二次加锁。细节可对照 `fs/disk.rs` 与 [lab6-answers.md](answers/lab6-answers.md)。

### 2.5 从盘上拉起程序：mmap / spawn / stride

Lab6 还带着几项与「盘上有文件」配套的能力（细节见接口文档）：


| 能力                | 直觉                          | 测例            |
| ----------------- | --------------------------- | ------------- |
| `mmap` / `munmap` | 在地址空间里映射 / 解除匿名页            | `mmap_test`   |
| `spawn`           | 从**磁盘路径**读 ELF，**新建**子进程    | `spawn_test`  |
| `set_priority`    | 调整 stride 调度优先级（`prio ≥ 2`） | `stride_test` |


`spawn` 与 `exec` 不要混：`exec` 替换**当前**进程的镜像；`spawn` 多出一个子进程，父进程继续跑。`initproc` 本身也改为从 `fs.img` 加载——开机第一条用户程序，已经走在「真磁盘」路径上了。

管道与 Lab5 的 fd 语义仍然在：`sys_read` / `sys_write` 会按 `FdType` 分发；管道端往往**没有**普通文件的 `OpenedFile` 槽位，不能误按「磁盘文件」去查。Lab6 联调时修过这类回归，读代码时值得停一下。

---

串起来：VirtIO 让内核碰到扇区，easy-fs 让扇区长成文件与目录，fd 继续当用户态的统一入口；链接与 `fstat` 则让你看见「名字」和「内容」可以分开谈。下一节把这条链在 QEMU 里跑通。

## 三、实验任务

> 建议先跑通全链，再按「块设备 → 磁盘读写 → link/fstat」顺序读代码。


| 文件                                           | 角色                        | 先想「如果是我会怎么设计」                           |
| -------------------------------------------- | ------------------------- | --------------------------------------- |
| `kernel/build.rs`                            | 打包 `fs.img`               | initproc 从哪来？和 Lab5 内嵌有何不同？             |
| `kernel/src/virtio_block.rs`                 | VirtIO 块读写                | MMIO 基址？逻辑块号如何落到扇区？                     |
| `kernel/src/fs/disk.rs`                      | 磁盘 FS、fd、`linkat`/`fstat` | `FileIndex` 如何记 nlink？unlink 为何不 clear？ |
| `kernel/src/mm.rs`                           | `mmap`、MMIO 映射            | 匿名页与 ELF 段有何不同？                         |
| `kernel/src/process.rs`                      | `spawn`、stride            | spawn 与 exec 谁创建进程？                     |
| `user/src/bin/lab6_usertest.rs`              | initproc 全链               | 测例顺序如何串联？                               |
| `user/src/bin/file_test.rs` / `link_test.rs` | 磁盘读写 / 硬链接                | —                                       |


> 完整解读见 `labs/answers/lab6-answers.md`。



### 任务一：跑通 lab6

```powershell
make test-lab6
```

**预期输出**（OpenSBI 日志可忽略）：

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

> 请勿使用不带 VirtIO 参数的 `cargo run -p kernel --features lab6`，否则无法访问 `fs.img`。



### 任务二：阅读理解与思考题

每道题建议**先合上代码想答案，再打开对照**；**参考答案见** `labs/answers/lab6-answers.md`。

1. `virtio_block.rs`：MMIO 基址在哪定义？`read_block` 如何把逻辑块号变成对 `fs.img` 的访问？为何 guest 内核不能直接打开宿主机上的 `fs.img` 文件路径？
2. `build.rs` 的 `pack_fs_image`：`initproc` 指向哪个 ELF？与 Lab5 内嵌 app 有何不同？运行时 `CREATE` 新文件在 Lab5 / Lab6 各如何实现？
3. `fs/disk.rs` 的 `FileIndex`：硬链接时 `nlink` 如何变化？`unlink` 为何不直接 `inode.clear()`？（对照自旋死锁）
4. `sys_read` / `sys_write`：管道 fd 与普通文件 fd 的分发路径有何不同？为何管道不能要求 `files[]` 槽位一定有 `OpenedFile`？
5. `spawn` 与 `execve`：各自从哪加载 ELF？分别创建还是替换进程？`mmap` 匿名页与 ELF 代码段在页表上有何异同？

> 能讲清「VirtIO → easy-fs → fd → link/fstat」，lab6 就过关了。



### 任务三：动手小修改

**修改 1**：在 `build.rs` 打包列表中增加一个预置文本文件，写用户程序读取并打印。

**修改 2**：用 `fstat` 打印 `filea` 的 `ino` 与 `nlink`，观察 `linkat` 前后变化。

**修改 3**（进阶）：对照 `reference-patches/ch6-exercise.patch`，找出一处与参考实现不同的设计取舍并写成短文。

### 提交清单（自查）

- [ ] `make test-lab6` 输出任务一列出的全部 `pass` / `OK!` 行，且 QEMU 正常退出
- [ ] 能说明 VirtIO → easy-fs → fd → link/fstat 这条主线
- [ ] 完成【任务二】5 道阅读理解题（对照答案自查）
- [ ] 能解释 `unlink` 为什么不能直接 `inode.clear()`、`spawn` 和 `exec` 的区别

## 四、验证


| 验证项         | 命令                                           | 通过标准             |
| ----------- | -------------------------------------------- | ---------------- |
| 主编译         | `cargo check -p kernel --features lab6`      | 无 error          |
| QEMU 全链     | `make test-lab6`                             | 见任务一预期输出         |
| fs.img      | `make check-fs-img`                          | 脚本输出 `fs.img OK` |
| host 单测（可选） | `cargo test -p os-fs --target <host-triple>` | 相关项通过            |




## 五、AI 提问模板

做实验时，建议用以下切入点和 AI 交互，引导自己思考而非直接要答案：

1. **概念澄清型**：「MMIO 和端口 I/O 有什么区别？为什么 RISC-V virt 上的 VirtIO 用 MMIO？」
2. **现象解释型**：「`linkat` 成功后两个路径的 `fstat.ino` 为什么相同？`unlink` 一个路径后另一个还能读吗？」
3. **代码追因型**：「`FileIndex` 里的 `hidden` 集合是干什么的？和 easy-fs 里真正的目录项删除有何不同？」
4. **对比深化型**：「Lab5 管道 fd 在 Lab6 磁盘 FS 下为什么要单独处理 `PipeRead`/`PipeWrite`？」
5. **动手探索型**：「若要把日志写到磁盘文件，需要扩展哪些 syscall 或标志位？」

