# os-lab 自研教学实验环境

仓库 `os-lab/` 为赛题 **自研环境**：基于 Rust + RISC-V 64 的单内核渐进式教学实验，通过 `lab1`–`lab5` feature 在同一代码库中从裸机演进到文件系统与管道。

交付范围总览见 [delivery-checklist.md](delivery-checklist.md)；仓库索引见 [README.md](../README.md)。

## 交付物一览

| 类别 | 入口 |
| --- | --- |
| 设计总结报告 | [os-lab/docs/design-report.md](../os-lab/docs/design-report.md) |
| 三方对比与学习效率 | [os-lab/docs/comparison.md](../os-lab/docs/comparison.md)、[comparison-data.md](../os-lab/docs/comparison-data.md) |
| 架构与 feature 设计 | [os-lab/docs/architecture.md](../os-lab/docs/architecture.md) |
| AI 协作记录 | [os-lab/docs/ai-collaboration.md](../os-lab/docs/ai-collaboration.md) |
| 实验指导（lab1–5） | [os-lab/labs/overview.md](../os-lab/labs/overview.md) |
| 习题与参考答案 | `os-lab/labs/exercises/`、`os-lab/labs/answers/` |
| Web 学习手册 | [handbook.md](handbook.md) → `os-lab/handbook/` |
| 验证与复现 | [os-lab_verify.md](os-lab_verify.md) |
| 源码 workspace | [os-lab/README.md](../os-lab/README.md) |

## 快速验证（Lab1）

环境安装见 [environment_setup.md](environment_setup.md)。在仓库根目录激活环境后：

```powershell
. .\scripts\activate-os-env.ps1
cd os-lab
cargo run -p kernel --features lab1
```

期望 QEMU 输出 `Hello, OS!`。完整验证（编译、24 项单测、clippy、Lab1–5 QEMU）见 [os-lab_verify.md §11](os-lab_verify.md)。

## 与参考环境的关系

参考环境 `reference/tg-rcore-tutorial` 用于 **练习**对照；自研环境在 `os-lab/` 独立演进，不修改参考仓库。练习实现见 [reference-practice-report.md](reference-practice-report.md)。
