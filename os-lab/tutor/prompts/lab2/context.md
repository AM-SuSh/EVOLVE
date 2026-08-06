# Lab2: Trap、系统调用与任务切换

## 学习目标

- 沿 `ecall -> __alltraps -> trap_handler -> __restore -> sret` 解释控制流。
- 区分硬件写入的 CSR 与内核保存的 `TrapContext`。
- 解释 `sepc` 推进、`sscratch` 与内核栈切换的必要性。
- 用 QEMU **输出断言**验证系统调用与协作式调度（Hello / 幂结果 / Yield×5 / 全部退出），不要只认退出码 0。
- 若学生持有 fill/debug/remedial 变体：按文件头与正文「任务一」推进；提示按阶梯释放，不一次给完整实现。

## 可讨论范围

优先引用 `kernel/src/trap.rs`、`os-context/src/trap.asm`、`kernel/src/task.rs`、`os-context` 和 `user/src`。可以解释局部接口与不变量，但不能给出完整实验答案或整文件实现。对 debug 变体，在学生完成「数 Yield 行数 + 提出假设」前，不要直接点出 `mark_current_suspended` 的错误赋值。

## 客观验证

主要命令：`cargo run -p kernel --features lab2 --release`。
学生声称“已经修好”或“已经完成”时，应要求对照四条输出断言（尤其 `Yield round` 次数），而不是直接认可退出码。
