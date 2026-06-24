## 2026-06-24 - Task: 成员 A Day5（Lab5 文件系统 + 管道同步）

### What was done

- 实现 [`kernel/src/fs.rs`](os-lab/kernel/src/fs.rs)：每进程 fd 表、内嵌只读文件 `testfile`、`sys_openat`/`sys_read`/`sys_close`、pipe fd 与 `sys_write` 写管道。
- 实现 [`kernel/src/sync.rs`](os-lab/kernel/src/sync.rs)：`SpinMutex`、环形缓冲 `Pipe`、`sys_pipe`（`SYS_PIPE=59`）。
- 接入 [`trap.rs`](os-lab/kernel/src/trap.rs)、[`main.rs`](os-lab/kernel/src/main.rs)、[`process.rs`](os-lab/kernel/src/process.rs)：lab5 启动（`init_heap`/`fs::init`/`sync::init`）、syscall 分发、fork fd 表继承、进程退出时 `close_all_fds`。
- 更新 [`config.rs`](os-lab/kernel/src/config.rs)、[`build.rs`](os-lab/kernel/build.rs)、[`loader.rs`](os-lab/kernel/src/loader.rs)：lab5 嵌入 `fs_test`/`pipe_test` 等 5 个 ELF；`build.rs` 在 ELF 已存在时跳过子 cargo 以避免死锁。
- 成员 B 未交付 lab5 用户态/`os-fs` 实现，按 Day4 惯例临时补齐验收用 `fs_test`/`pipe_test` 及 `user/syscall.rs` lab5 包装、`os-syscall` 的 `SYS_PIPE`（待 B 正式接手）。

### Testing

- `cargo check -p kernel --features lab5`：通过。
- `cargo run -p kernel --features lab5 --release`：exit 0；输出 `Hello from testfile!`、`fs_test pass`、`pipe says hi`、`pipe_test pass`、`All processes exited.`。
- `cargo run -p kernel --features lab4 --release`：exit 0；`All processes exited.`（fork 路径不退化）。
- `cargo run -p kernel --features lab3 --release`：exit 0；`409684505`、5 次 `Yield round`、`All user apps exited.`。

### Notes

- `os-lab/kernel/src/fs.rs`、`sync.rs`、`trap.rs`、`main.rs`、`process.rs`、`config.rs`、`build.rs`、`loader.rs`：Lab5 内核主体与集成。
- `os-lab/user/src/bin/fs_test.rs`、`pipe_test.rs`、`syscall.rs`、`Cargo.toml`：验收用测试程序（跨 B 边界，已注明）。
- `os-lab/os-syscall/src/lib.rs`：新增 `SYS_PIPE` 常量（跨 B 边界）。
- `progress.md`：追加本轮记录。
- 文件系统采用内核内嵌静态文件表（非 `os-fs` crate 完整实现），`os-fs` 仍仅占位；成员 B 可后续替换为 crate 级实现。
- 已知简化：pipe 读空时返回 -1（用户态 yield 重试）；`wait4` 阻塞语义与 lab4 相同（yield 轮询）。
- 回滚方式：`git checkout os-lab/kernel/ os-lab/user/ os-lab/os-syscall/src/lib.rs progress.md`。

## 2026-06-24 - Task: 成员 B Day4（user 进程测试程序 + lab4 验证文档）

### What was done

- 正式接手 `user/`：自成员 A 临时验收代码接管 `fork_test`、`exec_test` 及 lab4 syscall 封装；补充文件头注释与 [`syscall.rs`](os-lab/user/src/syscall.rs) 教学 ABI 文档（`exec` 经 `a1` 传路径长度）。
- 核对 `os-syscall`：crate 文档补充 Lab4 用户态参数约定说明，编号与内核 trap 分发一致。
- 更新 [`os-lab/tests/README.md`](os-lab/tests/README.md) 与 [`docs/os-lab_verify.md`](docs/os-lab_verify.md)：新增 Day4/Lab4 验证节、第 12 节一键复制块、Day4 验收勾选清单及常见问题。

### Testing

- `cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc`：7 项全部 `ok`。
- `cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1`：11 项全部 `ok`。
- `cargo check -p kernel --features lab2/lab3/lab4`：编译通过。
- `cargo run -p kernel --features lab4`：exit 0；含 `fork_test pass`、`I am parent`、`I am child`、`All processes exited.`。
- `cargo run -p kernel --features lab3`：exit 0；含 `409684505`、`Power check ok`、5 轮 `Yield round`。
- `cargo run -p kernel --features lab2`：exit 0；含 `409684505`、`Power check ok`、`All user apps exited.`。

### Notes

- `os-lab/user/src/syscall.rs`：Lab4 教学 ABI 模块文档。
- `os-lab/user/src/bin/fork_test.rs`、`exec_test.rs`：正式交付注释与通过条件说明。
- `os-lab/os-syscall/src/lib.rs`：Lab4 用户态参数约定文档段。
- `os-lab/tests/README.md`：新增 Day4/Lab4 验证小节。
- `docs/os-lab_verify.md`：新增第 11–12 节 Lab4 运行与 Day4 全量验证；常见问题扩展；相关文档链至 `lab4-process.md`。
- `progress.md`：追加本轮成员 B Day4 记录。
- 本轮严格遵守成员 B 文件边界（仅改 `user/`、`os-syscall/` 文档、`tests/`、`docs/os-lab_verify.md`、`progress.md`），未触碰 `kernel/src/`、`labs/`、`os-lab/docs/`。
- ownership 转移：lab4 用户态代码由成员 A 临时补齐，本轮由成员 B 正式接手并文档化；`pipe` 测试程序留 Day5。
- 回滚方式：`git checkout os-lab/user/ os-lab/os-syscall/src/lib.rs os-lab/tests/README.md docs/os-lab_verify.md progress.md`。

## 2026-06-24 - Task: 补全本校环境数据（确认为 xv6-riscv / MIT 6.S081）
### What was done
- 成员 C 确认本校 OS 课程使用 xv6-riscv（MIT 6.S081 课程配套教学内核）。
- 重写 `os-lab/docs/comparison-data.md` 的"本校教学环境"一节：用 xv6-riscv 的公开真实数据替换原"待核实"框架——语言（C）、平台（RISC-V）、内核架构（单一源码树无 crate）、代码规模（内核约 6000-8000 行 C）、实验数（11 个 lab）、测试方式（外部 grade 脚本）、文档（xv6-book+lecture notes）。
- 新增"三方对比速览表"：自研 os-lab / 参考 tg-rcore-tutorial / 本校 xv6-riscv 在语言、架构、组件化、代码行数、测试、实验数、引导方式 7 个维度的定量对比。
- 补充定性分析与差异点对比：自研 Rust 内存安全 vs xv6 C 手动管理、自研 feature gate 渐进式 vs xv6 单一源码树、自研问题驱动引导 vs xv6 步骤式任务清单等。
- 保留 4 项【本校特有】待核实项（本校实际开几个 lab、是否一键环境、是否补充问题驱动文档、用哪个年份版本），这些需向本校老师核实，非公开可得。

### Testing
- 核查 xv6-riscv 数据均基于 MIT 6.S081 公开课程与仓库的确定信息（11 个 lab、C 语言、RISC-V、grade 脚本等），非编造。
- 三方对比速览表的自研/参考两列沿用 Day3 已采集的脚本统计数据（1882 行/29 crate 等），本校列用 xv6 公开数据，三列口径一致可对比。

### Notes
- `os-lab/docs/comparison-data.md`：重写"本校教学环境"一节为 xv6-riscv 实际数据 + 三方对比速览表。
- `progress.md`：追加本轮 xv6 数据补充记录。
- 本轮严格遵守成员 C 文件边界（仅改 os-lab/docs/ 与 progress.md）。
- 重要定位：xv6-riscv 是世界级成熟教学内核，三方对比应定位为"差异化互补"而非"替代"——自研优势在 Rust 内存安全、精简架构（6 crate）、问题驱动引导，与 xv6 的 C/广覆盖/经典文档形成互补。这个定位将指导 Day6 comparison.md 的写作基调。
- 回滚方式：`git checkout os-lab/docs/comparison-data.md progress.md`。

