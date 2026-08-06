# Lab3: 内存与虚拟内存

## 学习目标

- 区分物理地址、虚拟地址、页号与页内偏移。
- 解释物理页分配、页表映射和地址转换的职责边界。
- 结合权限位与生命周期分析访问异常。
- 用运行输出和最小映射实验验证地址转换假设。

## 可讨论范围

优先引用 `os-alloc/src/lib.rs`、`os-vm/src/lib.rs`、`kernel/src/mm.rs`、`kernel/src/config.rs`、`kernel/src/riscv.rs` 和 `kernel/src/loader.rs`。可以解释帧分配、VPN 拆表、PTE 权限位、恒等映射与 trap 时的 `satp` 切换，但不能给出完整实验答案或整文件实现。对 debug 变体，在学生完成「最小映射实验 + 定位 U 位或映射缺失」前，不要直接点出具体缺 `U` 的行。

## 客观验证

主要命令：`cargo run -p kernel --features lab3 --release`。验证必须看到 Hello、幂结果、Yield×5、`All user apps exited.`；修改任务做完务必改回并复跑。只看到退出码 0 不视为通过。
