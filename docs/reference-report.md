# 参考练习实现总结报告

对应赛题第 1 条技术指标：在官方参考教学环境中完成 5 个基础实验 **练习（exercise）**。本文同时记录锁定基线下的 **base 模式** 测试结果。

| 项 | 说明 |
| --- | --- |
| 参考仓库 | `reference/tg-rcore-tutorial`（branch `test`，commit `d6330a6`） |
| 练习补丁 | [reference-patches/](../reference-patches/)（已纳入 Git，可审阅 diff） |
| 环境配置 | [environment_setup.md](environment_setup.md) |

## 1. 参考仓库基线

```text
repo:   https://github.com/rcore-os/tg-rcore-tutorial.git
branch: test
commit: d6330a6db1f81c8c1cfba5ec3db9923199398f24
local:  reference/tg-rcore-tutorial
```

赛题要求的五个基础实验章节：

```text
tg-rcore-tutorial-ch3
tg-rcore-tutorial-ch4
tg-rcore-tutorial-ch5
tg-rcore-tutorial-ch6
tg-rcore-tutorial-ch8
```

## 2. 测试环境

```text
rustc:   1.96.0
cargo:   1.96.0
QEMU:    11.0.50
checker: tg-rcore-tutorial-checker 0.4.8
```

## 3. base 模式测试结果

| 章节 | 测试类型 | 结果 | checker |
| --- | --- | --- | --- |
| ch3 | base | 通过 | 4/4 |
| ch4 | base | 通过 | 6/6 |
| ch5 | base | 通过 | 14/14 |
| ch6 | base | 通过 | 15/15 |
| ch8 | base | 通过 | 22/22 |

各章关键通过项：ch3 `write A/B/C`；ch4 含 `sbrk`；ch5 `forktest` 与子进程退出码；ch6 `file_test`；ch8 `pipetest` 及同步原语相关测例。

## 4. exercise 验收总览

| 章节 | 练习内容 | checker（exercise） |
| --- | --- | --- |
| ch3 | `sys_trace` 系统调用 | **7/7** |
| ch4 | `mmap` / `munmap` | **16/16** |
| ch5 | `spawn` + stride 调度 | **17/17** |
| ch6 | `linkat` / `unlinkat` / `fstat` + spawn | **33/33** |
| ch8 | 死锁检测（银行家 + 等待图） | **25/25** |

**环境变量说明（exercise）**

exercise 模式下 `initproc` 通过编译期环境变量 `CHAPTER` 选择 usertest，而非交互式 shell。须 **`cargo clean` 后** 带 `CHAPTER` 重新编译用户程序，否则可能进入 `user_shell` 导致 QEMU 挂起。

| 章节 | `CHAPTER` 取值 |
| --- | --- |
| ch3、ch4 | 任意非负整数（如 `"3"`、`"4"`） |
| ch5 | `"5"` |
| ch6 | `"6"` |
| ch8 | `"8"` |

## 5. 分章实现摘要

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

## 6. base 与 exercise 的关系

base 测试验证参考框架自带内核行为（见上文 §3）。exercise 在 base 之上增加编程题；checker 会检查继承章节的输出是否仍正确。ch8 exercise 可与前期章节解耦实现，但验收时仍检查继承输出。

## 7. 结论

五章 base 测试与 exercise checker 全部通过（base：4/4、6/6、14/14、15/15、22/22；exercise：7/7、16/16、17/17、33/33、25/25）。练习实现补丁已提交至 `reference-patches/`。
