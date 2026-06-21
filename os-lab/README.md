# os-lab：自研操作系统教学实验环境

基于 Rust + RISC-V 64 的单内核渐进式教学实验环境。学生通过切换 `lab1` 到 `lab5` 的 feature，在同一套代码库中观察内核从裸机到完整系统的演进。

## 环境要求

- Rust stable（见 `rust-toolchain.toml`）
- Target：`riscv64gc-unknown-none-elf`
- QEMU：`qemu-system-riscv64`（建议 ≥ 7.0）
- 组件：`rust-src`、`llvm-tools-preview`

本仓库根目录已提供环境激活脚本：

```powershell
. ..\scripts\activate-os-env.ps1
```

## 快速开始

```powershell
cd os-lab
cargo run -p kernel --features lab1
```

或使用 Makefile（需 GNU Make，Git Bash 可用）：

```bash
make run
make test
make check
```

成功时 QEMU 将输出：

```text
Hello, OS!
os-lab kernel lab1 is running on QEMU virt.
```

## Feature 层级

| Feature | 能力 |
|---------|------|
| `lab1` | 裸机启动、SBI、控制台输出 |
| `lab2` | 中断、批处理/多任务、系统调用 |
| `lab3` | 物理页分配、页表、地址空间 |
| `lab4` | fork / exec / wait |
| `lab5` | 文件系统、并发原语 |

```powershell
cargo run -p kernel --features lab3
```

## 目录结构

```text
os-lab/
├── kernel/          # 可执行内核（feature gate 主体）
├── os-alloc/        # 内存分配（lab3+）
├── os-vm/           # 虚存管理（lab3+）
├── os-context/      # 上下文切换（lab2+）
├── os-syscall/      # 系统调用定义（lab2+）
├── os-fs/           # 文件系统（lab5）
├── user/            # 用户态测试程序（lab2+）
├── labs/            # 实验指导文档
├── docs/            # 项目设计文档
└── tests/           # 集成测试（后续补充）
```


详细架构见 [docs/architecture.md](docs/architecture.md)。