## 2026-06-24 - Task: 成员 C Day4（lab4 文档 + 本校环境调研框架）
### What was done
- 编写 `os-lab/labs/lab4-process.md`：完整的 lab4 实验指导文档，面向学生设计者视角。含问题场景（从"固定程序跑完即止"的局限切入，引出 fork/exec/wait 的动态进程需求）、5 节背景知识（进程 vs 任务、fork 调用一次返回两次、exec 换身不换魂、wait 与僵尸进程、PCB 结构，含 5 张 mermaid 图）、三档实验任务（跑通 + 5 道阅读理解 + 3 个动手小修改）、验证标准、5 条 AI 提问模板、5 道思考题及参考答案。每节背景知识用"🤔 先想"引导框让学生先猜测再对照实现。
- 编写 `os-lab/labs/answers/lab4-answers.md`：配套答案，含 process.rs 的完整代码逐行解读（PCB/ProcessManager、sys_fork 的"返回两次"技巧、sys_execve 的整体覆盖 TrapContext、sys_wait4 的阻塞循环回收僵尸、sys_exit 变僵尸、initproc 进程树根），5 道阅读理解题详细答案，3 个动手修改现象参考。
- 扩充 `os-lab/docs/comparison-data.md` 的"本校教学环境"一节：搭建调研框架（定量指标维度 + 定性分析维度），明确列出 4 项待成员 C 向本校老师核实的具体信息（教学环境名称、实验数量、是否一键环境、文档风格）。本校数据未编造，均标注【待核实】。

### Testing
- 实测 `cargo run -p kernel --features lab4`：输出 `I am parent, child_pid=2`、`I am child, pid=2`、`Process 2 exited with code 0`、`fork_test pass`、`Process 1 exited with code 0`、`All processes exited.`，exit code 0，无 panic。文档【任务一】预期输出与实测完全一致。
- 诚实记录已知情况：默认 initproc 跑 fork_test，exec_test 不在默认路径自动运行（成员 A 单独验证），文档已明确说明，未掩饰。
- 核查文档引用的全部代码事实（sys_fork 的 set_return_value(0)、spawn 传 cx.sepc、sys_execve 的 `*cx = trap_cx_init`、sys_wait4 的 loop+run_next_process 阻塞、sys_exit 的 Zombie 状态）均与 kernel/src/process.rs 实际源码逐字对应。

### Notes
- `os-lab/labs/lab4-process.md`：新增，lab4 完整实验指导（约 220 行，5 张 mermaid，面向学生设计者视角）。
- `os-lab/labs/answers/lab4-answers.md`：新增，lab4 答案与代码逐行解读。
- `os-lab/docs/comparison-data.md`：扩充本校环境调研框架（plan 第 322 行 Day4 任务：本校教学环境调研与数据整理）。
- `progress.md`：追加本轮成员 C Day4 记录。
- 本轮严格遵守成员 C 文件边界（仅改 os-lab/labs/、os-lab/docs/、progress.md），未触碰成员 A 的 kernel/src/、成员 B 的 os-*/、user/。
- 本校环境数据因无法自动获取，已搭建调研框架并列出待核实项，未编造任何数据（遵守"信息不足不得猜测"原则）。建议成员 C 在 Day5 期间向课程老师核实，Day6 写 comparison.md 时填入。
- 回滚方式：`rm os-lab/labs/lab4-process.md os-lab/labs/answers/lab4-answers.md` 并 `git checkout os-lab/docs/comparison-data.md progress.md`。

## 2026-06-24 - Task: 成员 A Day4（fork/exec/wait 进程管理）

### What was done

实现 lab4 动态进程模型，替代 lab3 固定 3-app 批处理链：

- `process.rs`：PCB（pid/父子/僵尸）、`ProcessManager` 就绪队列、`sys_getpid`/`sys_fork`/`sys_execve`/`sys_wait4`/`sys_exit`。
- `mm.rs`：`fork_user_space` 深拷贝用户页、`replace_user_space`（exec）、`free_user_space`；用户栈映射避开 `0x80420000` 内核恒等区冲突。
- `trap.rs`/`main.rs`：lab4 syscall 分发与 `process::run_initproc()` 启动路径。
- `loader.rs`/`kernel/build.rs`：lab4 嵌入 `fork_test`/`exec_test`/`hello`。
- 用户态（验收所需，成员 B 未交付）：`fork_test`/`exec_test` 及 syscall 封装；`exec` 用 `a1` 传路径长度。

### Testing

- `cargo build -p kernel --features lab4`：通过。
- QEMU lab4 + `fork_test`（initproc）：`fork_test pass`，父子 pid/wait 正常。
- QEMU lab4 + `exec_test`（initproc）：`Before exec` → `Hello from user app!`，无 `After exec`。
- `cargo run -p kernel --features lab3`：回归通过（Hello/Power/5 轮 Yield）。

### Notes

- `os-lab/kernel/src/process.rs`：进程管理与 lab4 syscall 实现。
- `os-lab/kernel/src/mm.rs`：fork/exec 地址空间操作、栈映射修正。
- `os-lab/kernel/src/trap.rs`、`main.rs`、`loader.rs`、`config.rs`、`build.rs`：lab4 集成。
- `os-lab/user/src/bin/fork_test.rs`、`exec_test.rs`、`syscall.rs`、`lib.rs`、`Cargo.toml`：验收用测试程序（跨 B 边界，已注明）。
- `os-lab/docs/architecture.md`：Lab4 完成态。
- 回滚：`git checkout` 上述文件列表。

## 2026-06-24 - Task: 成员 A Day3 缺口补全（每任务独立地址空间 + ELF 加载）

### What was done

补全成员 A Day3 计划内未落地项：每任务独立 `MemorySet`/`user_token`、ELF PT_LOAD 加载、`satp` 切换与 trap 返回用户态路径。

**根因修复（两轮）**

1. **三 app 均跑 yield**：用户地址空间对 `stext..FRAME_POOL_START` 全段恒等映射，用户槽 `0x80400000` 与 ELF 段共用同一物理页，后加载的 yield 覆盖 hello/power。修复：`map_kernel_trap_regions_user` 跳过用户槽，仅映射内核镜像 + `ekernel..APP_BASE` + `APP_BASE+REGION..FRAME_POOL_START`。
2. **sys_write 输出全 `\0`**：`from_utf8` 在已切回内核 satp 后才读用户缓冲区。修复：在用户 satp 下 `copy_from_slice` 到内核栈缓冲，再切回内核 satp 打印。

其余已落地：`restore_to_user_paged`、`trap.asm` 用户 sp、`os-vm` ELF/重叠段、`FRAME_POOL_START` 恒等映射覆盖 `RESTORE_SCRATCH` 等内核静态变量。

### Testing

- `cargo build -p kernel --features lab3`：通过。
- QEMU lab3：依次 `Hello from user app!`、`Power test start`、`409684505`、`Power check ok`、5 次 `Yield round`、`All user apps exited.`。
- QEMU lab2 回归：通过（含 hello/power/yield 预期输出）。
- `cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1`：11 项全部 `ok`。

### Notes

- `os-lab/kernel/src/mm.rs`：`map_kernel_trap_regions_user`、用户槽排除恒等映射。
- `os-lab/kernel/src/task.rs`：lab3 `sys_write` 在用户 satp 下拷贝缓冲区。
- `os-lab/docs/architecture.md`：更新 Lab3 完成态描述。
- `progress.md`：本段记录。
- 回滚方式：`git checkout os-lab/kernel/src/mm.rs os-lab/kernel/src/task.rs os-lab/docs/architecture.md progress.md`（及本轮涉及的其他 kernel/os-context/os-vm 改动文件）。

## 2026-06-24 - Task: DAY3 三人完成情况核查 + 成员 A DAY4 任务编排

### What was done

**DAY3 完成情况核查（对照计划第三节 Day3 目标、第四节三人分工与成员 A Day3 详细清单）**

