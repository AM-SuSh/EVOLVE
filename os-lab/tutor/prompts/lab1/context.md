# Lab1: 裸机启动与 SBI

## 学习目标

- 解释固件、内核入口、链接脚本与 Rust 主函数之间的启动链路。
- 说明入口地址、启动栈和 BSS 初始化为什么必须匹配。
- 理解 SBI 在早期输出与关机流程中的职责。
- 用 QEMU 启动输出验证代码确实执行到预期阶段。

优先引用 `kernel/linker.ld`、`kernel/src/entry.asm`、`kernel/src/main.rs` 和 `kernel/src/console.rs`。主要命令：`cargo run -p kernel --features lab1 --release`。
