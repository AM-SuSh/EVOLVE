# 仓库总览

本仓库汇总操作系统课程赛题交付材料。评审方建议从 **[docs/delivery-checklist.md](docs/delivery-checklist.md)** 开始，再按本文导航进入代码、报告和验证文档。

## 项目基线

本仓库在赛题参考环境 **[tg-rcore-tutorial](https://github.com/rcore-os/tg-rcore-tutorial)** 基础上开展练习与自研工作：

| 项 | 说明 |
| --- | --- |
| 参考环境 | `tg-rcore-tutorial`（branch `test`，commit `d6330a6`） |
| 30% 练习 | 在参考环境 ch3/ch4/ch5/ch6/ch8 完成 exercise，补丁见 [reference-patches/](reference-patches/) |
| 70% 自研 | 独立实现 `os-lab/` 教学实验环境，不修改上游参考仓库 |

技术方案与对比分析中的基线描述与上表一致，见 [os-lab/docs/design-report.md](os-lab/docs/design-report.md)、[docs/reference-practice-report.md](docs/reference-practice-report.md)。

## 许可证

| 范围 | 许可证 | 文件 |
| --- | --- | --- |
| 技术文档（`docs/`、`os-lab/docs/`、`os-lab/labs/` 等 Markdown） | **CC BY-SA 4.0** | [docs/LICENSE](docs/LICENSE) |
| 自研源码（`os-lab/` workspace） | **BSD-3-Clause** | [os-lab/LICENSE](os-lab/LICENSE)、[os-lab/Cargo.toml](os-lab/Cargo.toml) |

`docs/` 目录及其子目录中的 Markdown 技术文档采用 **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)** 许可：署名 OS Lab Team；再发布或演绎时须以相同许可（BY-SA）共享。许可证全文见 [docs/LICENSE](docs/LICENSE)。

## 按赛题权重

### 30%：参考环境练习

| 文档 | 说明 |
| --- | --- |
| [docs/reference-practice-report.md](docs/reference-practice-report.md) | **练习实现总结报告**（exercise 实现过程、checker 结果、复现命令） |
| [docs/reference_test_report.md](docs/reference_test_report.md) | 参考仓库 base 测试记录（非 exercise） |
| [reference-patches/](reference-patches/) | 练习实现 `.patch`（相对基线 `d6330a6` 的可审阅 diff） |

### 70%：自研 os-lab

| 文档 | 说明 |
| --- | --- |
| [docs/os-lab.md](docs/os-lab.md) | 自研环境入口（链到 `os-lab/` 代码与实验） |
| [os-lab/docs/design-report.md](os-lab/docs/design-report.md) | **教学实验环境设计总结报告** |
| [os-lab/docs/comparison.md](os-lab/docs/comparison.md) | 本校 / 参考 / 自研三方对比与学习效率评估 |
| [os-lab/docs/comparison-data.md](os-lab/docs/comparison-data.md) | 对比原始数据与采集说明 |
| [os-lab/docs/architecture.md](os-lab/docs/architecture.md) | 架构、feature 依赖、Lab 数据流 |
| [os-lab/docs/ai-collaboration.md](os-lab/docs/ai-collaboration.md) | AI 协作过程记录 |

## 验证与交付

| 文档 | 说明 |
| --- | --- |
| [docs/delivery-checklist.md](docs/delivery-checklist.md) | **交付清单**、评审维度自查、快速/完整验证路径 |
| [docs/technical-proposal.md](docs/technical-proposal.md) | **完整技术方案文档**（大赛提交用） |
| [docs/os-lab_verify.md](docs/os-lab_verify.md) | 自研环境 Day1–Day7 可复制验证指令 |
| [docs/environment_setup.md](docs/environment_setup.md) | Rust、QEMU、Git 安装与路径配置 |

## 教学实验（学生向）

位于 `os-lab/labs/`：

| 类型 | 路径 |
| --- | --- |
| 总览 | [os-lab/labs/overview.md](os-lab/labs/overview.md) |
| **Web 学习手册** | [docs/handbook.md](docs/handbook.md) → `os-lab/handbook/` |
| 指导 lab1–5 | `os-lab/labs/lab*-*.md` |
| 习题 | [os-lab/labs/exercises/](os-lab/labs/exercises/) |
| 参考答案 | [os-lab/labs/answers/](os-lab/labs/answers/) |
| 测试说明 | [os-lab/tests/README.md](os-lab/tests/README.md) |

## 过程文档（可选阅读）

| 文档 | 说明 |
| --- | --- |
| [docs/project_plan.md](docs/project_plan.md) | 项目计划、里程碑、三人分工 |
| [progress.md](progress.md) | 施工与验证进度日志 |
| [Task.md](Task.md) | 赛题原文 |

## 代码入口

| 路径 | 说明 |
| --- | --- |
| [os-lab/README.md](os-lab/README.md) | 自研环境快速开始、目录结构 |
| [os-lab/](os-lab/) | 自研 workspace（kernel + 6 组件 crate + user） |
| `reference/`（本地 clone，可选） | 完整参考仓库；练习 diff 已提交至 [reference-patches/](reference-patches/) |