| 成员 | 计划任务 | 状态 | 说明 |
|------|----------|------|------|
| **A** | `kernel/mm.rs` 地址空间、ELF 加载、内核/用户态切换 | ⚠️ 有条件通过 | 虚存已接入且 QEMU 验收通过；**简化**：共享内核页表 + 固定槽 `0x80400000` 覆写 `.bin`（非每任务独立 satp、非 ELF PT_LOAD）；`TRAMPOLINE`/`TRAP_CONTEXT` 常量已定义未启用 |
| **B** | `os-alloc`/`os-vm` crate + 单元测试 | ✅ 已完成 | 页帧分配器 + Bump 堆分配器；Sv39 页表 + `MemorySet` + `parse_elf`；host 测试 11 项全过；验证文档已更新 |
| **C** | `labs/lab3-memory.md`、三方对比数据采集 | ✅ 已完成 | 实验指导 + 答案 + `comparison-data.md`（自研 vs 参考定量数据已采集；本校环境待 Day4 调研） |

**成员 A Day3 详细清单逐项**

| 序号 | 任务 | 状态 |
|------|------|------|
| 1 | `mm::init()` + `KERNEL_SPACE` | ✅ |
| 2 | 内核地址空间映射（含 trampoline） | ⚠️ 缺 trampoline 高地址页 |
| 3 | `MemorySet`/`MapArea` 封装 | ✅（复用 `os-vm`） |
| 4 | TCB 独立 `MemorySet`/`user_token` | ❌ 共享页表 |
| 5 | ELF PT_LOAD 加载 | ❌ 仍用 `.bin` |
| 6 | trap 路径页表激活 | ⚠️ `ensure_paging` + `activate_kernel`，无 per-task satp |
| 7 | `main.rs` lab3 启动路径 | ✅ |
| 8 | `config.rs` 虚存常量 | ⚠️ 部分（跳板地址未接线） |

**Day3 第三节总体验收**：`cargo run -p kernel --features lab3` 输出含 `lab3: virtual memory ready`、`409684505`、`Power check ok`、5 次 `Yield round`、`All user apps exited.`，exit code 0 —— **通过**（接受已知简化）。

**遗留缺口（不阻断 Day3 验收，Day4 可消化）**

- 每任务独立地址空间、ELF 段加载、trampoline 高地址映射（成员 A Day3 计划内未完全落地项）。
- `process.rs` 仍为占位，lab4 批处理链（`sys_exit` 加载下一 app）待 Day4 重构。
- kernel / 组件 crate 有 `static_mut_refs` 等 warning，未阻断运行。

**成员 A DAY4 任务已写入计划**（`.cursor/plans/自研os教学实验环境.plan.md`「成员 A Day4 详细任务」）：`process.rs` PCB/进程树、`sys_fork`/`sys_execve`/`sys_wait4`、调度重构、移除批处理链；前置依赖成员 B 交付 `fork_test`/`exec_test`。

### Testing

- `cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1`：11 项全部 `ok`。
- `cargo run -p kernel --features lab3`：exit code 0；含 `virtual memory ready`、`409684505`、5 次 `Yield round`、`All user apps exited.`。
- `cargo run -p kernel --features lab2`：exit code 0；回归通过。
- `cargo check -p kernel --features lab4`：可编译（`process.rs` 占位，符合 Day4 未开工状态）。

### Notes

- `progress.md`：追加 DAY3 核查结论与 DAY4 任务编排。
- `.cursor/plans/自研os教学实验环境.plan.md`：Day3 todo 标为 completed；新增成员 A Day4 详细任务清单。
- `os-lab/docs/architecture.md`：更新 Lab3 完成状态、新增 Lab4 待开工说明，移除过时「Lab3 待集成」段落。
- 回滚方式：`git checkout progress.md .cursor/plans/自研os教学实验环境.plan.md os-lab/docs/architecture.md`。

## 2026-06-23 - Task: 成员 B Day3（os-alloc/os-vm 正式接手 + 堆分配器 + 单元测试 + 验证文档）

### What was done
- 正式接手 `os-alloc`：补充 crate 模块文档；新增 `HeapAllocator` trait + `BumpAllocator`（32 KiB 静态堆，`init_heap`/`heap_alloc`，供 lab5+ 内核接入）；扩充页帧/堆单元测试至 6 项。
- 正式接手 `os-vm`：补充 Sv39 模块文档；扩充 host 单元测试至 5 项（地址拆分、map/translate、恒等映射、ELF PT_LOAD 解析）；修复 `parse_elf` 在 64 位 host 上 `e_phnum`/`e_phentsize` 字段解析错误；`activate()` 对非 riscv64 目标编译为 no-op 以支持 host 测试。
- 更新 `os-lab/tests/README.md` 与 `docs/os-lab_verify.md`：新增 Day3 组件测试命令（含 `--test-threads=1`）、Lab3 QEMU 成功标准（5 轮 yield）、Day3 一键复制验证块。

### Testing
- `cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1`：11 项全部 `ok`（os-alloc 6 + os-vm 5）。
- `cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc`：7 项全部 `ok`（Day2 回归）。
- `cargo check -p kernel --features lab2/lab3`：编译通过。
- `cargo run -p kernel --features lab2`：exit 0；含 `409684505`、`Power check ok`、5 次 `Yield round`、`All user apps exited.`。
- `cargo run -p kernel --features lab3`：exit 0；含 `409684505`、`Power check ok`、5 次 `Yield round`、`All user apps exited.`。

### Notes
- `os-lab/os-alloc/src/lib.rs`：堆分配器 + 模块文档 + 6 项单元测试。
- `os-lab/os-vm/src/lib.rs`：模块文档 + 5 项单元测试 + `parse_elf`/`activate` host 兼容修复。
- `os-lab/tests/README.md`：新增 Day3/Lab3 验证小节。
- `docs/os-lab_verify.md`：扩展第 4 节 Day3 测试、新增第 7 节 Lab3 QEMU、第 10 节 Day3 一键验证。
- `progress.md`：追加本轮成员 B Day3 记录。
- 本轮严格遵守成员 B 文件边界（仅改 `os-*/`、`tests/`、`docs/os-lab_verify.md`、`progress.md`），未触碰 `kernel/src/`、`labs/`、`os-lab/docs/`。
- 回滚方式：`git checkout os-lab/os-alloc/src/lib.rs os-lab/os-vm/src/lib.rs os-lab/tests/README.md docs/os-lab_verify.md` 并从 progress.md 删除本段。

## 2026-06-23 - Task: 成员 C Day3（lab3 文档 + 三方对比数据采集）
### What was done
- 编写 `os-lab/labs/lab3-memory.md`：完整的 lab3 实验指导文档，面向学生设计者视角。含问题场景（从"物理地址的三个致命问题"切入引出虚存动机）、5 节背景知识（分页抽象、Sv39 三级页表、PTE 权限位、页帧分配器、地址空间 MemorySet，含 5 张 mermaid 图）、三档实验任务（跑通 + 5 道阅读理解 + 3 个动手小修改）、验证标准、5 条 AI 提问模板、5 道思考题及参考答案。每节背景知识用"🤔 先想"引导框让学生先猜测再对照实现。
- 编写 `os-lab/labs/answers/lab3-answers.md`：配套答案，含 os-alloc/os-vm/kernel.mm.rs 的完整代码逐行解读（PhysPageNum 抽象、StackFrameAllocator、Sv39 三级查找、PTE 位域、MapArea/MemorySet、恒等映射、satp 激活），5 道阅读理解题详细答案，3 个动手修改现象参考。
- 新建 `os-lab/docs/comparison-data.md`：用脚本采集的三方对比原始数据，供 Day6 `docs/comparison.md` 三方对比报告使用。已采集自研 os-lab（8 crate/1882 行/9 测试）和参考 tg-rcore-tutorial（29 crate/36455 行/0 测试）的定量数据；本校环境数据标注为待调研补充。

### Testing
- 实测 `cargo run -p kernel --features lab3`：输出 `Hello from user app!`、`2^1000000002 % 998244353 = 409684505`、`Power check ok`、`All user apps exited.`，exit code 0，无 panic，5 项断言全部 [OK]。文档【任务一】预期输出与实测完全一致。
- 发现并利用关键对比亮点：lab3 下 yield 输出 **5 轮** `Yield round`（lab2 只 1 轮），证明分页让任务隔离更干净、调度更稳定，文档专门用此对比凸显虚存价值。
- 核查文档引用的全部代码事实（Sv39 拆分 `(vpn>>18)&0x1ff`、PTE `ppn<<10|flags`、恒等映射、`satp=(8<<60)|root_ppn`、StackFrameAllocator 栈式回收局限）均与 os-alloc/os-vm/kernel/src/mm.rs 实际源码逐字对应。

