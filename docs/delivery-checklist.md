# 赛题交付清单

## 1. 赛题主线对照

 赛题要求 | 主入口 |
| --- | --- |
| 参考环境 5 章 **练习（exercise）** + 练习实现总结报告 | [reference-report.md](reference-report.md) |
| 自研 `os-lab` 教学环境 + 设计总结报告 + 对比评估 + 习题/答案 | [os-lab.md](os-lab.md) → [design-report.md](../os-lab/docs/design-report.md) |

### 1.1 参考练习完成情况

| 章节 | checker（exercise） | 报告章节 |
| --- | --- | --- |
| ch3 `sys_trace` | **7/7** | [reference-report.md §5](reference-report.md) |
| ch4 `mmap`/`munmap` | **16/16** | 同上 |
| ch5 `spawn` + stride | **17/17** | 同上 |
| ch6 硬链接 + `fstat` | **33/33** | 同上 |
| ch8 死锁检测 | **25/25** | 同上 |

- **base 测试**（参考框架自带，非 exercise）：见 [reference-report.md §3](reference-report.md)
- **实现位置**：`reference/tg-rcore-tutorial/`（练习 diff 已提交至 [reference-patches/](../reference-patches/)）
- **复现命令**：见 [reference-report.md §8](reference-report.md)

### 1.2 自研环境完成情况

| 类别 | 数量/状态 | 主入口 |
| --- | --- | --- |
| Lab 实验（QEMU） | lab1–lab5 均成功运行 | [os-lab/labs/overview.md](../os-lab/labs/overview.md) |
| 实验指导 | 5 篇 | `os-lab/labs/lab*.md` |
| **Web 学习手册** | VitePress 静态站 | [os-lab.md](os-lab.md) → `os-lab/handbook/` |
| 习题 + 参考答案 | 各 5 篇 | `os-lab/labs/exercises/`、`os-lab/labs/answers/` |
| 组件单元测试（host） | **24/24** 通过 | [os-lab.md §5](os-lab.md) |
| clippy 全绿 | workspace + lab1–lab5 feature | [os-lab.md §5](os-lab.md) |
| 设计总结报告 | 1 篇 | [design-report.md](../os-lab/docs/design-report.md) |
| 三方对比 + 学习效率 | 1 篇 + 数据附录 | [comparison.md](../os-lab/docs/comparison.md)、[comparison-data.md](../os-lab/docs/comparison-data.md) |
| AI 协作记录 | 1 篇 | [ai-collaboration.md](../os-lab/docs/ai-collaboration.md) |
| 许可证 | BSD-3-Clause | [os-lab/LICENSE](../os-lab/LICENSE) |

---

## 2. 交付物文件清单

### 2.1 仓库根目录与通用文档

| 路径 | 用途 |
| --- | --- |
| [Task.md](../Task.md) | 赛题原文 |
| [README.md](../README.md) | **仓库总览** |
| [docs/LICENSE](LICENSE) | 技术文档 CC BY-SA 4.0 许可证 |
| [docs/technical-proposal.md](technical-proposal.md) | **完整技术方案文档** |
| [docs/delivery-checklist.md](delivery-checklist.md) | 交付物索引与验证路径（本文） |
| [docs/environment_setup.md](environment_setup.md) | Rust / QEMU / Git 环境安装 |
| [docs/os-lab.md](os-lab.md) | 自研环境统一入口（含验证与手册说明） |
| [docs/reference-report.md](reference-report.md) | 参考环境报告（base 测试 + exercise 实现总结） |
| [docs/project_plan.md](project_plan.md) | **项目阶段计划表** |
| [scripts/activate-os-env.ps1](../scripts/activate-os-env.ps1) | Windows 实验环境激活 |

### 2.2 自研代码与教学文档（`os-lab/`）

