# EVOLVE 与经典 OS 教学路径对比

> 本文档将 **EVOLVE（os-lab）**、**[tg-rcore-tutorial](https://github.com/rcore-os/tg-rcore-tutorial)**、**xv6-riscv（MIT 6.S081）** 放在同一框架下对比。
>
> 对比对象：
>
> 1. **EVOLVE**：自研渐进式教学内核（Lab1–Lab8）+ 班级工作台 + 证据门控 AI；
> 2. **tg-rcore-tutorial**：经典 rCore 分章教程（本仓库对照树：`test` 分支，commit `d6330a6`）；
> 3. **xv6-riscv**：经典、最小但完整的 Unix-like 教学内核 + 6.S081 lab。

## 三方速览


| 维度     | EVOLVE                                      | tg-rcore-tutorial           | xv6-riscv                               |
| ------ | ------------------------------------------- | --------------------------- | --------------------------------------- |
| 定位     | 课程化入门：单内核渐进 + 教务工作台 + AI 协作                 | 经典分章教程：章内完整练习 + checker     | 经典深化：最小但完整的 Unix-like 内核 + 教材 lab       |
| 语言     | Rust（少量汇编）                                  | Rust（少量汇编）                  | C（少量汇编）                                 |
| 平台     | RISC-V 64 + QEMU `virt` + OpenSBI           | 同左                          | RISC-V 64 + QEMU `virt`（无 SBI，自管启动）     |
| 代码组织   | 单内核 + `lab1`–`lab8` feature                 | 多章节独立工程                     | 单一 C 源码树，无 feature gate                 |
| 规模（量级） | 约 9.1k 行 / 73 个源文件 + 8 个 `os-*` crate（实测统计） | 多章合计更大（早期采集约 3.6 万行量级）      | 内核约 6k–8k 行 C，加用户态约 10k+                |
| 实验组织   | 8 Lab，同一仓库递进                                | 多章；练习强度高、继承测例多              | 11 个 6.S081 lab（配置因校而异）                 |
| 验收     | QEMU 关键输出 / `make test-labN` + 40 host 单测   | `tg-rcore-tutorial-checker` | `make qemu` + `grade-lab-*` / usertests |
| 课堂形态   | Web 手册 + 隔离工作区 + 教师端 + AI 导师                | 本地 clone + 终端为主             | 教材 + 终端 lab；教务多自建                       |




## 一、代码组织与演进方式



### 1.1 三方对照总览


| 维度      | EVOLVE                                                                                         | tg-rcore-tutorial                                 | xv6-riscv                             |
| ------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| 演进方式    | 同一二进制上 `labN` feature 逐级打开；Lab6 打开后才链接 `easy-fs` / `virtio-drivers`                            | **换章节目录 / 换工程**                                   | 始终完整内核；靠 lab 指导与 git diff 感知增量        |
| 学生看到的增量 | 切 feature 重编译即可见：Lab4 起 `fork_test`，Lab5 起 `fs_test pass` / `pipe_test pass`，Lab6 起落盘版 fs_test | 新目录 + 新 checker 题面                                | lab 补丁改 `proc.c` / `vm.c` 等，diff 自行对照 |
| 模块边界    | 8 个 `os-*` crate，可独立 host 单测                                                                   | 机制在 15 个共享 crate，章节 crate 是集成层（path + version 引用） | 按 C 文件边界清晰，无独立包/单测                    |
| 工程切换成本  | 低（同一工作区，scaffold 按 lab 下发）                                                                     | 较高（`CHAPTER` / `cargo clean` 等约定）                 | 中（同一树，但 lab 间改动需自行对照）                 |




### 1.2 EVOLVE：单内核 + feature gate

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


组织特点：**演进写在依赖声明里**——上一级 feature 是下一级的前置，组件在哪个 Lab 进入主线一目了然。学生切换 feature 即可看到内核从裸机启动逐步演进到虚存、进程、文件系统、磁盘 FS、信号、线程同步。

### 1.3 tg-rcore-tutorial：分章独立工程 + 共享组件 crate

仓库为 23 个平铺的独立 crate（对照树 `test` 分支实测统计）：

```text
tg-rcore-tutorial/
├── tg-rcore-tutorial-ch1 … ch8     # 8 个章节 crate：每章一个完整内核工程
├── tg-rcore-tutorial-sbi / linker / console / kernel-context /
│   kernel-vm / kernel-alloc / syscall / task-manage / easy-fs /
│   signal / signal-defs / signal-impl / sync / user / checker   # 15 个共享组件 crate
└── Cargo.toml                       # meta crate（bundle 打包用，非 workspace）
```

- **章节 crate**：每章自带 Cargo.toml（含 version / repository / keywords 等 crates.io 发布元信息）、build.rs、src、test.sh、exercise.md（练习题面）与内嵌的 `tg-rcore-tutorial-user` 用户态子工程。以 ch6 为例，内核 src 仅 5 个文件（`fs.rs` / `main.rs` / `process.rs` / `processor.rs` / `virtio_block.rs`），机制主体在共享 crate 中，章节 crate 扮演集成层；用户态测试程序 73 个。
- **共享组件引用**：章节以 path + version 双声明引用组件，例如 ch3 的
`tg-sbi = { package = "tg-rcore-tutorial-sbi", path = "../tg-rcore-tutorial-sbi", version = "0.4.9", features = ["nobios"] }`
——组件按可独立发布 crates.io 的标准维护。
- **CHAPTER 编译期开关**：`user/src/bin/initproc.rs` 通过 `option_env!("CHAPTER")` 在**编译期**选择测试目标；切章测试须 `cargo clean` 后带环境变量重新编译，即由此而来。
- **章节内 feature**：如 ch3 定义 `coop` / `exercise` 两档，exercise 档启用练习测例。

组织特点：**演进写在目录边界里**——章节之间靠“换工程 + 共享组件升级”衔接，同一机制（如任务管理）随章节推进在共享 crate 中逐步增强，章节 crate 负责把当章练习集成进来。

### 1.4 xv6：单一成熟源码树

xv6 没有 feature gate，所有模块始终编译进内核：`start.c` / `entry.S` / `main.c` 负责启动，`trap.c` / `trampoline.S` 负责 trap，`vm.c` 负责虚存，`proc.c` 负责进程，`fs.c` / `bio.c` / `log.c` 负责文件系统，`virtio_disk.c` 负责磁盘驱动。学生完成 lab 时修改同一份代码，靠 lab 指导或 git diff 理解每章新增内容。

组织特点：**演进不体现在工程结构里**——增量靠 6.S081 lab 指导文档与版本对照呈现，换来的是代码始终代表一个完整、自洽的系统。

## 二、知识分布



### 2.1 Lab / 章 / xv6 概念映射


| EVOLVE | 主题要点                               | tg-rcore 对照                 | xv6 对照                                        |
| ------ | ---------------------------------- | --------------------------- | --------------------------------------------- |
| Lab1   | 裸机、SBI、链接脚本                        | 早期启动章                       | `start.c`、`entry.S`、`main.c`                  |
| Lab2   | trap、syscall、yield                 | ch3                         | `trap.c`、trampoline、`syscall.c`、调度入口          |
| Lab3   | Sv39、用户空间、U 位                      | ch4 基础                      | `vm.c`、pgtbl lab                              |
| Lab4   | PCB、fork/exec/wait                 | ch5 进程基础                    | `proc.c`、`sysproc.c`                          |
| Lab5   | fd、内嵌 FS、管道、自旋锁                    | 通向 ch6/ch7 的过渡              | `file.c`、`pipe.c`、`spinlock.c`                |
| Lab6   | 磁盘 FS、link/fstat、spawn、mmap、stride | ch6 + 继承的 spawn/mmap/stride | `fs.c`/`bio.c`/`log.c`/`virtio_disk.c`、相关 lab |
| Lab7   | 统一 fd、dup、信号                       | ch7                         | dup/重定向；信号多在 lab                              |
| Lab8   | 线程、阻塞同步、死锁                         | ch8                         | uthread / locks；`sleep`/`wakeup` 范式           |




### 2.2 机制对照：同一机制的三种形态


| 机制       | EVOLVE                                        | tg-rcore                    | xv6                                     |
| -------- | --------------------------------------------- | --------------------------- | --------------------------------------- |
| 启动       | Lab1：SBI“固件交权”显式教学                            | 早期章分散带过                     | 自管 M-mode → S-mode，路径最完整                |
| Trap     | Lab2 统一 `__alltraps`；用户页表含内核 trap 区恒等映射（教学简化） | ch3 章内完整实现                  | trampoline / trapframe 严格隔离，隔离本身即教学重点   |
| 虚存       | Lab3 Sv39 最小可用；mmap 推迟到 Lab6                  | ch4；exercise 附 mmap/munmap  | `vm.c` per-process 页表 + 内核切换，语义最严       |
| 进程       | Lab4 fork/exec/wait；协作式 `wait4`（yield 轮询）     | ch5；spawn/stride 在 exercise | 完整 fork/exec/wait + sleep/wakeup 语义     |
| 调度       | Lab6+ stride + `set_priority`                 | ch5 exercise                | 基础轮转；策略扩展在 lab                          |
| 文件系统     | 两步：Lab5 内嵌抽象 → Lab6 easy-fs + VirtIO 落盘       | ch6 一步到位磁盘 FS               | 五层 FS（bcache/log/inode/目录/设备）始终在场       |
| 信号 / IPC | Lab7 统一 fd + dup + 通用信号                       | ch7                         | kill 标记；通用信号在 lab                       |
| 线程同步     | Lab8 TCB + 阻塞原语 + 死锁检测（银行家 + 等待图）             | ch8 exercise 聚焦死锁           | `sleep`/`wakeup` 范式；uthread / locks lab |
| 系统调用     | 约 36 个，教学精简 ABI（`exec` 以 `a1` 传路径长度）          | 随章扩展，重可观测性（trace 等）         | 基础约 21 个，最接近 Unix 语义                    |


**三个重点机制的展开：**

**trap 与隔离——简化与严格的取舍。** EVOLVE 在用户页表中保留内核 trap 区的恒等映射，牺牲隔离严格性换取 Lab2 即可跑通用户态的平缓起点；xv6 的 trampoline 高地址映射 + trapframe 是教科书级严格隔离，但也是入门最陡的坎之一；tg-rcore 居中，随章节从简单走向完整。这不是对错问题，是“何时把隔离的完整代价摆到学生面前”的时机选择。

**文件系统——削峰哲学最集中的体现。** EVOLVE 拆成两步：Lab5 只建 fd / 内嵌只读文件 / 管道的抽象层（纯内存、无设备），Lab6 才引入 VirtIO 块设备与 easy-fs 磁盘语义，link/fstat/spawn/mmap 在落盘之后才出现；tg-rcore 在 ch6 一章内完成从块设备到 inode 的全部内容，exercise 强度高；xv6 的五层 FS 与 log 从第一天就在场，journal 一致性留给深化。同一终点，三种爬坡曲线。

**线程与同步——检测口径的对齐。** EVOLVE Lab8 的死锁检测同时实现银行家算法与互斥锁等待图，与 tg-rcore ch8 exercise 的 checker 口径直接对齐（本仓库参考练习的实测记录即以此验收）；xv6 不做死锁检测，其 `sleep`/`wakeup` 条件同步是工程范式的经典教学。两种取向分别代表“可判定的练习目标”与“真实系统的惯用法”。

**边界与衔接：** 网络、完整 COW、多核、FS journal 等深水区未进入 EVOLVE 入门主线——tg-rcore 社区路径可继续延伸，xv6 进阶 lab 可覆盖。衔接路径建议：**EVOLVE 建脉络 →（可选）tg-rcore 对读强化 → xv6 建高楼**，三者互补而非替代。

## 三、AI 时代的操作系统教学难题与应对

生成式 AI 工具普及后，操作系统实验课出现了四类新难题。经典路径（tg-rcore / xv6）并非存在设计缺陷——它们出现时，默认“学生自己读文档、在终端里调试”，AI 尚不在需要考虑的因素之内；今天这一前提发生了变化，课程设计若不做调整，难题会被进一步放大。EVOLVE 的思路是把应对办法做成平台自带的功能，而非要求教师自行拼装工具。

### 3.1 四类教学难题与三方应对


| 难题                    | tg-rcore 的表现                            | xv6 的表现                | EVOLVE 的应对                                                              |
| --------------------- | --------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| **过程不可见**（教师仅能看到最终结果） | 教师主要看到判题分数，难以区分“真正理解”与“AI 生成后略作修改”      | 主要看到评分脚本的结果；过程材料需自行建设  | 学生在独立工作区中实验；平台记录真实运行过程；实验报告与复盘留档，评分时可见代码的完整运行轨迹                         |
| **AI 代写绕过思考**         | 练习题可整段交给外部 AI 完成，教程无法干预                 | 作业补丁同样可由 AI 生成，系统无内建约束 | 内置 AI 助教：回答前先查看学生当前的代码、报错与运行记录，不直接给出完整答案；练习采用“补全代码”与“定位错误”两种形式，整段抄袭无法通过 |
| **反馈慢与两极分化**          | 首周耗在环境搭建；基础较弱者卡在编译与运行环节，基础较好者借助 AI 快速完成 | C 语言、完整内核加运行期调试，入门门槛更高 | 统一学习平台，免除本地环境搭建；40 项单元测试快速给出结果；教师可分阶段控制开放内容                             |
| **评价难公平**（分数相同、理解不同）  | 相同分数下理解深度差异显著，且缺少可复查的材料                 | 问题同样存在；教材深入，但不解决过程评价   | 报告采用统一模板；复盘环节通过追问考察“为什么”；AI 回答以课程资料为依据；教师逐份复核并留存记录                      |


四类难题存在一个共同点：**均发生在教学系统之外**——学习过程记录、环境搭建、反馈渠道与评价依据，本不在 tg-rcore / xv6 这类教学内核的职责范围内，课程需要时须自行建设；EVOLVE 将这些纳入了平台。

### 3.2 学生自用 AI 与 EVOLVE 自带 AI 的差别


| 对比项    | EVOLVE                             | tg-rcore / xv6            |
| ------ | ---------------------------------- | ------------------------- |
| AI 的角色 | 平台内建 AI 助教与自动评分，回答前先核对学生的实际代码与运行记录 | 学生自行选择 AI 工具，课程无法约束       |
| 任务形式   | 教师可下发“补全代码”“定位错误”类题目，并可随机变换        | 以完整的编程练习题为主               |
| 教学管理   | 班级、学生账号、内容开放节奏、公告、课程资料、报告批改集成于一个平台 | 班级管理与过程记录需要课程自行搭建         |
| 文档策略   | 实验文档以问题引导，答案与正文分离，附 AI 提问示范        | 教程步骤清晰，但“防止 AI 代写”并非其设计目标 |


经典路径中，AI 是学生自行引入的外部变量，课程无法约束其使用方式；EVOLVE 中，AI 是平台的组成部分——回答前先核对学生的实际情况，教师可控制其能力范围与开放程度。

## 四、结论：EVOLVE 与两条经典路径的对比定位



### 4.1 三维度对照


| 维度       | 一句话                                                                                   |
| -------- | ------------------------------------------------------------------------------------- |
| 代码组织与演进  | EVOLVE 用单内核 feature + 组件 crate 服务“可见演进与可测单元”；tg-rcore 用分章工程服务标准化练习；xv6 用完整源码树服务成熟工程范式 |
| 知识分布与映射  | EVOLVE 削峰铺轨（先抽象后落盘、先主线后隔离）；tg-rcore 章内做透；xv6 适合概念后的广覆盖深化                              |
| AI 时代的课堂 | 经典路径强在内容与判题；EVOLVE 强在过程可见、AI 回答前先核对证据、任务形式多样、班级开放节奏可控——针对代写与“只见分数不见理解”问题              |




### 4.2 EVOLVE 相对经典路径的三个独有增量

1. **演进方式：把“系统怎么长出来”写进工程结构。** EVOLVE 在同一工作区内用一条命令切换阶段，feature 链即演进史，学生每次升级都能直接看到新增能力的运行效果；tg-rcore 依靠换章节工程与 `CHAPTER` 编译期开关衔接（切章须 `cargo clean` 重编），xv6 始终编译完整内核、增量依赖 lab 指导与版本对照。三者中，只有 EVOLVE 让“演进本身”成为可操作、可观察的学习对象。
2. **知识节奏：为入门特意削峰。** EVOLVE 把文件系统拆成“抽象（Lab5）→ 落盘（Lab6）”两步、将 mmap 移出虚存章，并以可观察证据呈现阶段差异（yield 从 1 轮到 5 轮）；tg-rcore 在一章内一次做透（如 ch6 集中 33 项练习），强度高、峰值陡；xv6 的完整系统从第一天就在场，适合概念建立后的深化。EVOLVE 承担的是两条经典路径都不占的位置：**为初学者建立脉络**。
3. **课堂形态：把 AI 与教学管理纳入系统边界。** 经典路径中，AI 是学生自行引入的外部变量，过程记录与班级管理需要课程另行搭建；EVOLVE 中，AI 助教回答前先核对学生的实际代码与运行记录，练习可采用“补全”“定位错误”等形式并随机变换，教师可分阶段控制开放内容，过程材料直接参与评分。这针对的是经典路径未曾面对的问题：代写与“只见分数不见理解”。

### 4.3 定位与互补

两条经典路径的价值不可替代：tg-rcore 的标准化题面与判题为高强度机制训练提供对照基准；xv6 的教材深度与工程完整性是深化阶段的最佳选择。EVOLVE 不试图取代二者——其课堂层能力（学习平台、AI 助教、自动评分）仍在持续演进中，成熟度尚不及经典路径，这是当前的诚实定位。