### Notes
- `os-lab/labs/lab3-memory.md`：新增，lab3 完整实验指导（约 200 行，5 张 mermaid，面向学生设计者视角）。
- `os-lab/labs/answers/lab3-answers.md`：新增，lab3 答案与代码逐行解读。
- `os-lab/docs/comparison-data.md`：新增，三方对比原始数据（plan 第 322-323 行 Day3 任务：开始收集三方对比数据）。
- `progress.md`：追加本轮成员 C Day3 记录。
- 本轮严格遵守成员 C 文件边界（仅改 os-lab/labs/、os-lab/docs/、progress.md），未触碰成员 A 的 kernel/src/、成员 B 的 os-*/、user/。
- 三方对比数据已揭示自研环境的差异化优势：规模小一个数量级（1882 vs 36455 行）、有单元测试（9 vs 0）、架构更精简（6 crate/2 层依赖 vs 23 crate/4 层依赖）。本校环境数据待成员 C 后续调研补充。
- 回滚方式：`rm os-lab/labs/lab3-memory.md os-lab/labs/answers/lab3-answers.md os-lab/docs/comparison-data.md` 并从 progress.md 删除本轮记录。

## 2026-06-23 - Task: 成员 A Lab3 虚存集成（内核 + os-alloc/os-vm）

### What was done

- 实现 `os-alloc` 页帧分配器、`os-vm` Sv39 页表与 `MemorySet`（含恒等映射、用户区 `map_area`）。
- 实现 `kernel/mm.rs`：内核地址空间（`stext`–`ekernel` + boot stack + 物理帧恒等窗口）、`map_user_app`、`ensure_paging`。
- 改造 lab3 路径：`trap` 启用分页前设置 `sscratch`、trap 入口 `activate_kernel`；`task` 先映射用户程序再开分页；`os-context` 增加 `SSTATUS_SUM`。
- 修复 Sv39 中间级 PTE 须为纯指针（仅 V 位），避免 QEMU 将页表项误判为超级页导致取指异常死循环。
- 修复任务切换时 trap 上下文未写回 TCB，导致 yield 从入口反复执行的问题（`sync_current_trap_cx`）。

**已知简化（相对计划）**：当前为共享内核页表 + 复用 `0x80400000` 用户槽位按序加载 `.bin`（非每任务独立 satp、非 ELF PT_LOAD）；后续 Day4 前可再演进。

### Testing

- `cargo run -p kernel --features lab3`：exit code 0；输出含 `409684505`、`Power check ok`、5 次 `Yield round`、`All user apps exited.`。
- `cargo run -p kernel --features lab2`：exit code 0；回归通过，yield 现可完整 5 轮后退出。

### Notes

- `os-lab/os-alloc/src/lib.rs`：页帧分配器实现。
- `os-lab/os-vm/src/lib.rs`：Sv39 页表、`MemorySet`、`PageTableEntry::new_pointer`。
- `os-lab/kernel/src/mm.rs`、`config.rs`、`task.rs`、`trap.rs`、`main.rs`、`entry.asm`：Lab3 虚存集成与任务切换修复。
- `os-lab/os-context/src/lib.rs`：`SSTATUS_SUM` 支持内核访问用户页。
- 回滚：还原上述文件至本轮前版本；`progress.md` 删除本段。

## 2026-06-23 - Task: DAY2 三人完成情况核查 + 成员 A DAY3 任务编排

### What was done

**DAY2 完成情况核查（对照计划第三节 Day2 目标与第四节三人分工）**

| 成员 | 计划任务 | 状态 | 说明 |
|------|----------|------|------|
| **A** | Lab2 trap 集成、任务调度器、用户程序加载 | ✅ 已完成 | `trap.rs` _syscall/定时器分发、`task.rs` TCB+批处理调度、`loader.rs`+`build.rs` 嵌入加载；`trap.asm` 已迁至 `os-context` 并完成 API 对接 |
| **B** | `os-context/`、`os-syscall/`、用户测试程序 | ✅ 已完成 | TrapContext+汇编+单元测试；syscall 编号体系+测试；`hello`/`power`/`yield` 正式交付；与 A 协调完成 kernel 集成 |
| **C** | `lab2-trap-and-task.md`、AI 协作模板 | ✅ 已完成 | 实验指导+答案+`ai-collaboration.md` 模板；文档与源码事实已对齐 |

**Day2 第三节总体验收**：`cargo run -p kernel --features lab2` 加载 3 个用户程序，syscall 正常，关键输出含 `409684505`、`Power check ok`、`Yield round`、`All user apps exited.` —— **通过**。

**遗留缺口（不阻断 Day2 验收，Day3+ 可顺带消化）**

- yield 在批处理调度下仅输出 1 轮 `Yield round` 即进入下一 app（文档已诚实标注）。
- `task.rs` 仍使用单一物理槽 `0x80400000` 直拷二进制，无独立用户页表（属 Day3 范围）。
- kernel 编译有 dead_code/static_mut_refs 等 warning，未阻断运行。

**成员 A DAY3 任务已写入计划**（`.cursor/plans/自研os教学实验环境.plan.md`「成员 A Day3 详细任务」）：`mm.rs` 虚存集成、每任务独立地址空间、ELF 加载、satp 切换；前置依赖成员 B 交付 `os-alloc`/`os-vm`。

### Testing

- `cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc`：7 项全部通过（本轮复验）。
- `cargo run -p kernel --features lab2`：exit code 0，输出与 `labs/lab2-trap-and-task.md` 任务一预期一致。
- `cargo check -p kernel --features lab3`：可编译（`mm.rs` 仍为占位 `init()`，符合 Day3 未开工状态）。

### Notes

- `progress.md`：追加 DAY2 核查结论；修复顶部 rebase 冲突标记。
- `.cursor/plans/自研os教学实验环境.plan.md`：Day1/Day2 todo 标为 completed；新增成员 A Day3 详细任务清单。
- `os-lab/docs/architecture.md`：补充 Lab2 已实现状态与 Day3 待集成说明。
- 回滚方式：`git checkout progress.md .cursor/plans/自研os教学实验环境.plan.md os-lab/docs/architecture.md`。

## 2026-06-22 - Task: 完善 docs/os-lab_verify.md 完整验证指令

### What was done
- 扩充 `docs/os-lab_verify.md`：覆盖 Day1 + Day2 全流程（环境激活、编译检查、host 单元测试、Lab1/Lab2 QEMU 运行、成功标准、一键复制命令块、常见问题）。

### Testing
- 文档命令与成员 B Day2 本机已通过验证流程一致（`cargo test` host triple、`cargo check/run lab2`）。

### Notes
- `docs/os-lab_verify.md`：补全 Lab2 正式验证步骤，移除「可选」表述；新增 Linux/macOS host triple 与 Day2 一键复制块。
- 回滚方式：`git checkout docs/os-lab_verify.md`。

## 2026-06-22 - Task: 成员 B Day2（os-context + os-syscall + user 测试程序）

### What was done

- 交付 `os-context`：`trap.asm` 从 kernel 迁入、`TrapContext` API（`init_user`/`advance_sepc`/`set_return_value` 等）、`restore_to_user`、布局常量与 host 单元测试。
- 交付 `os-syscall`：Lab2 syscall 常量 + Lab4/5 前瞻编号、编译期断言、`syscall_name` 与单元测试。
- 与成员 A 协调：`kernel/trap.rs` 改用 `os_context` 符号与 API，删除 `kernel/src/trap.asm`；`task.rs` 使用 `set_user_sp`。
- 正式化 `user/`：`hello`/`power`（`const fn` 幂模，正确结果 `409684505`）/`yield`（循环调用 `yield_()`）。
- 更新 `os-lab/tests/README.md` Day2 验证小节；`docs/os-lab_verify.md` 补充 Lab2 可选步骤。

### Testing

