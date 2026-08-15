# EVOLVE 与 xv6-riscv 详细对比

> 本文档为 EVOLVE 与 xv6 的独立双方案对比文档。
>
> 对比对象：
>
> 1. 当前自研系统 **EVOLVE（os-lab）**，对应 Lab1–Lab8 已合入的完整版本；
> 2. 本校教学使用的 **xv6-riscv（MIT 6.S081 配套内核）**。
>
> 数据口径：EVOLVE 数据为对仓库源码的实测，统计 `kernel/`、`os-*/`、`user/` 下的 `.rs` 与 `.asm`，排除 `scaffold/` 实验变体、`target/` 和 `node_modules/`；xv6 数据基于 MIT 6.S081 公开课程与 xv6-riscv 公开仓库整理。

## 一、总体速览


| 维度     | EVOLVE（os-lab）                                             | xv6-riscv                              |
| ------ | ---------------------------------------------------------- | -------------------------------------- |
| 定位     | 面向初学者的渐进式教学实验环境                                            | 经典、最小但完整的教学内核                          |
| 编程语言   | Rust（少量 RISC-V 汇编）                                         | C（少量 RISC-V 汇编）                        |
| 目标平台   | RISC-V 64 + QEMU `virt`                                    | RISC-V 64 + QEMU `virt`                |
| 架构     | 单内核二进制 + Cargo feature 逐级演进                                | 单一 C 源码树，无 feature gate                |
| 组件化    | 10 个 workspace 包（kernel + user + 8 个 `os-*` 库 crate），2 层依赖 | 无 crate，按 C 文件组织                       |
| 核心源码规模 | 约 9978 行 / 72 个 `.rs`+`.asm` 文件                            | 内核约 6000–8000 行 C，加用户态程序约 10000+ 行【估算】 |
| 实验数    | 8 个（Lab1–Lab8）                                             | 11 个（MIT 6.S081 标准配置）                  |
| 系统调用   | 36 个（含 Lab8 线程与同步扩展）                                       | 基础约 21 个，随 lab 增加                      |
| 单元测试   | 42 项 host 单元测试                                             | 无内置单元测试，靠 `grade-lab-*` 脚本             |
| 文档     | 中文问题驱动文档 + AI 提问模板 + 参考答案                                  | xv6-book 英文经典教材 + 英文 lab 指导            |




## 二、教学定位与差异化设计

EVOLVE 的出发点是降低 OS 入门门槛：学生面对的不是一个功能完整、代码量大的内核，而是一个通过 `lab1` 到 `lab8` feature 逐步“长出”功能的内核。每一层只在前一层基础上增加一个核心机制，学生始终在同一个代码库、同一个入口里学习。

xv6 的出发点是“最小但完整”：用约 6000–8000 行 C 实现一个真实可运行的 Unix-like 内核，覆盖进程、虚存、文件系统、设备驱动、网络等主题。它更适合作为系统性深化教材，而不是第一步入门。

EVOLVE 相对 xv6 的主要差异化设计：


| 差异化点         | 说明                                                            |
| ------------ | ------------------------------------------------------------- |
| 渐进式单内核       | xv6 是完整源码树，EVOLVE 用 feature gate 让学生看到内核从裸机到线程同步的每一步演进        |
| Rust 内存安全    | 编译器大部分内存错误在编译期暴露，学生可以把精力放在机制上，不被 C 的指针问题拖住                    |
| 组件化与内嵌测试     | 8 个职责聚焦的 `os-*` crate 配 host 单测，页表位运算、帧分配、文件边界、信号集合、同步原语可独立验证 |
| 问题驱动 + AI 协作 | “先想再对照”文档、答案分离与 AI 提问模板是 xv6 本身没有的教学流程                        |


两者的关系是互补的：**EVOLVE 负责建立脉络，xv6 负责深化实现**。EVOLVE 不打算替代 xv6，xv6 也不具备 EVOLVE 的渐进式引导和 AI 协作教学设计。

## 三、总体架构与演进方式



### 3.1 EVOLVE：单内核 + feature gate

`kernel/Cargo.toml` 定义严格递进的 feature：

```toml
lab1 = ["dep:os-sbi"]
lab2 = ["lab1", "dep:os-context", "dep:os-syscall"]
lab3 = ["lab2", "dep:os-alloc", "dep:os-vm"]
lab4 = ["lab3"]
lab5 = ["lab4", "dep:os-fs"]
lab6 = ["lab5", "dep:easy-fs", "dep:virtio-drivers", "dep:spin"]
lab7 = ["lab6", "dep:os-signal"]
lab8 = ["lab7", "dep:os-sync"]
```

