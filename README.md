# 仓库总览

本仓库汇总操作系统课程赛题交付材料。

## 项目基线

本仓库在赛题参考环境 **[tg-rcore-tutorial](https://github.com/rcore-os/tg-rcore-tutorial)** 基础上开展练习与自研工作：

| 项 | 说明 |
| --- | --- |
| 参考环境 | `tg-rcore-tutorial`（branch `test`，commit `d6330a6`） |
| 30% 练习 | 在参考环境 ch3/ch4/ch5/ch6/ch8 完成 exercise，补丁见 [reference-patches/](reference-patches/) |
| 70% 自研 | 独立实现 `os-lab/` 教学实验环境，不修改上游参考仓库 |

项目总报告与对比分析中的基线描述与上表一致，见 [项目总报告.md](项目总报告.md)、[os-lab/docs/design-report.md](os-lab/docs/design-report.md)、[docs/reference-report.md](docs/reference-report.md)。

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
| [docs/reference-report.md](docs/reference-report.md) | **参考环境报告**（base 测试、exercise 实现、checker 结果、复现命令） |
| [reference-patches/](reference-patches/) | 练习实现 `.patch`（相对基线 `d6330a6` 的可审阅 diff） |

### 70%：自研 os-lab

| 文档 | 说明 |
| --- | --- |
| [docs/os-lab.md](docs/os-lab.md) | **自研环境统一入口**（概览、验证、手册） |
| [os-lab/docs/design-report.md](os-lab/docs/design-report.md) | **教学实验环境设计总结报告** |
| [os-lab/docs/architecture.md](os-lab/docs/architecture.md) | 架构、feature 依赖、Lab 数据流 |
| [os-lab/docs/comparison.md](os-lab/docs/comparison.md) | 本校 / 参考 / 自研三方对比与学习效率评估 |
| [os-lab/docs/comparison-data.md](os-lab/docs/comparison-data.md) | 对比原始数据与采集说明 |
| [os-lab/docs/ai-collaboration.md](os-lab/docs/ai-collaboration.md) | AI 协作过程记录 |

## 验证与交付

| 文档 | 说明 |
| --- | --- |
| [项目总报告.md](项目总报告.md) | **项目总报告 / 完整技术方案**（大赛提交用） |
| [docs/os-lab.md](docs/os-lab.md) | **自研环境验证与复现**、Web 学习手册说明 |
| [docs/environment_setup.md](docs/environment_setup.md) | Rust、QEMU、Git 安装与配置 |
| [progress.md](progress.md) | **项目阶段计划**与开发过程记录 |

## 教学实验（学生向）

位于 `os-lab/labs/`：

| 类型 | 路径 |
| --- | --- |
| 总览 | [os-lab/labs/overview.md](os-lab/labs/overview.md) |
| **Web 学习手册** | [docs/os-lab.md](docs/os-lab.md) → `os-lab/handbook/` |
| 指导 lab1–5 | `os-lab/labs/lab*-*.md`（【任务二】为阅读理解题） |
| 参考答案 | [os-lab/labs/answers/](os-lab/labs/answers/) |
| 测试说明 | [os-lab/tests/README.md](os-lab/tests/README.md) |

## 附录

| 文档 | 说明 |
| --- | --- |
| [Task.md](Task.md) | 赛题原文 |
| [progress.md](progress.md) | 开发过程记录 |
| [docs/LICENSE](docs/LICENSE) | 技术文档许可证 |

## 代码入口

| 路径 | 说明 |
| --- | --- |
| [os-lab/README.md](os-lab/README.md) | 自研环境快速开始、目录结构 |
| [os-lab/](os-lab/) | 自研 workspace（kernel + 6 组件 crate + user） |
| `reference/`（本地 clone，可选） | 完整参考仓库；练习 diff 已提交至 [reference-patches/](reference-patches/) |