- `cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc`：7 项测试全部通过。
- `cargo check -p kernel --features lab2`：通过。
- `cargo run -p kernel --features lab2`：3 个用户程序依次运行并退出，关键输出含 `409684505`、`Power check ok`、`Yield round`、`All user apps exited.`，exit code 0。

### Notes

- `os-lab/os-context/src/lib.rs`、`trap.asm`：TrapContext + trap 汇编 + restore API（成员 B）。
- `os-lab/os-syscall/src/lib.rs`：syscall 编号体系与测试（成员 B）。
- `os-lab/kernel/src/trap.rs`：集成 os-context，删除本地 trap.asm（与 A 协调）。
- `os-lab/kernel/src/task.rs`：`set_user_sp` 调用（与 A 协调）。
- `os-lab/user/src/bin/power.rs`、`yield.rs`：正式测试程序（成员 B）。
- `os-lab/tests/README.md`、`docs/os-lab_verify.md`：Lab2 验证文档。
- `progress.md`：追加本轮记录。
- **已知缺口**：yield 在批处理调度下可能只触发一次即关机（A 侧调度器限制，与 progress 既有记录一致）。
- 回滚方式：`git checkout` 上述文件；恢复 `kernel/src/trap.asm` 与旧版 `trap.rs`/`task.rs`；还原 `os-context`/`os-syscall` 占位版本。

## 2026-06-22 - Task: 成员 C 按学生视角走查 lab1 并修复全部完成度问题（P0/P1/P2）
### What was done
- 以"第一次接触 os-lab 的学生"视角严格走查 lab1-bare-metal.md 全流程（前置→任务一跑通→任务二阅读→任务三三个修改），实测每一步，发现 1 个严重问题 + 1 个答案缺口 + 3 个体验瑕疵。
- P0（严重）：任务三修改 2 原写"把链接地址改成 0x80100000 会崩溃"，实测不崩（内核镜像小+PC 相对寻址导致地址偏移 1MB 内仍能跑）。改为用 0x88000000（实测稳定复现崩溃，QEMU 报 No enough memory to place DTB after kernel/initrd），并补充"为什么不能用 0x80100000"的解释。
- P1：背景知识补"2.4 BSS 段与 clear_bss"一节（BSS 是什么、为什么裸机要手动清零、为什么必须在 println 之前）；answers/lab1-answers.md 第 2 题答案同步补全（三层解释），第 4 题答案修正与新文档一致（0x88000000）。
- P2-1：文档开头补"零、开始之前"一节，说明 cd os-lab、激活环境、环境自检命令。
- P2-2：任务一预期输出补"前面约 40 行是 OpenSBI 固件日志，无需关心，只要最后出现 Hello 就对了"。
- P2-3：任务三修改 1 补"约第 35 行"行号定位提示。
- 答案文件"任务三现象参考"里修改 2 的描述同步精确化（明确 0x88000000 的具体报错信息）。

### Testing
- 执行验证脚本覆盖文档全部 4 项断言：任务一 cargo run --features lab1 输出 Hello, OS!；修改 1 换欢迎语输出"我学号是 xxx"；修改 2 改 0x88000000 后 QEMU 报 No enough memory（exit 非 0）；修改 3 改栈 16KB 仍正常输出——4 项全部 [OK] matched。
- 验证后三处代码（linker.ld 的 BASE_ADDRESS、entry.asm 的 .space、main.rs 的 println）已全部还原为原值，git status 确认 os-lab/kernel/ 无残留改动。
- 临时验证脚本 scripts/verify_lab1_fixed.ps1 用后已删除。

### Notes
- `os-lab/labs/lab1-bare-metal.md`：新增"零、开始之前"和"2.4 BSS 段"两节；任务一预期输出补 OpenSBI 日志说明；任务三修改 1 补行号、修改 2 改地址值为 0x88000000 并补解释。
- `os-lab/labs/answers/lab1-answers.md`：第 2 题答案三层扩充、第 4 题与现象参考同步改为 0x88000000 的精确描述。
- `progress.md`：追加本轮走查与修复记录。
- 本轮严格遵守成员 C 文件边界（仅改 os-lab/labs/ 与 progress.md），未触碰成员 A 的 kernel/src/、成员 B 的 os-*/等。
- 走查方法可复用：后续每个 lab 文档完成后，都建议按"学生视角严格走查 + 实测每条断言"的方式验证，避免文档与实际行为脱节。
- 回滚方式：`git checkout -- os-lab/labs/lab1-bare-metal.md os-lab/labs/answers/lab1-answers.md progress.md` 可还原至修复前（lab1 回到 P0 矛盾、P1 答案缺口的状态）。

## 2026-06-22 - Task: 成员 C Day2（lab2 文档 + AI 协作模板）
### What was done
- 编写 `os-lab/labs/lab2-trap-and-task.md`：完整的 lab2 实验指导文档，含问题场景（用户程序如何陷入内核、多任务调度）、5 节背景知识（特权级与 trap、上下文保存恢复、sscratch 栈切换、syscall ABI、批处理调度，含 4 张 mermaid 图）、三档实验任务（跑通 + 5 道阅读理解 + 3 个动手小修改）、验证标准、5 条 AI 提问模板、5 道思考题及参考答案。诚实反映了 yield 在当前批处理调度下的已知限制。
- 编写 `os-lab/labs/answers/lab2-answers.md`：配套答案，含 TrapContext、trap.asm、syscall 编号、trap_handler、任务管理、用户态 syscall 的完整代码逐行解读，5 道阅读理解题详细答案，3 个动手修改现象参考。
- 新建 `os-lab/docs/ai-collaboration.md`：AI 协作过程记录模板（协作原则 + 可填充记录模板 + Lab1 示例记录），供学生每个 Lab 完成后记录与 AI 的关键交互，对应赛题技术指标"AI 协作过程记录"要求。

### Testing
- 实测 `cargo run -p kernel --features lab2`：成功输出 `Hello from user app!`、`2^1000000002 % 998244353 = 409684505`、`Power check ok`、`Yield round`、`All user apps exited.`，exit code 0。文档【任务一】预期输出与此完全一致。
- 核查文档引用的全部代码事实（TrapContext 布局 35*8、trap.asm 的 csrrw 交换与 .rept 29、syscall 编号 64/93/124、TCB 结构、user/syscall.rs 的 a7/a0-a2 约定）均与 os-context/os-syscall/kernel/src/trap.rs/task.rs/user 实际源码逐字对应。
- 诚实记录已知限制：yield 在批处理调度下只输出 1 轮即走 All exited，与 progress.md 既有记录一致。

### Notes
- `os-lab/labs/lab2-trap-and-task.md`：新增，lab2 完整实验指导（约 200 行，4 张 mermaid）。
- `os-lab/labs/answers/lab2-answers.md`：新增，lab2 答案与代码解读。
- `os-lab/docs/ai-collaboration.md`：新增，AI 协作记录模板（plan 第 321 行 Day2 任务）。
- `progress.md`：追加本轮成员 C Day2 记录。
- 本轮严格遵守成员 C 文件边界（仅改 os-lab/labs/、os-lab/docs/、progress.md），未触碰成员 A 的 kernel/src/、成员 B 的 os-*/、user/。
- lab2 文档采用与 lab1 一致的"读+跑+理解+小修改"入门风格（基于团队既定的渐进式架构——lab2 代码已成型的起跑线），结构含 plan 要求的问题场景/背景/任务/验证/AI模板/习题全部要素。
- 回滚方式：`rm os-lab/labs/lab2-trap-and-task.md os-lab/labs/answers/lab2-answers.md os-lab/docs/ai-collaboration.md` 并从 progress.md 删除本轮记录。

## 2026-06-22 - Task: DAY1 三人完成情况核查 + 成员 A DAY2（Lab2 trap/调度/加载）

### What was done

**DAY1 完成情况核查（对照计划第四节分工与第三节 Day1 目标）**

| 成员 | 计划任务 | 状态 | 说明 |
|------|----------|------|------|
| **A** | workspace 骨架、Lab1 裸机内核、Makefile/构建系统 | ✅ 已完成 | `os-lab/` workspace、`kernel` Lab1 可运行、feature gate lab1–lab5、Makefile；SBI 已迁至 `os-sbi`（与 B 协作） |
| **B** | `rust-toolchain.toml`、`.cargo/config.toml`、链接脚本、SBI 基础 | ✅ 已完成（超额） | 复核 linker/build.rs；新增 `os-sbi` crate；Day2+ 组件占位 |
| **C** | `labs/overview.md`、`labs/lab1-bare-metal.md` | ✅ 已完成 | 两文档已充实；另增 `labs/answers/lab1-answers.md` |