内核主体由模块按 feature 编译，组件 crate 职责如下：


| crate        | 引入时机 | 职责                             |
| ------------ | ---- | ------------------------------ |
| `os-sbi`     | lab1 | SBI console / shutdown 封装      |
| `os-context` | lab2 | `TrapContext` 与 trap 汇编        |
| `os-syscall` | lab2 | 系统调用编号与共享结构                    |
| `os-alloc`   | lab3 | 物理帧分配与内核堆                      |
| `os-vm`      | lab3 | Sv39 页表、地址空间、ELF 映射            |
| `os-fs`      | lab5 | 内嵌文件、磁盘 inode 语义、fd 规则         |
| `os-signal`  | lab7 | 信号集、动作、屏蔽字                     |
| `os-sync`    | lab8 | 阻塞 mutex / semaphore / condvar |


学生切换 feature 即可看到内核从裸机启动逐步演进到虚存、进程、文件系统、磁盘 FS、信号、线程同步。

### 3.2 xv6：单一成熟源码树

xv6 没有 feature gate，所有模块始终编译进内核：`start.c` / `entry.S` / `main.c` 负责启动，`trap.c` / `trampoline.S` 负责 trap，`vm.c` 负责虚存，`proc.c` 负责进程，`fs.c` / `bio.c` / `log.c` 负责文件系统，`virtio_disk.c` 负责磁盘驱动。学生完成 lab 时修改同一份代码，靠 lab 指导或 git diff 理解每章新增内容。

### 3.3 差异总结


| 维度     | EVOLVE               | xv6           |
| ------ | -------------------- | ------------- |
| 每章代码变化 | 显式 feature 开关，改动边界清晰 | 改同一源码树，需自行对比  |
| 全局观    | 容易看到“内核怎么长出来”        | 一开始就要面对完整系统   |
| 模块边界   | crate 边界明确，可单独单测     | 文件边界清晰，但无独立包  |
| 成熟度    | 渐进式教学范围，持续演进         | 成熟、覆盖广、工程实现完整 |




## 四、启动与底层环境


| 维度     | EVOLVE                                               | xv6                                                           |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------- |
| 固件     | OpenSBI（QEMU `-bios default`）                        | 无 SBI，QEMU 直接加载内核                                             |
| 内核加载地址 | `0x80200000`                                         | `0x80000000`                                                  |
| 入口     | `entry.asm` 的 `_start` 设置 sp，跳转 `rust_main`          | `entry.S` 设置栈，`start.c` 配置 M-mode 后 sret 进入 S-mode            |
| 控制台    | SBI `console_putchar`                                | 16550 UART 直接 MMIO                                            |
| 关机     | SBI shutdown                                         | QEMU 退出或系统调用控制                                                |
| 初始化    | `clear_bss`、`mm::init`、`trap::init`、`fs::init`、进程初始化 | `main.c` 初始化 UART、PLIC、kalloc、kvminit、proc、fs、console、timer 等 |


差异重点：

- EVOLVE 依赖 OpenSBI，教学上正好让学生理解“固件如何把控制权交给内核”；
- xv6 自己实现 M-mode 启动逻辑，能让学生看到更底层、更完整的启动路径；
- 两者的最终状态都是运行在 RISC-V S-mode 的内核。



## 五、Trap 与中断

EVOLVE 使用统一的 `__alltraps` 入口：

1. 进入 trap 时先用 `csrrw sp, sscratch, sp` 交换用户栈与内核栈；
2. 保存通用寄存器、`sepc`、`sstatus` 等到 `TrapContext`；
3. `trap_handler` 根据 `scause` 分发系统调用、定时器中断或其他异常；
4. 返回用户态前切换回用户 `satp`。

系统调用通过 `ecall` 进入，用户态用 `a7` 传编号、`a0-a2` 传参数。定时器以 `TICKS_PER_SEC=100` 触发抢占。

教学取舍：用户页表包含内核 trap 区的恒等映射（`map_kernel_trap_regions_user`），先把“进入内核、保存现场、返回用户态”的主线讲透；高地址 `TRAMPOLINE` / `TRAPFRAME` 严格隔离放在 xv6 阶段深化。

xv6 的 trap 采用完整分层设计：用户态 trap 从映射在高地址的 `uservec`（trampoline）进入，把寄存器保存到每个进程独立的 `TRAPFRAME`，切换 `satp` 后跳转 `kernelvec`；`usertrap` 与 `kerneltrap` 分开处理，UART、磁盘等中断经 PLIC 分发。


