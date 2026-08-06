# Lab1: 裸机启动与 SBI

## 学习目标

- 解释固件、内核入口、链接脚本与 Rust 主函数之间的启动链路。
- 说明入口地址、启动栈和 BSS 初始化为什么必须匹配。
- 理解 SBI 在早期输出与关机流程中的职责。
- 用 QEMU 启动输出验证代码确实执行到预期阶段。

## 可讨论范围

优先引用 `kernel/linker.ld`、`kernel/src/entry.asm`、`kernel/src/main.rs`、`kernel/src/console.rs` 和 `os-sbi/src/lib.rs`。可以解释链接脚本、BSS 清零、SBI `ecall` 封装等局部接口与不变量，但不能给出完整实验答案或整文件实现。

## 客观验证

主要命令：`cargo run -p kernel --features lab1 --release`。学生声称“已经跑通”或“已经完成”时，应要求贴出 `Hello, OS!` 与内核自身输出，并确认 QEMU 正常退出；不要只认可命令返回码 0。
