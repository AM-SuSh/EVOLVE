# os-lab 自研教学实验环境

自研操作系统教学实验环境位于仓库 `os-lab/` 目录，采用单内核 + feature gate 渐进式架构。

## 快速验证（Lab1）

完整验证步骤（编译检查 + QEMU）见 **[os-lab_verify.md](os-lab_verify.md)**。

在仓库根目录激活环境后：

```powershell
. .\scripts\activate-os-env.ps1
cd os-lab
cargo run -p kernel --features lab1
```

或使用 `make run`（需 GNU Make，Git Bash 可用）。

## 文档入口

- 快速开始与目录说明：[os-lab/README.md](../os-lab/README.md)
- 架构与 feature 设计：[os-lab/docs/architecture.md](../os-lab/docs/architecture.md)
- 实验指导：[os-lab/labs/overview.md](../os-lab/labs/overview.md)

## 与参考环境关系

参考环境 `reference/tg-rcore-tutorial` 仍用于对照练习；自研环境在 `os-lab/` 独立演进，不修改参考仓库。