| 维度         | EVOLVE                   | xv6                              |
| ---------- | ------------------------ | -------------------------------- |
| trap 入口    | 单一 `__alltraps`          | `uservec` / `kernelvec` 分离       |
| 用户态上下文保存位置 | 内核栈上的 `TrapContext`      | 高地址 `TRAPFRAME`                  |
| 隔离方式       | 用户页表含内核 trap 区恒等映射（教学实现） | 用户页表只映射 trampoline + trapframe   |
| 设备中断       | 定时器为主，VirtIO 用于磁盘        | UART / PLIC / VirtIO / 网络等完整中断体系 |
| 教学重点       | 先理解“进入内核、保存现场、返回用户态”这条主线 | 理解真实内核的完整 trap 分层                |




## 六、内存管理与虚存


| 维度     | EVOLVE                               | xv6                                                            |
| ------ | ------------------------------------ | -------------------------------------------------------------- |
| 页表结构   | Sv39 三级页表                            | Sv39 三级页表                                                      |
| 物理内存管理 | `os-alloc` 栈式页帧分配器 + Bump 堆分配器       | `kalloc.c` 空闲链表页分配器                                            |
| 内核映射   | 内核区间恒等映射（低地址直映），动态为已分配帧补映射           | 内核页表直接映射 `KERNBASE..PHYSTOP`，另映射 UART/CLINT/PLIC/VirtIO/kstack |
| 用户地址空间 | 每个进程独立 `MemorySet`，ELF PT_LOAD + 用户栈 | 每个进程独立页表，`uvmalloc` 管理堆增长                                      |
| fork   | 深拷贝用户页（完整复制）                         | 基础版深拷贝；lab 中可扩展 COW                                            |
| exec   | 重建地址空间，替换 ELF 映射                     | `exec.c` 解析 ELF 并重建页表                                          |
| 堆扩展    | 固定地址空间区域                             | `sbrk` 系统调用增长堆                                                 |
| mmap   | Lab6 支持匿名 `mmap` / `munmap`（页对齐、权限位） | 基础内核用 `sbrk`；6.S081 lab 补充文件映射 mmap                            |
| 隔离强度   | 用户页表含内核 trap 区映射（教学实现）               | trampoline/trapframe 之外用户态无法看到内核映射                             |


差异重点：

- EVOLVE 把“帧分配、页表索引、PTE 权限、ELF 段映射”拆成独立 crate 并配 host 单测，非常适合逐步学习；
- xv6 的 `vm.c` 覆盖 `copyin` / `copyout`、kstack 映射与 trampoline 隔离等完整路径；
- EVOLVE 的 fork 是全量深拷贝，xv6 基础版同样是深拷贝，但 6.S081 的 COW lab 会引导学生实现按需复制。



## 七、进程模型与调度


| 维度    | EVOLVE                                                 | xv6                                                                |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| 进程控制块 | `ProcessControlBlock`：pid、父子关系、子进程槽、exit_code、状态       | `struct proc`：state、parent、kstack、trapframe、context、sz、pagetable 等 |
| 进程表   | 静态 `MAX_PROCESS_NUM = 16`                              | 静态 `NPROC = 64`                                                    |
| 状态    | `UnInit / Ready / Running / Zombie`                    | `UNUSED / USED / SLEEPING / RUNNABLE / RUNNING / ZOMBIE`           |
| 调度器   | lab2/3 批处理任务；lab4+ 轮转；lab6+ stride（`set_priority`）     | 扫描 RUNNABLE 的轮转调度 + `sleep` / `wakeup` 阻塞                          |
| 抢占    | 定时器中断 + `yield`                                        | 定时器中断触发 `yield`                                                    |
| wait  | `wait4` 通过回退 `sepc`、重新入队实现协作式等待                        | `wait` 使用 `sleep` / `wakeup` 阻塞等待                                  |
| fork  | `SYS_CLONE` 教学 fork（无 flags），深拷贝地址空间                   | 完整 `fork`，深拷贝地址空间（lab 可改 COW）                                      |
| exec  | 从内嵌 ELF 或磁盘 FS 加载，`a1` 传路径长度（非 argv）                   | 完整 `exec`，解析 argv/envp                                             |
| kill  | lab7 提供通用信号                                            | 基础 `kill` 只设置 killed 标记                                            |
| 线程    | lab8 提供 TCB、线程栈、`thread_create` / `gettid` / `waittid` | 基础内核无线程；lab 中实现用户态线程库                                              |


