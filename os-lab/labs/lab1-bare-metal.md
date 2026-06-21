# 实验 1：裸机启动与最小内核

> 初稿占位（成员 C 将完善问题场景、背景知识与习题）。Day 1 代码侧已由成员 A 完成。

## 目标

在 QEMU `virt` 机器上运行最小内核，输出 `Hello, OS!` 并正常关机。

## 验证

```powershell
cd os-lab
cargo run -p kernel --features lab1
```

## 代码入口

- 汇编入口：`kernel/src/entry.asm`
- Rust 主函数：`kernel/src/main.rs`
- 链接脚本：`kernel/linker.ld`
- SBI 调用：`kernel/src/sbi.rs`

## 思考题（待补充）

1. 为什么内核链接地址选择 `0x80200000`？
2. OpenSBI 在启动过程中扮演什么角色？
3. `#![no_std]` 与 `#![no_main]` 分别解决什么问题？
