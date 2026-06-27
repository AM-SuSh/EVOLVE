# 参考实验环境练习实现总结报告

> 对应赛题 Task.md 技术指标第 1 条（30%）：完成最新教学实验环境中 5 个基础实验 **练习（exercise）**，并总结实现过程与 AI 协作。
>
> 参考仓库：`reference/tg-rcore-tutorial`（branch `test`，commit `d6330a6`）  
> 基础测试（base）记录见 [reference_test_report.md](reference_test_report.md)。

## 1. 总览

| 章节 | 练习内容 | checker 结果 | 状态 |
|------|----------|--------------|------|
| ch3 | `sys_trace` 系统调用 | exercise **7/7** | ✅ 通过 |
| ch4 | `mmap` / `munmap` 迁移 | exercise **16/16** | ✅ 通过 |
| ch5 | `spawn` + stride 调度 | exercise **17/17** | ✅ 通过 |
| ch6 | `linkat` / `unlinkat` / `fstat` + spawn | exercise **33/33** | ✅ 通过 |
| ch8 | 死锁检测（银行家 + 等待图） | exercise **25/25** | ✅ 通过 |

**关键环境说明（Windows）**

- exercise 模式下 `initproc` 通过编译期环境变量 `CHAPTER` 选择 usertest，而非交互式 shell。
- 必须 **`cargo clean` 后** 带 `CHAPTER` 重新编译用户程序，否则 `initproc` 仍可能进入 `user_shell` 导致挂死。
- 命令模板（PowerShell）：

```powershell
. ..\scripts\activate-os-env.ps1
$env:CHAPTER = "5"   # ch3/ch4 任意非负；ch5→"5"，ch6→"6"，ch8→"8"
cd reference\tg-rcore-tutorial\tg-rcore-tutorial-ch5
cargo clean
cargo run --features exercise 2>&1 | Tee-Object ch5-exercise.out
Get-Content ch5-exercise.out | tg-rcore-tutorial-checker --ch 5 --exercise
```

## 2. 分章实现摘要

### ch3：sys_trace

- **实现**：在 `task.rs` 维护每任务 syscall 计数；在 `main.rs` 实现 `trace_request` 0/1/2 三种模式。
- **验证**：`tg-rcore-tutorial-checker --ch 3 --exercise` → 7/7。
- **AI 作用**：解释 `trace_request` 语义、协助修复 `mod task` 与类型注解编译错误。

### ch4：mmap / munmap

- **实现**：在 `Process` 上实现 `mmap`/`munmap`；处理页对齐、权限位与区域重叠检查。
- **验证**：checker 16/16（含 ch3 继承测例）。
- **AI 作用**：对照 exercise 测例梳理 `prot` 标志与失败路径。

### ch5：spawn + stride

- **实现**：`processor.rs` stride 调度；`spawn` 从 APPS 表加载 ELF 创建子进程；`set_priority`。
- **卡点**：未设置 `CHAPTER=5` 时 `initproc` 启动 shell，QEMU 在 `>>` 挂起（非内核死循环）。
- **验证**：`CHAPTER=5` + `cargo clean` 后 checker 17/17。
- **AI 作用**：定位挂死根因为 **编译期** `option_env!("CHAPTER")` 未生效，而非 stride 逻辑错误。

### ch6：硬链接 + spawn

- **实现**：
  - `read_cstr` 读取用户态路径；`linkat`/`unlinkat`/`fstat` 对接 `easy-fs`；
  - `Stat::new()` 规避 `pad` 私有字段；`spawn` 从 `fs.img` 加载 ELF；
  - 从 ch5 迁移 `mmap`/`munmap` 到 ch6 `Process`。
- **验证**：checker **33/33**；`Test link OK!`、`Test mass open/unlink OK!` 均通过。
- **根因**：`unlink` 在持有 `fs.lock()` 时调用 `clear()` 再次 `fs.lock()`，spin 互斥锁不可重入导致子进程永久挂死、父进程 `waitpid` 阻塞。
- **AI 作用**：对照参考 `vfs.rs` 实现，定位死锁与目录项/nlink 更新顺序问题。

### ch8：死锁检测

- **实现**：在 `process.rs` 增加 `DeadlockState`（信号量银行家算法 + 互斥锁等待图）；在 `mutex_lock`/`semaphore_down` 等路径返回 `-0xDEAD`；`enable_deadlock_detect` 开关。
- **验证**：`CHAPTER=8` + exercise → checker **25/25**（含 deadlock mutex/sem 三个测例）。
- **AI 作用**：参考成熟实现结构，将检测状态与同步原语 syscall 解耦，避免改动 `tg-sync` crate。

## 3. 与参考 base 测试的关系

- **base 测试**（2026-06-19/20）：ch3/ch4/ch5/ch6/ch8 均已 PASS，见 `reference_test_report.md`。
- **exercise 测试**：在 base 之上增加编程题；ch8 官方说明 exercise 可与前期章节解耦，但 checker 仍检查继承输出。

## 4. 学习效率与 AI 协作（简要）

| 环节 | 无 AI 预估 | 实际（AI 辅助） | AI 主要贡献 |
|------|-----------|----------------|------------|
| 读 exercise 文档 | 2–4 h/章 | ~0.5 h/章 | 提炼 syscall 签名与测例期望输出 |
| 编译错误修复 | 1–3 h/章 | ~0.5 h/章 | 快速定位 E0433/E0515 等错误 |
| QEMU 挂死排查 | 4–8 h | ~2 h（ch5 CHAPTER） | 关联 `initproc` 与编译期 env |
| 死锁算法实现 | 8–12 h | ~3 h | 提供 `DeadlockState` 数据结构与钩子位置 |

## 5. 复现清单

```powershell
. .\scripts\activate-os-env.ps1

# ch3 exercise
$env:CHAPTER = "3"
cd reference\tg-rcore-tutorial\tg-rcore-tutorial-ch3
cargo clean; cargo run --features exercise 2>&1 | tg-rcore-tutorial-checker --ch 3 --exercise

# ch4–ch8 同理，CHAPTER 分别为 4/5/6/8
```

完整输出样例保存在 `os-lab/ch3-exercise.out`、`ch4-exercise.out`、`ch5-exercise.out`、`ch6-exercise-full.out`、`ch8-exercise-full.out`。

## 6. 结论

- 5 章 exercise **全部 checker 全绿**（ch3 7/7、ch4 16/16、ch5 17/17、ch6 33/33、ch8 25/25），核心 syscall 已实现并有输出证据。
- 最大工程陷阱是 **Windows 下 `CHAPTER` 必须为编译期环境变量**，需 `cargo clean` 后重编用户态。
- 自研 `os-lab`（赛题 70%）与参考 exercise（30%）现已形成「理论练习 + 自研环境」双交付主线。