差异重点：

- EVOLVE 的 wait4 采用协作式等待与重新入队，先展示“等不到就主动让出”的直观模型；xv6 的 `sleep` / `wakeup` 是另一条经典内核实现路径；
- EVOLVE 的 stride 调度把“优先级如何影响运行机会”做成可见实验；xv6 基础调度更简单，但配合 lab 可扩展 stride/CFS 等策略；
- EVOLVE 把线程与同步原语直接做成系统调用，xv6 则更强调内核的 `sleep` / `wakeup` 与 lab 中的用户态线程。



## 八、系统调用接口

EVOLVE 共定义 36 个系统调用（按 Lab 递增）：


| 阶段   | 系统调用                                                                                   |
| ---- | -------------------------------------------------------------------------------------- |
| Lab2 | `write`、`exit`、`yield`                                                                 |
| Lab4 | `getpid`、`clone`（教学 fork）、`execve`、`wait4`                                             |
| Lab5 | `openat`、`close`、`read`、`pipe`                                                         |
| Lab6 | `linkat`、`unlinkat`、`fstat`、`set_priority`、`mmap`、`munmap`、`spawn`                     |
| Lab7 | `dup`、`kill`、`sigaction`、`sigprocmask`、`sigreturn`                                     |
| Lab8 | `thread_create`、`gettid`、`waittid`、mutex/semaphore/condvar 系列、`enable_deadlock_detect` |


教学 ABI 特点：

- `execve` 用 `a1` 传路径字节长度，而不是 argv 向量；
- `fork` 直接复用 `clone` 编号但简化掉 flags；
- `wait4` 只传 pid 与退出码指针；
- `openat` 用路径指针 + 路径长度；
- 同步 syscall 在资源不可用时返回 `-1`，用户态重试，死锁检测返回 `-0xDEAD`。

xv6 基础 syscall 约 21 个，更接近真实 Unix 语义：`fork`、`exit`、`wait`、`pipe`、`read`、`kill`、`exec`、`fstat`、`chdir`、`dup`、`getpid`、`sbrk`、`sleep`、`uptime`、`open`、`write`、`mknod`、`unlink`、`link`、`mkdir`、`close`；6.S081 lab 还会加入 `trace`、`sysinfo` 等。

差异重点：

- EVOLVE 的接口以教学为目标进行精简，降低理解 ABI 的成本；xv6 更接近真实 Unix 语义，适合在理解概念后深入；
- 两者都使用 RISC-V `ecall` 进入内核，都是很好的 ABI 教学素材。



## 九、文件系统与存储


| 维度    | EVOLVE                                                             | xv6                                                            |
| ----- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Lab5  | 内嵌只读文件表 `EmbeddedFs`，无块设备                                          | -                                                              |
| Lab6  | VirtIO 块设备 + easy-fs 磁盘文件系统                                        | VirtIO 磁盘 + 自有 FS 栈                                            |
| FS 分层 | fd 表 + easy-fs inode/数据块层；块缓存/日志语义在 xv6 阶段学习                       | fd 表 + OFTABLE + icache + bcache + log + inode + 目录层           |
| 硬链接   | `FileIndex` 维护内存别名（教学聚焦硬链接语义）                                      | 磁盘目录项 + inode `nlink`，持久化                                      |
| 崩溃一致性 | easy-fs 提供块设备读写；journal 层语义在 xv6 阶段学习                              | 自带 log 层（journal）保证事务性                                         |
| 文件操作  | open/read/write/close、O_CREATE/O_TRUNC、linkat/unlinkat、fstat、spawn | open/read/write/close、mkdir、mknod、link/unlink、fstat、chdir、目录遍历 |
| 设备文件  | 控制台经 fd 1 输出                                                       | `mknod` 支持字符/块设备                                               |
| 控制台文件 | fd 1 特殊处理为 SBI 输出                                                  | console 作为设备文件接入 fd                                            |


差异重点：

- EVOLVE Lab5 的内嵌 FS 让学生先理解“文件抽象”而不被磁盘细节干扰；
- Lab6 接入真实 VirtIO + easy-fs 后，学生能接触磁盘镜像、inode 读写、硬链接与 fstat，FS 分层语义在 xv6 阶段继续深化；
- xv6 的 FS 是完整的五层教学实现，特别是 bcache、log、inode、目录、设备文件分层，是深入学习文件系统的标准教材路径。