| 路径 | 用途 |
| --- | --- |
| [os-lab/README.md](../os-lab/README.md) | 自研环境快速开始 |
| [os-lab/kernel/](../os-lab/kernel/) | 单内核主体（feature `lab1`–`lab5`） |
| [os-lab/os-sbi/](../os-lab/os-sbi/) … [os-fs/](../os-lab/os-fs/) | 6 个组件 crate |
| [os-lab/user/](../os-lab/user/) | 用户态测试程序 |
| [os-lab/handbook/](../os-lab/handbook/) | **Web 学习手册**（VitePress：文档聚合 + 学习进度） |
| [os-lab/labs/](../os-lab/labs/) | 实验指导、习题、答案 |
| [os-lab/docs/design-report.md](../os-lab/docs/design-report.md) | 设计总结报告 |
| [os-lab/docs/architecture.md](../os-lab/docs/architecture.md) | 架构与数据流 |
| [os-lab/docs/comparison.md](../os-lab/docs/comparison.md) | 三方对比与学习效率 |
| [os-lab/tests/README.md](../os-lab/tests/README.md) | 集成测试说明 |
| [os-lab/LICENSE](../os-lab/LICENSE) | BSD-3-Clause 许可证 |

### 2.3 参考练习补丁

| 路径 | 用途 |
| --- | --- |
| [reference-patches/](../reference-patches/) | ch3/ch4/ch5/ch6/ch8 exercise `.patch`（基线 `d6330a6`） |
| [reference-patches/README.md](../reference-patches/README.md) | 补丁清单与应用说明 |
| `reference/tg-rcore-tutorial/` | 完整参考仓库；打补丁后复现 exercise |

---

## 3. 验证路径

### 3.1 快速验证

**环境**：先读 [environment_setup.md](environment_setup.md)，再执行：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
```

**自研 os-lab（抽样）**

```powershell
cd os-lab
cargo run -p kernel --features lab1 --release    # 期望：Hello, OS!
cargo run -p kernel --features lab5 --release    # 期望：fs_test pass、pipe_test pass
cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
```

**参考 exercise（需先 clone 参考仓库到 `reference/`）**

```powershell
$env:CHAPTER = "6"
cd reference\tg-rcore-tutorial\tg-rcore-tutorial-ch6
cargo clean
cargo run --features exercise 2>&1 | Tee-Object ..\..\os-lab\ch6-check.out
Get-Content ..\..\os-lab\ch6-check.out | tg-rcore-tutorial-checker --ch 6 --exercise
# 期望：Test PASSED: 33/33
```

### 3.2 完整验证

按 [os-lab.md §5](os-lab.md) 完整验证块执行：workspace 编译、clippy、24 项单元测试、Lab1–Lab5 QEMU 回归。

参考 exercise 五章分别设置 `CHAPTER=3/5/6/8`（ch4 任意非负）后 `cargo clean` + `cargo run --features exercise`，用 checker 验收；详见 [reference-report.md §8](reference-report.md)。

---

## 4. 未纳入 Git 的说明

| 项 | 原因 | 获取方式 |
| --- | --- | --- |
| `reference/` | `.gitignore`：第三方教程仓库体积大（约 1.5GB） | 按 [reference-report.md §1](reference-report.md) clone 基线后，应用 [reference-patches/](../reference-patches/) 内补丁 |
| `os-lab/ch*.out`、`_tmp-*.txt` | 本地 QEMU/构建日志，非正式交付物 | 自行运行生成，或阅读报告中的 checker 摘要 |
| `**/*.local.ps1` | 本机路径配置 | 使用 `scripts/activate-os-env.ps1` 或自建 `*.local.ps1` |

---

## 5. 推荐阅读顺序

```mermaid
flowchart TD
    A["delivery-checklist.md<br/>（本文）"] --> B["os-lab/README.md<br/>5 分钟跑通 lab1"]
    A --> C["reference-report.md<br/>30% 参考环境报告"]
    B --> D["design-report.md<br/>70% 设计总结"]
    D --> E["comparison.md<br/>三方对比"]
    B --> F["os-lab.md<br/>完整复现"]
```

1. **本文** → 了解交付范围与完成情况
2. **[design-report.md](../os-lab/docs/design-report.md)** → 自研环境设计总结
3. **[reference-report.md](reference-report.md)** → 参考 base 测试、练习实现与 AI 协作
4. **[os-lab.md](os-lab.md)** → 动手复现
5. **[labs/overview.md](../os-lab/labs/overview.md)** → 教学实验与知识点地图

---

## 6. 版本信息

| 项 | 值 |
| --- | --- |
| 交付日期 | 2026-06-27 |
| 自研验证 | clippy 全绿 + lab1–5 QEMU + 24 项单测 |
| 参考 exercise | ch3/ch4/ch5/ch6/ch8 checker 全绿 |
