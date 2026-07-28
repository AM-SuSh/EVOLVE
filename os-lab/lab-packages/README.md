# Lab 包（教学规格样板）

> 成员 A · M0 第 1 天交付。  
> 目标：把分散的 Markdown / scaffold / prompt / 验证命令收敛为**可版本化、可机器读**的 Lab 包草案。  
> **第一阶段**：用 manifest 引用现有路径，不强制立刻搬迁全部文件。

## 目录

| 路径 | 说明 |
| --- | --- |
| `lab2/` | **样板 Lab**（Trap / 系统调用 / 协作式调度） |
| `lab2/lab.yaml` | Lab 元数据、知识点索引、文件、验证、变体 |
| `lab2/concepts/` | 机制 spec（`trap.yaml`、`scheduler.yaml`） |
| `lab2/variants/` | fill / debug 学习目标与断言草案 |
| `lab2/knowledge-table.md` | Lab2 知识点细表（六层次 + 误区） |
| `../learning/rubric-v2-draft.md` | 评分细项草案 |
| `../learning/traces-lab2-mock.json` | 10 条模拟轨迹人工打分 |

## Lab1–8 课程知识盘点（第一层索引）

| Lab | 核心知识 | 源码入口（参考实现） | 主任务 | 必观证据 | 迁移场景 |
| --- | --- | --- | --- | --- | --- |
| Lab1 | 启动、链接、`no_std`、SBI | `entry.asm`、`main.rs`、`linker.ld`、`os-sbi` | 跑通 Hello | 首条输出、正常关机 | Bootloader / 固件 |
| Lab2 | Trap、syscall、上下文切换、协作调度 | `trap.rs`、`trap.asm`、`task.rs`、`os-context` | 跑通 hello/power/yield；fill/debug | 用户输出、`Yield round`×5、`All user apps exited.`；可选 `trap_enter`/`task_switch` | 抢占、VM Exit、异步运行时 |
| Lab3 | 地址空间、Sv39、页表 | `mm.rs`、`os-vm`、`os-alloc` | 独立地址空间跑用户程序 | 映射成功/缺页边界 | mmap、COW、二阶段翻译 |
| Lab4 | 进程 API | `process.rs`、`loader.rs` | fork/exec/wait | `fork_test pass` 等 | Shell、容器 |
| Lab5 | fd、管道、自旋锁 | `fs.rs`/`embedded.rs`、`sync.rs` | fs_test + pipe_test | 管道 `hi`、锁保护共享结构 | socket、事件循环 |
| Lab6 | 块设备、磁盘 FS | `virtio_block.rs`、`fs/disk.rs`、`os-fs` | `make test-lab6` | 硬链接/fstat、重启后仍在 | 存储引擎、崩溃恢复 |
| Lab7 | 统一 fd、dup、信号 | `signal.rs`、`os-signal`、`fs/disk.rs` | `make test-lab7` | dup/signal 测例 pass | 作业控制、取消机制 |
| Lab8 | 线程、阻塞同步、死锁 | `processor.rs`、`sync_syscall.rs`、`os-sync` | `make test-lab8` | 线程/锁/死锁测例 | 多核、线程池 |

> Lab2 为 M0 样板；其余 Lab 本表仅索引，完整 `lab.yaml` 后续迭代补齐。

## 与现有材料的关系

| 现有权威源 | Lab 包中的角色 |
| --- | --- |
| `labs/labN-*.md` | 学生正文（`lab.yaml.manual` 引用） |
| `labs/answers/` | 参考答案（不对学生默认暴露） |
| `scaffold/exercises/lab2/{fill,debug}/` | 变体实现文件 |
| `tutor/prompts/lab2/` | 导师上下文（后续可迁入 `lab2/tutor/`） |
| `handbook/data/labs.json` | 前端进度清单（由 C/B 后续从 `lab.yaml` 生成） |

## 协作约定（与 B/C）

- **证据命名**先冻结：`trap_enter`、`trap_exit`、`task_switch`（与 C 的 `trace-v1` 对齐）。
- **验证**：Lab2 受信 recipe 建议为 `test-lab2` / `cargo run -p kernel --features lab2 --release`，断言看输出串而非「任意退出码 0」。
- **A 不改** Monaco / SQLite / tutor-server；Day1 只交教学规格与量规草案。