## 十、IPC、信号与同步


| 维度   | EVOLVE                                                                                    | xv6                                                   |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 管道   | 环形缓冲区 256 字节 + 自旋锁 + 引用计数；读空返回 -1（非阻塞），用户态重试                                              | `pipe.c` 有界缓冲 + `sleep` / `wakeup` 阻塞语义，写端全关后读端返回 EOF |
| 信号   | lab7：`kill` / `sigaction` / `sigprocmask` / `sigreturn`，SIGKILL 不可屏蔽，默认 SIGKILL/SIGINT 终止 | 基础 `kill` 只设 killed 标记；通用信号通过 6.S081 lab（如 alarm）补充   |
| 自旋锁  | lab5 `SpinMutex`（CAS）                                                                     | `spinlock.c` 完整自旋锁 + 关中断                              |
| 阻塞同步 | lab8 阻塞 mutex / semaphore / condvar，FIFO 等待队列                                             | 内核用 `sleep` / `wakeup` + channel；lab 实现用户态同步          |
| 死锁检测 | lab8 `DeadlockState`：银行家算法 + mutex 等待图，返回 `-0xDEAD`                                       | 无内置死锁检测，lab 中通过分析或扩展实现                                |


差异重点：

- EVOLVE 把教材里的同步原语直接做成可见的 syscall 与用户测例，学生可以动手观察阻塞、唤醒、条件变量和死锁；
- xv6 基础内核更强调“一个内核里的 `sleep` / `wakeup` 是怎么写的”，同步问题主要通过 lab 和课堂讨论展开；
- 两者在并发教学上正好互补：EVOLVE 提供显式实验，xv6 提供内核级实现范式。



## 十一、测试与质量保障


| 维度        | EVOLVE                                                                                                                                                                                                                                               | xv6                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| host 单元测试 | 42 项，覆盖 os-context / os-syscall / os-sbi / os-alloc / os-vm / os-fs / os-signal / os-sync                                                                                                                                                            | 无                       |
| QEMU 集成   | Lab1–Lab8 均有关键输出验收，Lab6–8 用 `make test-labN`                                                                                                                                                                                                         | `make qemu` + 用户测例      |
| 自动评分      | `make test-labN`、`cargo test`、clippy `-D warnings`                                                                                                                                                                                                   | `grade-lab-*` 脚本        |
| 用户态测例     | Rust 编写的 `hello` / `power` / `yield` / `fork_test` / `exec_test` / `fs_test` / `pipe_test` / `file_test` / `mmap_test` / `spawn_test` / `stride_test` / `dup_test` / `signal_test` / `threads_test` / `mutex_test` / `condvar_test` / `deadlock_*` 等 | C 编写的 `usertests` 及课程测例 |
| 调试辅助      | Rust 编译错误、host 单测、关键输出断言、教学工作台 Trace                                                                                                                                                                                                                 | gdb、QEMU 日志、printf 调试   |


差异重点：

- EVOLVE 的 42 项 host 单测把页表位运算、帧分配、文件读取边界、信号集合、同步原语等纯逻辑放到编译器旁验证，反馈快；
- xv6 主要靠运行期 `usertests` 与评分脚本覆盖运行环境下的边界问题；
- 两者的验证路径都覆盖“编译 + 运行 + 断言”，但 EVOLVE 的测试更内嵌、更面向入门。



## 十二、文档与教学支撑


| 维度   | EVOLVE                                      | xv6                                   |
| ---- | ------------------------------------------- | ------------------------------------- |
| 语言   | 中文                                          | 英文（xv6-book、lab 指导）                   |
| 引导方式 | 问题驱动：先想、再看代码、再对照答案                          | 经典教材 + 步骤式任务                          |
| 配套材料 | 8 篇 lab 指导、8 套参考答案、习题、Web 学习手册、AI 提问模板、实验总览 | xv6-book 章节、lecture notes、11 个 lab 指导 |
| 教学创新 | AI 协作流程、feature 演进可视化、host 单测内嵌             | 教材地位高，工程实现规范，社区生态成熟                   |
| 可控性  | 每个 lab 都有明确验收命令与关键输出                        | 每个 lab 有明确目标与 grade 脚本                |


差异重点：

- EVOLVE 的“问题驱动 + 答案分离 + AI 提问模板”是相对 xv6 的明显差异化设计；
- xv6-book 的讲解深度与工程完整性适合深化阶段阅读，与 EVOLVE 的入门引导互补；
- 建议教学路径：EVOLVE 入门建立脉络，xv6 深化补全工程细节。



