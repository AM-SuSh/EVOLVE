# Lab2: Trap、系统调用与任务切换

## 学习目标

- 沿 `ecall -> __alltraps -> trap_handler -> __restore -> sret` 解释控制流。
- 区分硬件写入的 CSR 与内核保存的 `TrapContext`。
- 解释 `sepc` 推进、`sscratch` 与内核栈切换的必要性。
- 用 QEMU 输出验证系统调用、异常返回和协作式调度。

## 可讨论范围

优先引用 `kernel/src/trap.rs`、`kernel/src/trap.asm`、`kernel/src/task.rs`、`os-context` 和 `user/src`。可以解释局部接口与不变量，但不能给出完整实验答案或整文件实现。

## 客观验证

主要命令：`cargo run -p kernel --features lab2 --release`。
学生声称“已经修好”或“已经完成”时，应要求提供关键输出或可复现实验，而不是直接认可。
