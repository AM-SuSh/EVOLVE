# 项目文档索引

本目录汇总赛题交付相关说明。评审方建议从 **[delivery-checklist.md](delivery-checklist.md)** 开始。

## 按赛题权重

### 30%：参考环境练习

| 文档 | 说明 |
| --- | --- |
| [reference-practice-report.md](reference-practice-report.md) | **练习实现总结报告**（exercise 实现过程、checker 结果、复现命令） |
| [reference_test_report.md](reference_test_report.md) | 参考仓库 base 测试记录（非 exercise） |

### 70%：自研 os-lab

| 文档 | 说明 |
| --- | --- |
| [os-lab.md](os-lab.md) | 自研环境入口（链到 `os-lab/` 代码与实验） |
| [os-lab/docs/design-report.md](../os-lab/docs/design-report.md) | **教学实验环境设计总结报告** |
| [os-lab/docs/comparison.md](../os-lab/docs/comparison.md) | 本校 / 参考 / 自研三方对比与学习效率评估 |
| [os-lab/docs/comparison-data.md](../os-lab/docs/comparison-data.md) | 对比原始数据与采集说明 |
| [os-lab/docs/architecture.md](../os-lab/docs/architecture.md) | 架构、feature 依赖、Lab 数据流 |
| [os-lab/docs/ai-collaboration.md](../os-lab/docs/ai-collaboration.md) | AI 协作过程记录 |

## 验证与交付

| 文档 | 说明 |
| --- | --- |
| [delivery-checklist.md](delivery-checklist.md) | **交付清单**、评审维度自查、快速/完整验证路径 |
| [os-lab_verify.md](os-lab_verify.md) | 自研环境 Day1–Day7 可复制验证指令 |
| [environment_setup.md](environment_setup.md) | Rust、QEMU、Git 安装与路径配置 |

## 教学实验（学生向）

位于 `os-lab/labs/`：

| 类型 | 路径 |
| --- | --- |
| 总览 | [os-lab/labs/overview.md](../os-lab/labs/overview.md) |
| **Web 学习手册** | [docs/handbook.md](handbook.md) → `os-lab/handbook/` |
| 指导 lab1–5 | `os-lab/labs/lab*-*.md` |
| 习题 | [os-lab/labs/exercises/](../os-lab/labs/exercises/) |
| 参考答案 | [os-lab/labs/answers/](../os-lab/labs/answers/) |
| 测试说明 | [os-lab/tests/README.md](../os-lab/tests/README.md) |

## 过程文档（可选阅读）

| 文档 | 说明 |
| --- | --- |
| [project_plan.md](project_plan.md) | 项目计划、里程碑、三人分工 |
| [../progress.md](../progress.md) | 施工与验证进度日志 |
| [../Task.md](../Task.md) | 赛题原文 |

## 代码入口

| 路径 | 说明 |
| --- | --- |
| [../os-lab/README.md](../os-lab/README.md) | 自研环境快速开始、目录结构 |
| [../os-lab/](../os-lab/) | 自研 workspace（kernel + 6 组件 crate + user） |
| `../reference/`（本地 clone） | 参考练习实现，见 [delivery-checklist.md §5](delivery-checklist.md) |
