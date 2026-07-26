# Three-way comparison raw data (updated Week 4, Lab1–8)

Collected: 2026-07-25  
Method: PowerShell file count (`.rs`/`.asm`, exclude `target/`), line count, `#[test]` grep, `cargo test` on host triple `x86_64-pc-windows-msvc`

## Self-developed os-lab
- Crates: 11 (workspace root + kernel + user + 8 component crates: os-context, os-syscall, os-sbi, os-alloc, os-vm, os-fs, os-signal, os-sync)
- Source files: 70 (.rs + .asm)
- Lines of code: 8353
- Host unit tests: 40 (integration + `#[cfg(test)]`)
- Labs: 8 (lab1–lab8, mapping to ch1+ch2 / ch2+ch3 / ch4 / ch5 / ch6 / ch7 / ch8)
- Architecture: single kernel + feature gate progressive (8 component crates, 2 dependency layers)

## Reference tg-rcore-tutorial
- Crates: 29
- Source files: 548
- Lines of code: 36455
- Unit tests: 0
- Labs: 8 chapters (ch1–ch8; exercise checker per chapter)
- Architecture: 8 independent kernels + 23 component crates, 4 dependency layers

## Local university environment（xv6-riscv / MIT 6.S081）

> 经成员 C 确认，本校 OS 课程使用 xv6-riscv（MIT 6.S081 课程配套教学内核）。以下数据基于 MIT 6.S081 公开课程与 xv6-riscv 仓库的公开信息整理；标注【本校特有】的为本校授课可能调整的部分，需向课程老师核实。

### 定量指标

- 教学内核：xv6-riscv
- 编程语言：C（非 Rust）
- 实验平台：RISC-V（qemu-system-riscv64），与自研环境一致
- 内核架构：单内核，无 crate 组件化（C 语言没有 crate 概念，整个内核是单一源码树）
- 代码规模：内核约 6000-8000 行 C（kernel/ 目录），加用户态程序约 10000+ 行【粗略估计，以仓库实际为准】
- 实验数量：11 个 lab（MIT 6.S081 标准配置）
  - lab1 syscall（系统调用）
  - lab2 syscalls（系统调用进阶）
  - lab3 pgtbl（页表）
  - lab4 traps（陷阱与中断）
  - lab5 cow（写时复制 fork）
  - lab6 multithreading（多线程）
  - lab7 networking（网络驱动）
  - lab8 locks（锁）
  - lab9 fs（文件系统）
  - lab10 mmap（内存映射）
  - lab11 net（网络，部分年份有调整）
- 单元测试：有，通过 `grade-lab-xxx` 脚本自动化评分
- 文档：MIT 提供 xv6-book（英文）+ 每章 lecture notes + 每个 lab 的详细指导文档

### 定性分析

- **学习路径清晰度**：xv6-book 章节与实验对应明确，路径成熟。但 11 个 lab 数量多，且每个 lab 独立，学生需在不同 lab 间切换，认知负担偏高。
- **上手难度**：依赖 C 语言（指针、内存管理易错）+ RISC-V 汇编 + QEMU 环境。对不熟悉 C/汇编的学生门槛较高。MIT 提供一键配置脚本，但本校是否提供需核实。
- **文档友好度**：xv6-book 是经典教材，讲解深入。但偏"讲实现细节"而非"讲为什么这么设计"，问题驱动式引导较弱。
- **与自研环境的差异点（对比重点）**：
  - 语言：自研 Rust（内存安全），xv6 C（需手动管理，易错）
  - 架构：自研单内核+feature gate 渐进式，xv6 单一源码树（无 feature 切换，每 lab 改同一份代码）
  - 组件化：自研 8 crate/2 层依赖（模块边界清晰），xv6 无 crate（C 文件直接编译进内核）
  - 测试：自研内嵌 `#[cfg(test)]` + integration tests（40 项 host 测），xv6 用外部 grade 脚本
  - 实验引导：自研用"问题驱动+先想再对照"，xv6 偏"步骤式任务清单"
  - 实验数：自研 8 个（Lab1–8 一条线），xv6 11 个（覆盖更广含网络/fs 深入）

### 三方对比速览（定量，供 comparison.md 用）

| 维度 | 自研 os-lab | 参考 tg-rcore-tutorial | 本校 xv6-riscv |
|------|------------|----------------------|---------------|
| 语言 | Rust | Rust | C |
| 架构 | 单内核+feature gate | 8 独立内核 | 单一源码树 |
| 组件化 | 8 crate/2 层依赖 | 23 crate/4 层依赖 | 无 crate |
| 代码行数 | 8353 | 36455 | ~6000-8000（内核） |
| 源码文件数 | 70 | 548 | ~100+ |
| 单元测试 | 40 个（host） | 0 | 外部 grade 脚本 |
| 实验数 | 8 | 8（ch1–ch8） | 11 |
| 实验引导 | 问题驱动+先想再对照 | 实现导向 | 步骤式任务清单 |

### 待成员 C 向本校核实的【本校特有】项

1. 本校实际开设的 lab 数量（是否 11 个全开，还是选取子集）
2. 本校是否提供环境一键配置脚本（还是让学生自行配置）
3. 本校是否补充了问题驱动式实验指导（还是纯用 MIT 原版英文文档）
4. 本校用 xv6 的哪个版本年（6.S081 历年有微调）

> 注：xv6-riscv 是成熟的世界级教学内核，本校选用它说明教学水平高。三方对比的定位应是"差异化互补"而非"谁替代谁"——自研环境的优势在 Rust 内存安全、精简架构、问题驱动引导，可与 xv6 形成互补。

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-23 | 初版（Lab1–5，1882 行，9 测） |
| 2026-07-25 | 二期 Lab6–8 合入后更新：8 lab、8353 行、40 host 测、8 组件 crate |