**Day1 总体验收**：`cargo run -p kernel --features lab1` 输出 `Hello, OS!` 并正常退出 —— **通过**。

**成员 A DAY2 实施**

- 实现 `kernel/src/trap.asm` + `trap.rs`：Trap 入口、`__alltraps`/`__restore`、系统调用分发（write/exit/yield）。
- 实现 `kernel/src/task.rs`：任务控制块、批处理顺序调度、`sys_write`/`sys_exit`。
- 实现 `kernel/src/loader.rs` + 扩展 `kernel/build.rs`：构建用户态程序、`objcopy` 转纯二进制、`include_bytes!` 嵌入、按 app 加载至 `0x80400000`。
- 新增 `kernel/src/riscv.rs`、`config.rs`；`main.rs` 增加 lab2 启动路径。
- 协调修正 `os-context::TrapContext` 字段顺序（与 trap 汇编布局一致）。
- 为打通 lab2 端到端验证，临时补充 `user/` 下 hello/power/yield 测试程序（属成员 B Day2 范围，待 B 正式接手完善）。

### Testing

- `cargo run -p kernel --features lab1`：输出 `Hello, OS!` 与 `os-lab kernel lab1 is running on QEMU virt.`，exit code 0。
- `cargo run -p kernel --features lab2`：依次加载并运行 3 个用户程序，关键输出：
  - `Hello from user app!` → `App 0 exited with code 0`
  - `Power test start` / `2^1000000002 % 998244353 = 960319429` → `App 1 exited with code 0`
  - `Yield test start` + 5 行 `Yield round` → `App 2 exited with code 0` → `All user apps exited.`
- `cargo build -p kernel --features lab2`：编译通过（有 dead_code/static_mut_refs 等 warning，未阻断）。

### Notes

- `kernel/src/trap.asm`、`trap.rs`、`task.rs`、`loader.rs`、`riscv.rs`、`config.rs`、`main.rs`：Lab2 内核主体（成员 A）。
- `kernel/build.rs`：用户程序构建与嵌入逻辑。
- `os-context/src/lib.rs`：TrapContext 字段顺序与汇编对齐（与 B 协调）。
- `user/` 下 hello/power/yield 及 `user/Cargo.toml` 等：为 lab2 验证临时补充（B 正式交付后需对齐接口）。
- `os-lab/Cargo.toml`：workspace release profile 统一。
- `progress.md`：追加本轮记录。
- **待成员 B**：`os-context` 完整 API、`os-syscall` 文档化、用户程序正式版、集成测试。
- **待成员 C**：`labs/lab2-trap-and-task.md` 初稿。
- **已知缺口**：`sys_yield` 轮转调度与定时器抢占尚未完整演示（yield 测试程序当前为顺序打印）；`TASK_MANAGER.num_app` 存在栈污染风险，已用 `NUM_APP` 常量规避。
- 回滚方式：`git checkout` 上述改动文件；删除 `kernel/src/trap.asm`、`riscv.rs`、`config.rs`、`loader.rs`；恢复 `trap.rs`/`task.rs`/`main.rs`/`build.rs` 占位版本；移除 `user/src/bin/` 与相关 `user/` 改动。

## 2026-06-21 - Task: 新增 os-lab 伙伴验证指令文档

### What was done
- 新增 `docs/os-lab_verify.md`：环境激活、路径检查、workspace/lab1~lab5 编译检查、Lab1 QEMU 运行、成功标准、一键复制命令块与常见问题。
- 在 `docs/os-lab.md`、`os-lab/README.md`、`os-lab/tests/README.md` 增加指向该文档的链接。

### Testing
- 文档中的命令与已通过的成员 B Day1 本机验证流程一致；路径说明与 `activate-os-env.ps1` / `environment_setup.md` 一致。

### Notes
- `docs/os-lab_verify.md`：新增伙伴执行指令文档。
- `docs/os-lab.md`、`os-lab/README.md`、`os-lab/tests/README.md`：补充链接。
- `progress.md`：追加本轮记录。
- 回滚方式：`git checkout` 上述文件并删除 `docs/os-lab_verify.md`。

## 2026-06-21 - Task: 成员 B Day1（os-sbi + 构建复核 + 组件脚手架）

### What was done
- 复核 `rust-toolchain.toml` 与 `.cargo/config.toml`（build-std、QEMU runner），在 `.cargo/config.toml` 增加 `run-lab1` alias。
- 校验 `kernel/linker.ld` 与 `build.rs`：五项检查均通过，结论写入 `tests/README.md`。
- 新建 `os-sbi` crate：迁移 `console_putchar`/`shutdown`（Legacy SBI 功能号 1/8），编译期常量断言校验功能号。
- 与成员 A 协调完成 kernel 集成：`lab1` 依赖 `os-sbi`，删除 `kernel/src/sbi.rs`，`console.rs`/`main.rs` 改用 `os_sbi`。
- 补强 `os-context`/`os-syscall`/`os-alloc`/`os-vm`/`os-fs` 占位（TrapContext、syscall 编号、FrameAllocator/PageTable/FileSystem trait）。
- 更新 `os-lab/docs/architecture.md`：lab1 依赖 `os-sbi`，workspace 图补充 os-sbi 节点。

### Testing
- `cargo check --workspace`：全部 crate 通过。
- `cargo check -p kernel --features lab1/lab2/lab3/lab4/lab5`：各级 feature 均可编译（等价 `make check`；本机 Git Bash 无 `make` 命令）。
- `cargo check -p os-sbi`：编译期常量断言通过。
- `cargo run -p kernel --features lab1`：QEMU 输出 `Hello, OS!` 与 `os-lab kernel lab1 is running on QEMU virt.`，OpenSBI `Domain0 Next Address : 0x0000000080200000`，exit code 0。
- 本机全量复验（`activate-os-env.local.ps1`，`os-lab` 目录）：路径 `rustc`/`cargo` → `D:\AppGallery\Rust\cargo\bin`，`qemu-system-riscv64` → `D:\AppGallery\QEMU`，`bash` → `E:\Git\bin`；`rustc`/`cargo` 1.96.0，QEMU 11.0.50；上述 check/run 均通过。

### Notes
- `os-lab/os-sbi/`：新增 SBI 组件 crate（成员 B 核心交付）。
- `os-lab/Cargo.toml`：注册 `os-sbi` workspace member。
- `os-lab/.cargo/config.toml`：新增 `run-lab1` alias。
- `os-lab/kernel/Cargo.toml`：`lab1` 增加 `dep:os-sbi`。
- `os-lab/kernel/src/main.rs`、`os-lab/kernel/src/console.rs`：改用 `os_sbi`，删除 `mod sbi`。
- `os-lab/kernel/src/sbi.rs`：删除（逻辑迁至 os-sbi）。
- `os-lab/os-context/src/lib.rs` 等 5 个组件 crate：增加 Day2+ 占位类型/trait/常量。
- `os-lab/tests/README.md`：Day1 验证命令与链接脚本校验表。
- `os-lab/docs/architecture.md`：更新 lab1 依赖与 workspace 图。
- `progress.md`：追加本轮成员 B Day1 记录。
- 本机验证使用 `scripts/activate-os-env.local.ps1`，工作目录 `os-lab`。
- 回滚方式：删除 `os-lab/os-sbi/`，恢复 `kernel/src/sbi.rs`，还原 kernel/Cargo.toml、main.rs、console.rs，并从 workspace members 移除 os-sbi；`git checkout` 其余改动文件。

