---
sidebar: false
---

# 入门指南

欢迎来到 **os-lab**。

本套系统对应的课程教材是 **[《操作系统导论》](/downloads/ostep-zh.pdf)**（*Operating Systems: Three Easy Pieces*，*OSTEP*）。

教材从三大方面组织整门课：**虚拟化（Virtualization）、并发（Concurrency）、持久性（Persistence）**。当然，学习操作系统只读懂书中理论还不够——更重要的是在理解理论知识的基础上把这些抽象投入实践，亲身体验和实现「从裸机到可用内核」这条路。本系统会按逻辑顺序，通过 Lab 带你搭起属于自己的操作系统；完成全部实验后，你将会获得对于操作系统知识更深刻的理解，和一份完整能在 QEMU 上运行的个性化内核。

## 一、os-lab 是什么(最最后再总结一下，强调引导式学习和AI导师，支持教师课程教学辅助使用和学生自学使用)

os-lab 是一套面向操作系统课程的教学实验环境，技术栈包括：

- **语言**：Rust
- **目标平台**：RISC-V 64（`riscv64gc-unknown-none-elf`）
- **运行方式**：在本机用 QEMU 模拟一台 RISC-V 机器，跑你自己的内核

《操作系统导论》里，程序之所以能「以为」自己独占 CPU、拥有一整片地址空间、还能读写文件，是因为操作系统提供了这些**抽象**。实验里你要做的，就是亲手把这些抽象逐步实现出来——而不是只在应用层调用它们。

os-lab 的核心设计是：**始终只有一个内核代码库**。通过 Cargo 的 feature按阶段打开功能，让内核像搭积木一样逐步“长出”能力。你不用在好多套互不相关的内核工程之间来回切换，更容易看清操作系统是怎样一层层长起来的。

## 二、你将完成什么

整条学习路径共 **8 个 Lab**，按系统构建逐层推进：

| Lab | 主题 | 对应教材主题（OSTEP） | 你将学到什么 |
|-----|------|----------------------|----------------------|
| Lab1 | 裸机启动与最小内核 | 导论基础：在「抽象」出现之前，机器如何跑起来 | 没有操作系统时，代码如何上电、如何输出、如何正常关机 |
| Lab2 | 中断处理与多任务 | **虚拟化（CPU）**：受限直接执行、陷入、上下文切换、调度入门 | 用户程序如何通过系统调用「请求」内核；多个任务如何轮流使用 CPU |
| Lab3 | 内存管理与虚存 | **虚拟化（内存）**：地址空间、分页与地址翻译 | 页帧、页表、地址空间：程序如何安全地使用「自己的那片内存」 |
| Lab4 | 进程管理 | **虚拟化（CPU）**：进程抽象与进程 API | `fork` / `exec` / `wait`：进程如何创建、替换与等待 |
| Lab5 | 文件系统与并发 | **持久性** + **并发**：文件与 I/O；锁与进程间通信 | 文件描述符与简单文件抽象、管道，以及内核中的自旋锁 |
| Lab6 | 磁盘文件系统 | **持久性**：文件系统实现、inode 与目录 | VirtIO 块设备、easy-fs 磁盘布局、硬链接与 `fstat`——文件真正落到「断电不丢」的磁盘上 |
| Lab7 | IPC 与信号 | **虚拟化（CPU）** 进阶：进程间通信与异步事件 | 统一 fd 抽象、`dup` 重定向、信号的注册/投递/屏蔽 |
| Lab8 | 线程与同步 | **并发**：线程、锁、条件变量与死锁 | 进程内多线程、阻塞式互斥锁/信号量/条件变量、银行家式死锁检测 |

## 三、引导式学习平台操作指南

【插入最终的完整页面图】

### 1.工作台布局与功能

- **实验手册**
- **工作区**
- **学习支持**

参考[新手操作指南]：os-lab\handbook\guide\beginner.md

# 三四五六都最后确定check



