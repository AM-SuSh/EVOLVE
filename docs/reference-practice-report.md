# 参考实验环境练习实现总结报告

对应赛题 [Task.md](../Task.md) 第 1 条技术指标：在官方参考教学环境中完成 5 个基础实验 **练习（exercise）**，并总结实现过程与 AI 协作。

| 项 | 说明 |
| --- | --- |
| 参考仓库 | `reference/tg-rcore-tutorial`（branch `test`，commit `d6330a6`） |
| 练习补丁 | [reference-patches/](../reference-patches/)（已纳入 Git，可审阅 diff） |
| base 测试 | [reference_test_report.md](reference_test_report.md) |
| 环境配置 | [environment_setup.md](environment_setup.md) |

## 1. 验收总览

| 章节 | 练习内容 | checker（exercise） |
| --- | --- | --- |
| ch3 | `sys_trace` 系统调用 | **7/7** |
| ch4 | `mmap` / `munmap` | **16/16** |
| ch5 | `spawn` + stride 调度 | **17/17** |
| ch6 | `linkat` / `unlinkat` / `fstat` + spawn | **33/33** |
| ch8 | 死锁检测（银行家 + 等待图） | **25/25** |

### 环境变量说明（exercise）

exercise 模式下 `initproc` 通过编译期环境变量 `CHAPTER` 选择 usertest，而非交互式 shell。须 **`cargo clean` 后** 带 `CHAPTER` 重新编译用户程序，否则可能进入 `user_shell` 导致 QEMU 挂起。

| 章节 | `CHAPTER` 取值 |
| --- | --- |
| ch3、ch4 | 任意非负整数（如 `"3"`、`"4"`） |
| ch5 | `"5"` |
| ch6 | `"6"` |
| ch8 | `"8"` |

## 2. 分章实现摘要

### ch3：sys_trace

- **实现**：在 `task.rs` 维护每任务 syscall 计数；在 `main.rs` 实现 `trace_request` 三种模式（读计数、写内存、读内存）。
- **验证**：`tg-rcore-tutorial-checker --ch 3 --exercise` → 7/7。
- **AI 协作**：解释 `trace_request` 语义，协助修复模块声明与类型注解编译错误。

### ch4：mmap / munmap

- **实现**：在 `Process` 上实现 `mmap`/`munmap`；处理页对齐、`prot` 权限位与区域重叠检查。
- **验证**：checker 16/16（含 ch3 继承测例）。
- **AI 协作**：对照 exercise 测例梳理权限标志与失败路径。

### ch5：spawn + stride

- **实现**：`processor.rs` stride 调度；`spawn` 从 APPS 表加载 ELF；`set_priority`。
- **环境要求**：须 `CHAPTER=5` 且 `cargo clean` 后重编；`CHAPTER` 由编译期 `option_env!` 读取。
- **验证**：checker 17/17。
- **AI 协作**：区分挂起现象与 stride 逻辑，定位 `initproc` 分支选择问题。

### ch6：硬链接 + spawn

- **实现**：`read_cstr` 读取用户态路径；`linkat`/`unlinkat`/`fstat` 对接 `easy-fs`；`spawn` 从 `fs.img` 加载 ELF；从 ch5 迁移 `mmap`/`munmap`。
- **实现注意**：`unlink` 路径避免在持有 `fs.lock()` 时再次加锁（自旋锁不可重入）。
- **验证**：checker 33/33。
- **AI 协作**：对照参考 `vfs.rs`，梳理目录项与 `nlink` 更新顺序。

### ch8：死锁检测

- **实现**：在 `process.rs` 增加 `DeadlockState`（信号量银行家算法 + 互斥锁等待图）；在 `mutex_lock`/`semaphore_down` 等路径返回 `-0xDEAD`；`enable_deadlock_detect` 开关。检测状态挂在进程层，未修改 `tg-sync` crate。
- **验证**：`CHAPTER=8` + exercise → checker 25/25。
- **AI 协作**：参考成熟实现结构，将检测逻辑与同步原语 syscall 解耦。

## 3. 与 base 测试的关系

base 测试验证参考框架自带内核行为，记录见 [reference_test_report.md](reference_test_report.md)。exercise 在 base 之上增加编程题；checker 会检查继承章节的输出是否仍正确。ch8 exercise 可与前期章节解耦实现，但验收时仍检查继承输出。

## 4. AI 协作说明

各章 AI 辅助集中于：阅读 exercise 文档与 syscall 语义、编译错误定位、数据结构与钩子位置建议。所有实现均以 checker 验收为准；详细问答记录见 [ai-collaboration.md](../os-lab/docs/ai-collaboration.md) 与 [technical-proposal.md §8](technical-proposal.md)。

## 5. 复现说明

### 5.1 准备参考仓库与补丁

参考仓库体积较大未纳入 Git。clone 基线并应用补丁的步骤见 [reference-patches/README.md](../reference-patches/README.md)。

### 5.2 运行 exercise 验收

在仓库根目录激活环境后，对每章执行 `cargo clean`、`cargo run --features exercise`，输出管道至 checker。示例（ch5）：

```powershell
. .\scripts\activate-os-env.ps1
$env:CHAPTER = "5"
cd reference\tg-rcore-tutorial\tg-rcore-tutorial-ch5
cargo clean
cargo run --features exercise 2>&1 | tg-rcore-tutorial-checker --ch 5 --exercise
```

其余章节将 `--ch` 与 `CHAPTER` 分别改为 3/4/6/8。Windows 下可用 `Tee-Object` 保存输出后再喂给 checker，见 [environment_setup.md](environment_setup.md)。

## 6. 结论

五章 exercise checker 全部通过（7/7、16/16、17/17、33/33、25/25）。练习实现补丁已提交至 `reference-patches/`，与自研 `os-lab` 形成「参考练习 + 自研环境」双主线；交付索引见 [delivery-checklist.md](delivery-checklist.md)。