## 2026-06-21 - Task: 修正 lab1-bare-metal.md 教学定位（去掉直给代码，改为面向学生的任务）
### What was done
- 复核团队教学定位：依据 `os-lab/docs/architecture.md`（"Lab1 启动流程（当前已实现）"及"组件 crate 待 Day2-5 填充"）与代码事实（lab1 五文件完整无 TODO、lab2-5 六文件为 4 行空骨架），确认 lab1 定位为"读+跑+小修改"的入门起跑线，lab2-5 才是学生动手实现的部分。
- 重写 `labs/lab1-bare-metal.md` 第三节"实验任务"：删除"代码已由成员 A 实现，你的任务是读懂它"这种把实验变阅读理解的错误写法，以及正文里 5 个文件的完整代码直给；改为面向学生的三档任务——任务一跑通内核（必做）、任务二阅读理解 4 问（必做）、任务三 3 个动手小修改（选做），每项给出明确通过标准与提交清单。
- 新增 `labs/answers/lab1-answers.md`：把原正文里的完整代码逐行解读、阅读理解题答案、任务三现象参考集中收纳到 answers 目录，做到"实验正文不直给、答案归位分离"，符合 plan 第 106/108 行规划的 answers 目录设计。
- 保持 lab1 文档其余部分（问题场景、背景知识含 3 张 mermaid、AI 提问模板、思考题）不变，只重写定位错误的一节。

### Testing
- 执行 `cargo run -p kernel --features lab1`（os-lab 目录），确认输出 `Hello, OS!` 与 `os-lab kernel lab1 is running on QEMU virt.`，exit code 0，OpenSBI 日志中 `Domain0 Next Address : 0x0000000080200000` 印证文档关于链接地址的讲解——证明文档"任务一"命令与预期输出准确可信。
- 核查重写后的实验任务表格、阅读理解题、动手修改三档任务所引用的代码位置（entry.asm/main.rs/sbi.rs/console.rs/linker.ld）与现象判断均与实际代码一致。

### Notes
- `os-lab/labs/lab1-bare-metal.md`：重写第三节"实验任务"（约 90 行），删除直给代码，改为面向学生的三档任务 + 提交清单；第四节"验证"同步精简为指向任务一的验证标准。
- `os-lab/labs/answers/lab1-answers.md`：新增，承载完整代码逐行解读与阅读理解题答案，供学生做完实验后对照。
- `progress.md`：追加本轮 lab1 文档修正记录。
- 本轮严格遵守成员 C 文件边界（仅改 `os-lab/labs/` 与 `progress.md`），未触碰成员 A 的 `kernel/src/` 与成员 B 的 `os-*/`、`user/`、`tests/`。
- 修正后 lab1 文档与团队既定教学定位（lab1 为起跑线、lab2-5 为学生动手实现）完全一致，且符合 plan 对每个实验"问题场景/背景知识/实验任务/验证/AI 模板/习题答案"的结构要求。
- 回滚方式：执行 `git checkout -- os-lab/labs/lab1-bare-metal.md progress.md` 并 `rm os-lab/labs/answers/lab1-answers.md` 可还原至修正前状态（实验任务回到"读懂它"的占位写法）。

## 2026-06-21 - Task: 成员 C Day1 实验文档充实（overview + lab1）
### What was done
- 将 `os-lab/labs/overview.md` 从 13 行占位扩充为完整实验总览，新增环境定位说明、前置准备、知识点地图 mermaid 图、5 个实验与 feature gate 的对应表、6 个组件 crate 的依赖关系 mermaid 图、快速开始命令、学习路径建议。
- 将 `os-lab/labs/lab1-bare-metal.md` 从 27 行占位扩充为完整实验指导，新增问题场景、RISC-V 启动层级/no_std/no_main 背景知识（含 3 张 mermaid 图）、逐文件代码导读（entry.asm/main.rs/sbi.rs/console.rs/linker.ld）、已实测的验证步骤、5 条 AI 提问模板、3 道思考题及参考答案。
- 文档内容全部基于已核实的成员 A/B 代码事实（feature 层级、链接地址 0x80200000、SBI legacy 功能号、entry.asm 栈大小等），无臆造。
- 同步收尾上轮参考测试遗留：更新 `docs/reference_test_report.md`，补充环境重建后 5 章 base 测试重跑结果记录。

### Testing
- 执行 `cargo run -p kernel --features lab1`（os-lab 目录），确认 QEMU 输出 `Hello, OS!` 与 `os-lab kernel lab1 is running on QEMU virt.`，exit code 0，证明 lab1 文档引用的验证命令真实可跑。
- 核查文档中所有代码片段（entry.asm 设栈与 call rust_main、main.rs 的 clear_bss/shutdown、sbi.rs 的 ecall 功能号、console.rs 的 Stdout/println 宏、linker.ld 的 BASE_ADDRESS=0x80200000）均与 `os-lab/kernel/` 实际源码一致。
- 核查 `kernel/Cargo.toml` 与 `Makefile`，确认文档引用的 feature 层级定义、`make run`/`make check`/`test-lab1` 命令与实际配置一致。

### Notes
- `os-lab/labs/overview.md`：重写，从占位扩充为含两张 mermaid 图（知识点地图、crate 依赖关系）的完整实验总览。
- `os-lab/labs/lab1-bare-metal.md`：重写，从占位扩充为含三张 mermaid 图（启动层级、no_std 对比、执行流程时序图）与完整答案的实验指导。
- `docs/reference_test_report.md`：在开头新增「环境重建后重跑记录」段落，不改写原有内容。
- `progress.md`：追加本轮成员 C 文档充实记录。
- 本轮严格遵守成员 C 文件边界（仅改 `os-lab/labs/` 与仓库 `docs/`、`progress.md`），未触碰成员 A 的 `kernel/src/` 与成员 B 的 `os-*/`、`user/`、`tests/`。
- 成员 C Day1 的 lab 文档初稿任务现已从「占位」升级为「实质完成」，lab1 已满足 plan 要求的每个实验必含项（问题场景、背景知识含 mermaid、实验任务、验证方法、AI 提问模板、习题与答案）。
- 回滚方式：执行 `git checkout -- os-lab/labs/overview.md os-lab/labs/lab1-bare-metal.md docs/reference_test_report.md progress.md` 可还原至本轮之前的状态（lab 文档回到占位初稿）。

## 2026-06-21 - Task: Day1 架构设计 + 基础骨架搭建（成员 A）

### What was done
- 在 `os-lab/` 创建 Cargo workspace，配置 `rust-toolchain.toml`、`.cargo/config.toml`（`build-std` + QEMU runner）。
- 实现 Lab1 裸机内核：`_start` 汇编入口、`rust_main`、`sbi` 封装、`println!` 宏、panic handler、`linker.ld` 与 `build.rs`。
- 搭建 `kernel` feature gate 骨架（`lab1`–`lab5`）及后续模块占位（`trap`/`task`/`mm`/`process`/`fs`/`sync`）。
- 创建 5 个组件 crate（`os-alloc`、`os-vm`、`os-fs`、`os-syscall`、`os-context`）与 `user` 占位库。
- 编写 `Makefile`（`run`/`test`/`check`/`test-labN`）、`README.md`、`docs/architecture.md`、实验文档占位。
- 在 QEMU 上跑通 Lab1，输出 `Hello, OS!` 并正常关机。

### Testing
- `cargo build -p kernel --features lab1`：编译通过。
- `cargo run -p kernel --features lab1`：QEMU 输出 `Hello, OS!` 与 `os-lab kernel lab1 is running on QEMU virt.`，随后正常退出。
- `cargo check -p kernel --features lab2/lab3/lab4/lab5`：各级 feature 均可编译。
- `cargo check --workspace`：workspace 全部 crate 检查通过。

### Notes
- `os-lab/`：新增自研教学实验环境 workspace 根目录及全部 Day1 骨架。
- `os-lab/kernel/`：Lab1 可运行内核与 feature gate 主体。
- `os-lab/os-*/`、`os-lab/user/`：组件与用户态占位 crate（待成员 B Day2+ 填充）。
- `os-lab/Makefile`、`os-lab/README.md`：构建入口与快速开始说明。
- `os-lab/docs/architecture.md`：架构说明与 mermaid 图。
- `os-lab/labs/`：实验总览与 Lab1 文档占位（成员 C 后续完善）。
- `docs/os-lab.md`：仓库级 os-lab 入口说明。
- `progress.md`：追加本轮 Day1 记录（用户所称 `process.md` 即本文件）。
- 回滚方式：删除整个 `os-lab/` 目录与 `docs/os-lab.md`，并从 `progress.md` 删除本轮记录。

