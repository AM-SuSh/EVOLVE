# 验证命令速查

在 `os-lab` 目录下执行以下命令。完整 Day1–Day7 细则见 [完整验证文档](/setup/verify-full)。

## 环境

仓库根目录：

<CopyCommand command=". .\scripts\activate-os-env.ps1
cd os-lab" />

## QEMU 按 Lab

### Lab1

<CopyCommand command="cargo run -p kernel --features lab1 --release" />

期望：`Hello, OS!`、`os-lab kernel lab1 is running on QEMU virt.`

### Lab2

<CopyCommand command="cargo run -p kernel --features lab2 --release" />

期望：`Hello from user app!`、`409684505`、5 行 `Yield round`、`All user apps exited.`

### Lab3

<CopyCommand command="cargo run -p kernel --features lab3 --release" />

期望：与 Lab2 相同测例输出（`Hello from user app!`、`409684505`、5 行 `Yield round`、`All user apps exited.`）

### Lab4

<CopyCommand command="cargo run -p kernel --features lab4 --release" />

期望：`I am parent`、`I am child`、`waited pid done`、`fork_test pass`、`All processes exited.`

### Lab5

<CopyCommand command="cargo run -p kernel --features lab5 --release" />

期望：`fs_test pass`、`pipe_test pass`

### Lab6（VirtIO 磁盘，走 Makefile）

<CopyCommand command="make test-lab6" />

期望：`file_test pass`、`Test link OK!`、`mass open/unlink OK!`、`fs_test pass`

### Lab7

<CopyCommand command="make test-lab7" />

期望：`dup_test pass`、`signal_test pass`、`signal_mask_test pass`

### Lab8

<CopyCommand command="make test-lab8" />

期望：`threads_test pass`、`mutex_test pass`、`condvar_test pass`、`deadlock test mutex 1 OK!`

## 组件单元测试（host）

<CopyCommand command="cargo test -p os-context -p os-syscall -p os-sbi -p os-fs -p os-signal -p os-sync --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1" />

预期合计 **42 项** `ok`。

## 编译检查

<CopyCommand command="cargo check --workspace
cargo check -p kernel --features lab1
cargo check -p kernel --features lab8" />

或使用 GNU Make：`make check`、`make test-lab1` … `make test-lab8`。

## 学习进度

在 [学习进度](/guide/progress) 页可勾选各 Lab 步骤并复制单条验证命令。
