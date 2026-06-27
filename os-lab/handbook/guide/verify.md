# 验证命令速查

在 `os-lab` 目录下执行以下命令。完整 Day1–Day7 细则见 [完整验证文档](/setup/verify-full)。

## 环境

仓库根目录：

<CopyCommand command=". .\scripts\activate-os-env.ps1
cd os-lab" />

## QEMU 按 Lab

### Lab1

<CopyCommand command="cargo run -p kernel --features lab1 --release" />

期望：`Hello, OS!`

### Lab2

<CopyCommand command="cargo run -p kernel --features lab2 --release" />

期望：`409684505`、`Yield round`

### Lab3

<CopyCommand command="cargo run -p kernel --features lab3 --release" />

### Lab4

<CopyCommand command="cargo run -p kernel --features lab4 --release" />

期望：`fork_test pass`

### Lab5

<CopyCommand command="cargo run -p kernel --features lab5 --release" />

期望：`fs_test pass`、`pipe_test pass`

## 组件单元测试（host）

<CopyCommand command="cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1" />

预期合计 **24 项** `ok`。

## 编译检查

<CopyCommand command="cargo check --workspace
cargo check -p kernel --features lab1
cargo check -p kernel --features lab5" />

或使用 GNU Make：`make check`、`make test-lab1` … `make test-lab5`。

## 学习进度

在 [学习进度](/guide/progress) 页可勾选各 Lab 步骤并复制单条验证命令。
