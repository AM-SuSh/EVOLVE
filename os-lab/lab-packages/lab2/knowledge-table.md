# Lab2 知识点细表（成员 A · M0 Day1）

对应 `concepts/trap.yaml`、`concepts/scheduler.yaml` 与正文 `labs/lab2-trap-and-task.md`。

| ID | 概念 | 硬件/ABI | 源码 | 任务 | 证据 | 迁移 | 常见误区 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| os.trap.limited-direct-execution | 受限直接执行 | U/S 特权、ecall | `trap.rs`, `trap.asm` | 问题场景对照；任务二 | 用户输出；`trap_enter` | syscall、VM Exit | 混淆 Lab1/Lab2 的 ecall 目标 |
| os.trap.context-switch | 上下文保存恢复 | sepc/sstatus/sscratch、双栈 | `TrapContext`, `trap.asm` | 任务二 Q1–Q2；任务三注释 csrrw | 正常返回 / 破坏后崩溃 | 线程切换、信号帧 | 在用户栈保存；以为 sepc 已是下一条 |
| os.trap.syscall-abi | syscall ABI | a7/a0–a2、返回 a0 | `os-syscall`, `user/syscall.rs`, `trap.rs` | 任务二 Q3–Q4 | Hello、409684505、exit 行 | Linux ABI、过滤点 | 忘记 advance_sepc |
| os.sched.task-state | TCB 与状态机 | 软件状态 Ready/Running/Exited | `task.rs` | 任务二 Q5；debug 变体 | All exited；task_switch | 进程/线程阻塞态 | yield=exit |
| os.sched.round-robin | 协作轮转 | 从 Ready 集选取 | `find_next_task`, `yield.rs` | fill 变体；观察扫描起点 | Yield round×5 | 时间片、协程调度 | 恒选 0；不更新 current |

## 与工作台五阶段映射

| 阶段 | 主攻知识点 | 学生动作 |
| --- | --- | --- |
| orient | limited-direct-execution | 说清为何需要 trap |
| read | context-switch, syscall-abi | 沿控制流读代码 |
| run | 全体 | 跑 recipe，收集输出 |
| debug | task-state / round-robin（视变体） | 最小实验排错或补全 |
| reflect | 迁移列 | 对照 OSTEP 与后续 Lab |
