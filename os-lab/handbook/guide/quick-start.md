# 5 分钟上手

在动手实验前，用最少步骤确认环境可用并跑通 **Lab1**。

## 1. 准备环境

若尚未安装 Rust / QEMU，请先阅读 [环境安装](/setup/environment)。

在仓库**根目录**打开 PowerShell：

<CopyCommand command=". .\scripts\activate-os-env.ps1
cd os-lab" />

自检版本：

<CopyCommand command="rustc --version
qemu-system-riscv64 --version" />

## 2. 运行 Lab1

<CopyCommand command="cargo run -p kernel --features lab1 --release" />

成功时应看到：

```text
Hello, OS!
os-lab kernel lab1 is running on QEMU virt.
```

## 3. 按顺序体验演进

<CopyCommand command="cargo run -p kernel --features lab2 --release
cargo run -p kernel --features lab3 --release
cargo run -p kernel --features lab4 --release
cargo run -p kernel --features lab5 --release" label="复制全部" />

## 4. 下一步

- 阅读 [实验总览与知识地图](/labs/overview)
- 在 [学习进度](/guide/progress) 页勾选清单
- 从 [Lab1 裸机启动](/labs/lab1-bare-metal) 开始系统学习
