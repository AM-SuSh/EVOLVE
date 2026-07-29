# Lab3 知识点细表

| 概念 | 硬件/机制 | 源码 | 学生动作 | 证据 | 迁移 | 误区 |
| --- | --- | --- | --- | --- | --- | --- |
| 地址空间 | VA 布局 | `mm.rs` MemorySet | 对照 OSTEP 画本任务空间 | 多 app 输出正常 | 进程 VA、容器 | VA=PA |
| 页/帧 | 4K 页 | `os-alloc` | 说明分配粒度 | 映射创建成功 | buddy/slab | 按字节建表 |
| Sv39 walk | satp+三级 | `os-vm`/mm | 手写一次 VPN 切分 | （视图）walk 轨迹 | x86 四级页表 | 记错 VPN 位宽 |
| PTE 权限 | R/W/X/U | PTE 构造 | 预测缺 U 的现象 | fault/断言失败 | W^X、NX | 忽略 U 位 |
| 切换空间 | satp 切换 | 任务/进程入口 | 解释切换时机 | 切换后输出仍正确 | ASID、TLB shootdown | 忘切 satp |
| 缺页边界 | page fault | trap 扩展 | 最小实验触发/不触发 | 异常路径可读 | demand paging | 当 syscall 处理 |
