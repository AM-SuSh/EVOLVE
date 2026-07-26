# Lab3: 内存与虚拟内存

## 学习目标

- 区分物理地址、虚拟地址、页号与页内偏移。
- 解释物理页分配、页表映射和地址转换的职责边界。
- 结合权限位与生命周期分析访问异常。
- 用运行输出和最小映射实验验证地址转换假设。

优先引用 `kernel/src/mm.rs`、`kernel/src/config.rs`、`kernel/src/riscv.rs` 和 `kernel/src/loader.rs`。主要命令：`cargo run -p kernel --features lab3 --release`。