## 四、建议的学习方式

**首选：在[引导式学习工作台](/guide/ai-tutor)中完成每个 Lab。** 工作台把左栏手册和右栏 AI 导师放在一起，按「定界 → 阅读 → 验证 → 排错 → 复盘」五个阶段推进：导师只提问不代写，你的判断、QEMU 验证和复盘会被自动记录成可导出的学习证据链；完成当前层后，由老师按范围手动分发下一层。从 [Lab1 工作台](/learn/lab1) 开始即可。

把每个 Lab 当成一个小闭环，按下面节奏完成：

1. **先对一下教材**  
   看本页表格里该 Lab 对应 OSTEP 的哪一块（虚拟化 / 并发 / 持久性），用书里的问题建立动机，再打开实验文档。

2. **读问题场景，对照代码**  
   文档里的图（启动流程、trap、页表、VirtIO、信号路径等）建议对着仓库源文件看一遍。

3. **跑通验证**  
   在仓库根目录激活环境后进入 `os-lab`。Lab1–5 可用 `cargo run -p kernel --features labN --release`；**Lab6–8 请用** `make test-lab6` / `test-lab7` / `test-lab8`（须 VirtIO，见各实验文档）。

4. **完成【任务二】阅读理解与思考题 / 小修改**  
   题目在各 Lab 实验文档【任务二】，完成后把自己的解释和验证证据写进复盘。

5. **留下进度**  
   在工作台完成受信验证与学习复盘；系统会写入成长档案，下一层由老师按范围手动分发后解锁。

6. **善用 AI，但先自己想**  
   每个 Lab 文档末尾有「AI 提问模板」。提问时可以带上教材术语（如地址空间、系统调用、锁、死锁），效果通常更好。

遇到卡住时，优先检查：环境是否激活、feature 是否选对、是否在 `os-lab` 目录下执行；Lab6 起还要确认是否用了带 VirtIO 的 `make test-labN`。

## 五、第一次动手（最短路径）最最后看一下，我们整个系统是搞成docker还是app什么的，需要确定一下需不需要用户自己配置项目

若尚未安装 Rust / QEMU，先看 [环境安装](/setup/environment)。

在仓库**根目录**打开 PowerShell：

```powershell
. .\scripts\activate-os-env.ps1
cd os-lab
```

自检：

<CopyCommand command="rustc --version
qemu-system-riscv64 --version" />

跑通 Lab1：

<CopyCommand command="cargo run -p kernel --features lab1 --release" />

成功时应在 OpenSBI 日志之后看到类似：

```text
Hello, OS!
os-lab kernel lab1 is running on QEMU virt.
```

然后按顺序体验后续 Lab（Lab1–5 可用 cargo；Lab6–8 须用 make，需 VirtIO）：

<CopyCommand command="cargo run -p kernel --features lab2 --release
cargo run -p kernel --features lab3 --release
cargo run -p kernel --features lab4 --release
cargo run -p kernel --features lab5 --release
make test-lab6
make test-lab7
make test-lab8" label="复制全部" />

> Lab6–8 须挂载 VirtIO 磁盘镜像；请先保证用户程序与 `fs.img` 已构建，详细步骤见各实验文档「环境准备」。

## 六、推荐阅读顺序

| 顺序 | 做什么 | 链接 |
|------|--------|------|
| 1 | 读完本文，建立「实验 ↔《操作系统导论》」图景 | 本页 |
| 2 | 配好本机环境 | [环境安装](/setup/environment) |
| 3 | 查看教师已分发的实验与当前进度 | [引导式学习路径](/guide/ai-tutor) |
| 4 | 进入工作台，从 Lab1 正式开始（建议同步翻教材导论部分） | [Lab1 工作台](/learn/lab1) · [引导式学习](/guide/ai-tutor) |

准备好了的话，下一步进入 [引导式学习](/guide/ai-tutor)，或直接打开 [Lab1 工作台](/learn/lab1)。