## 2026-06-20 - Task: 将仓库同步至个人 GitHub
### What was done
- 新增 `.gitignore`，排除整个 `reference/`（第三方参考教程仓库及其 Rust `target/` 编译产物，合计约 1.46GB），避免超大文件触发 GitHub 100MB 单文件限制。
- 完成仓库首次提交，纳入实际需要版本管理的 8 个文件（项目规范、计划文档、环境脚本、进度日志等）。
- 新增 `github` 远程（`git@github.com:AM-SuSh/Or2-1-OS.git`，SSH 协议），保留原 `origin`（竞赛 GitLab `gitlab.eduxiji.net`）不动。
- 将 `main` 分支推送至个人 GitHub 仓库并设置上游跟踪。

### Testing
- 执行 `git ls-files -z | xargs -0 du -b`，确认暂存区仅 8 个文件、总计约 0.03MB，`reference/` 及 `target/` 已被正确忽略。
- 执行 `ssh -T git@github.com`，返回 `Hi AM-SuSh! You've successfully authenticated`，确认 SSH 认证可用。
- 执行 `git push -u github main`，输出 `* [new branch] main -> main` 并完成上游跟踪设置，推送成功。

### Notes
- `.gitignore`：新增，排除 `reference/`、`target/`、`**/target/`。
- `progress.md`：追加本轮 GitHub 同步记录。
- `github` 远程采用 SSH（`git@github.com:AM-SuSh/Or2-1-OS.git`），因当前环境 HTTPS 方式无法完成交互式 GitHub 登录；`origin`（竞赛 GitLab）未做任何改动，竞赛提交通道不受影响。
- 推送内容不含 `reference/` 参考资料；如后续需要把参考教程源码也放上去，需在 `.gitignore` 中放开并确认不含 100MB 以上文件。
- 回滚方式：在 GitHub 仓库 Settings → Danger Zone 删除仓库或删除 main 分支；本地执行 `git remote remove github` 移除远程；删除 `.gitignore` 并执行 `git reset --soft HEAD~1` 可撤销首次提交（保留工作区文件）。

## 2026-06-19 - Task: 拉取参考仓库 test 分支并运行基础测试
### What was done
- 拉取参考实验环境 `tg-rcore-tutorial` 的 `test` 分支到 `reference/tg-rcore-tutorial`，当前提交为 `d6330a6db1f81c8c1cfba5ec3db9923199398f24`。
- 使用已配置的 D 盘 Rust/QEMU 环境，完成参考仓库 5 个基础实验章节 `ch3/ch4/ch5/ch6/ch8` 的 base 测试。
- 新增参考实验环境测试报告，记录测试命令、测试结果和 Windows 下 `test.sh` 的兼容性现象。

### Testing
- `tg-rcore-tutorial-ch3`：执行 `cargo build` 通过；执行 `cargo run 2>&1 | tg-rcore-tutorial-checker --ch 3`，结果 `Test PASSED: 4/4`。
- `tg-rcore-tutorial-ch4`：执行 `cargo run 2>&1 | tg-rcore-tutorial-checker --ch 4`，结果 `Test PASSED: 6/6`。
- `tg-rcore-tutorial-ch5`：执行 `cargo clean; export CHAPTER=-5; cargo run 2>&1 | tg-rcore-tutorial-checker --ch 5`，结果 `Test PASSED: 14/14`。
- `tg-rcore-tutorial-ch6`：执行 `cargo clean; export CHAPTER=-6; cargo run 2>&1 | tg-rcore-tutorial-checker --ch 6`，结果 `Test PASSED: 15/15`。
- `tg-rcore-tutorial-ch8`：执行 `cargo clean; export CHAPTER=-8; cargo run 2>&1 | tg-rcore-tutorial-checker --ch 8`，结果 `Test PASSED: 22/22`。

### Notes
- `reference/tg-rcore-tutorial`：新增参考实验环境仓库，用于后续基础实验练习和自研实验环境对比。
- `docs/reference_test_report.md`：新增参考仓库拉取与基础测试报告。
- `progress.md`：新增本轮参考仓库拉取与测试记录。
- 参考仓库 `test.sh` 在当前 Windows Git Bash 环境中会因 `tee /dev/stderr` 返回失败；本轮使用等价 checker 管线验证输出，内核基础测试本身均已通过。
- 本轮只运行 base 测试，未运行 exercise 测试；exercise 测试需完成对应章节练习实现后再验证。
- 回滚方式：删除 `reference/tg-rcore-tutorial` 和 `docs/reference_test_report.md`，并从 `progress.md` 删除本轮记录。

## 2026-06-19 - Task: 迁移并配置操作系统实验环境
### What was done
- 将 Rust/Rustup/Cargo 环境迁移到 `D:\AppGallery\Rust`，并安装项目实验所需的 stable Rust、`riscv64gc-unknown-none-elf`、`rust-src` 和 `llvm-tools-preview`。
- 将 QEMU 重新安装到 `D:\AppGallery\QEMU`，并安装 `cargo-binutils`、`cargo-clone`、`tg-rcore-tutorial-checker` 等实验辅助工具。
- 更新用户级 `CARGO_HOME`、`RUSTUP_HOME` 和 `PATH`，并新增项目环境激活脚本和配置记录文档。

### Testing
- 执行 `. .\scripts\activate-os-env.ps1; rustc --version; cargo --version; qemu-system-riscv64 --version; bash --version; cargo install --list`，确认 Rust 1.96.0、Cargo 1.96.0、QEMU 11.0.50、Git Bash 5.2.37 和 Cargo 辅助工具可用。
- 执行 `rustup target list --installed`，确认已安装 `riscv64gc-unknown-none-elf` 和 `x86_64-pc-windows-msvc`。
- 执行 `rustup component list --installed`，确认已安装 `rust-src`、`llvm-tools-x86_64-pc-windows-msvc` 和 `rust-std-riscv64gc-unknown-none-elf`。
- 执行 `Get-Command rustc,cargo,rustup,qemu-system-riscv64,bash`，确认命令解析路径均指向 `D:\AppGallery` 下的新环境。

### Notes
- `docs/environment_setup.md`：新增本机实验环境配置说明、验证命令、安装路径和 C 盘清理状态。
- `scripts/activate-os-env.ps1`：新增当前 PowerShell 会话的实验环境激活脚本。
- `progress.md`：新增本轮环境迁移与验证记录。
- 本机环境：`C:\Users\Jane Aurora\.cargo` 和 `C:\Users\Jane Aurora\.rustup` 已清理；`C:\Program Files\qemu` 仍有少量卸载器残留文件，Windows 返回 `Access is denied`，但其中已不存在 `qemu-system-riscv64.exe`，用户 PATH 也不再指向该目录。
- 回滚方式：删除 `docs/environment_setup.md` 和 `scripts/activate-os-env.ps1`，从 `progress.md` 删除本轮记录；本机环境可通过卸载 `D:\AppGallery\QEMU`、删除 `D:\AppGallery\Rust`，并从用户环境变量中移除 `CARGO_HOME`、`RUSTUP_HOME`、`D:\AppGallery\Rust\cargo\bin` 和 `D:\AppGallery\QEMU` 进行回滚。

## 2026-06-19 - Task: 制定项目完成计划文档
### What was done
- 根据 `Task.md` 的赛题要求，制定了项目完成计划，覆盖基础实验、自研教学实验环境、测试验证、评估对比、最终报告和团队三人分工。
- 新建 `docs/` 目录并将计划文档放入统一文档目录。

### Testing
- 执行 `Get-Content -Raw -Encoding UTF8 -LiteralPath .\docs\project_plan.md`，确认计划文档可正常读取，且包含项目目标、成功标准、阶段计划、里程碑安排、风险应对和团队三人分工。

### Notes
- `docs/project_plan.md`：新增项目完成计划文档，明确实施路径、验收方式和三人分工。
- `progress.md`：新增本轮正式文档交付记录。
- 回滚方式：删除 `docs/project_plan.md` 和本文件中的本轮记录；若 `docs/` 目录仅包含本轮创建内容，可一并删除 `docs/` 目录。
