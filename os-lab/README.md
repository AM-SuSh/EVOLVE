# os-lab：自研操作系统教学实验环境

基于 Rust + RISC-V 64 的单内核渐进式教学实验环境。学生通过切换 `lab1` 到 `lab5` 的 feature，在同一套代码库中观察内核从裸机到完整系统的演进。

**赛题交付**：[交付清单](../docs/delivery-checklist.md) · [仓库总览](../README.md) · [设计总结报告](docs/design-report.md) · **[学习手册 Web 版](handbook/README.md)**

## 环境要求

- Rust stable（见 `rust-toolchain.toml`）
- Target：`riscv64gc-unknown-none-elf`
- QEMU：`qemu-system-riscv64`（建议 ≥ 7.0）
- 组件：`rust-src`、`llvm-tools-preview`

本仓库根目录已提供环境激活脚本；完整验证步骤见 [docs/os-lab_verify.md](../docs/os-lab_verify.md)。

```powershell
. ..\scripts\activate-os-env.ps1
cd os-lab
```

## 快速开始（新人 5 分钟）

1. 激活环境（见上）。
2. 编译并运行最小内核：

```powershell
cargo run -p kernel --features lab1 --release
```

3. 成功时 QEMU 输出：

```text
Hello, OS!
os-lab kernel lab1 is running on QEMU virt.
```

4. 按顺序体验完整演进：

```powershell
cargo run -p kernel --features lab2 --release   # 中断与多任务
cargo run -p kernel --features lab3 --release   # 虚存
cargo run -p kernel --features lab4 --release   # fork/exec/wait
cargo run -p kernel --features lab5 --release   # 文件系统与管道
```

或使用 Makefile（需 GNU Make，Git Bash 可用）：

```bash
make test-lab1    # 等价于 make run FEATURE=lab1
make test-lab5
make check        # 验证 lab1–lab5 均可编译
```

## Feature 层级

| Feature | 能力 |
|---------|------|
| `lab1` | 裸机启动、SBI、控制台输出 |
| `lab2` | 中断、批处理/多任务、系统调用 |
| `lab3` | 物理页分配、页表、地址空间 |
| `lab4` | fork / exec / wait |
| `lab5` | 文件系统、并发原语（自旋锁 + 管道） |

```powershell
cargo run -p kernel --features lab3 --release
```

## 实验列表

| 实验 | 主题 | 指导文档 | 习题 |
|------|------|----------|------|
| Lab1 | 裸机启动与最小内核 | [labs/lab1-bare-metal.md](labs/lab1-bare-metal.md) | [exercises/lab1-exercises.md](labs/exercises/lab1-exercises.md) |
| Lab2 | 中断处理与多任务 | [labs/lab2-trap-and-task.md](labs/lab2-trap-and-task.md) | [exercises/lab2-exercises.md](labs/exercises/lab2-exercises.md) |
| Lab3 | 内存管理与虚存 | [labs/lab3-memory.md](labs/lab3-memory.md) | [exercises/lab3-exercises.md](labs/exercises/lab3-exercises.md) |
| Lab4 | 进程管理 | [labs/lab4-process.md](labs/lab4-process.md) | [exercises/lab4-exercises.md](labs/exercises/lab4-exercises.md) |
| Lab5 | 文件系统与并发 | [labs/lab5-fs-and-sync.md](labs/lab5-fs-and-sync.md) | [exercises/lab5-exercises.md](labs/exercises/lab5-exercises.md) |

实验总览与知识点地图：[labs/overview.md](labs/overview.md)。参考答案见 [labs/answers/](labs/answers/)。

## 测试与验证

### QEMU 集成测试（按 Lab）

```powershell
# 或使用 make test-lab1 … make test-lab5
cargo run -p kernel --features lab1 --release
cargo run -p kernel --features lab2 --release   # 关键输出：409684505、Yield round
cargo run -p kernel --features lab3 --release
cargo run -p kernel --features lab4 --release   # 关键输出：fork_test pass
cargo run -p kernel --features lab5 --release   # 关键输出：fs_test pass、pipe_test pass
```

### 组件单元测试（host 目标，Windows 示例）

```powershell
cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1
```

预期合计 **24 项**全部 `ok`。详细成功标准见 [tests/README.md](tests/README.md) 与 [docs/os-lab_verify.md](../docs/os-lab_verify.md)。

### 编译检查

```powershell
cargo check --workspace
cargo check -p kernel --features lab1
# … lab2–lab5 同理，或 make check
```

## 目录结构

```text
os-lab/
├── kernel/          # 可执行内核（feature gate 主体）
├── os-sbi/          # SBI 封装（lab1+）
├── os-context/      # 上下文切换（lab2+）
├── os-syscall/      # 系统调用定义（lab2+）
├── os-alloc/        # 内存分配（lab3+）
├── os-vm/           # 虚存管理（lab3+）
├── os-fs/           # 文件系统（lab5）
├── user/            # 用户态测试程序（lab2+）
├── labs/            # 实验指导、习题与答案
├── docs/            # 架构说明、三方对比、AI 协作记录
└── tests/           # 集成测试说明
```

## 项目文档

| 文档 | 说明 |
|------|------|
| [docs/design-report.md](docs/design-report.md) | **设计总结报告**（赛题 70% 核心交付） |
| [docs/architecture.md](docs/architecture.md) | 架构说明、feature 依赖图、Lab1–Lab5 数据流 |
| [docs/comparison.md](docs/comparison.md) | 三方对比分析与学习效率评估 |
| [docs/ai-collaboration.md](docs/ai-collaboration.md) | AI 协作过程记录与示例 |
| [docs/comparison-data.md](docs/comparison-data.md) | 对比原始采集数据 |
| [labs/overview.md](labs/overview.md) | 实验总览与知识点地图 |

## 与参考环境的差异

- **单内核渐进式**：一个 `kernel` 二进制，通过 feature 逐级启用，而非 8 个独立内核。
- **精简组件化**：7 个库 crate、两层依赖（参考环境约 23 个 crate）。
- **内嵌验证**：组件 crate 提供 host 单元测试；内核通过 QEMU 用户态程序自证。

详细对比见 [docs/comparison.md](docs/comparison.md)。