## 十三、学习效率评估

> 基于教学设计原理与两套环境的对比推断。


| 效率维度 | EVOLVE 表现                            | 相对 xv6 的优势                 |
| ---- | ------------------------------------ | -------------------------- |
| 认知负担 | 低（9978 行、8 组件 crate、单代码库、feature 演进） | xv6 一开始就要面对完整源码树，lab 间相对独立 |
| 反馈速度 | 快（42 项 host 单测 + Rust 编译器即时纠错）       | xv6 依赖运行期调试，反馈链路更长         |
| 动机维持 | 强（问题驱动 + 每步可见进展 + feature 渐进）        | “长出功能”的成就感更直接              |
| 知识留存 | 高（先想再对照 + 任务二巩固）                     | 主动思考比被动接受步骤清单留存高           |


预期学习成果：完成 EVOLVE 全部 8 个 Lab 后，学生应能在概念上理解 OS 的虚拟化（进程/虚存）、并发（锁/管道）、持久化（文件）三大主题及其联系；在实践上掌握 RISC-V 裸机编程、trap 机制、Sv39 页表、fork/exec/wait、文件系统与并发同步的实现；在方法论上学会“先想再对照”的工程思维与 AI 协作能力。

建议学习路径：

1. 用 EVOLVE 入门（8 个 Lab）：建立对 OS 核心机制的直观理解和全局脉络。
2. 用本校 xv6 深化（11 个 lab）：在已有概念基础上深入工程实现，覆盖网络、mmap 等进阶主题。

理由：EVOLVE 的“渐进式 + 问题驱动”适合打地基，xv6 的“广覆盖 + 工程化”适合建高楼。两者互补，避免初学者一上来就被 xv6 的 C 语言 + 庞大代码量劝退。

## 十四、覆盖范围与学习路径衔接

EVOLVE 的 8 个 Lab 聚焦 OS 核心机制：裸机启动、trap、Sv39 虚存、进程、fd/内嵌 FS、VirtIO 磁盘 FS、信号、线程与同步，并覆盖磁盘 inode、匿名 mmap、硬链接、stride 调度、阻塞同步与死锁检测等进阶语义。每个机制都配有 feature 开关、host 单测与 QEMU 验收，形成完整教学闭环。

网络、完整文件映射/COW、多核调度等主题，由 EVOLVE 之后的 xv6 深化阶段承接，两者构成“入门建立脉络 + 深化完整实现”的连续学习路径：

- EVOLVE 阶段：先建立每个核心机制的最小可运行直觉，并验证“为什么这样设计”；
- xv6 阶段：在同一 RISC-V 平台上补全工程细节与进阶主题。

## 十五、逐 Lab 与 xv6 概念对照


| EVOLVE Lab | 主题                                               | xv6-riscv 对应部分                                     |
| ---------- | ------------------------------------------------ | -------------------------------------------------- |
| Lab1       | 裸机启动、SBI、链接脚本                                    | `start.c`、`entry.S`、`main.c`、内核链接脚本                |
| Lab2       | trap、系统调用、多任务、时间片                                | `trampoline.S`、`trap.c`、`syscall.c`、`proc.c` 调度    |
| Lab3       | Sv39 页表、地址空间、ELF 加载                              | `vm.c`、pgtbl lab                                   |
| Lab4       | PCB、fork/exec/wait                               | `proc.c`、`sysproc.c`、COW lab 概念基础                  |
| Lab5       | fd 表、内嵌 FS、管道、自旋锁                                | `file.c`、`pipe.c`、`spinlock.c`                     |
| Lab6       | VirtIO 磁盘 FS、link/unlink/fstat、spawn、mmap、stride | `fs.c`、`bio.c`、`log.c`、`virtio_disk.c`、fs/mmap lab |
| Lab7       | 统一 fd、dup、信号                                     | `sysfile.c` 的 dup/重定向；通用信号在 lab 中补充                |
| Lab8       | 线程、阻塞同步、死锁检测                                     | uthread lab、locks lab、`sleep`/`wakeup` 模型          |




## 十六、结论

EVOLVE 与 xv6 是互补关系，不是替代关系：

- EVOLVE 用 Rust 内存安全、单内核 feature gate、问题驱动文档和 AI 协作模板，把 OS 入门门槛降低；
- xv6 用成熟完整的内核实现、经典教材和 11 个进阶 lab，把学生带到更深的工程与系统理解。

