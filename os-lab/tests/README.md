# 集成测试

Day 2 起由成员 B 补充内核与用户态集成测试。

## 统一验证入口（成员 C 第一周）

从 `os-lab/` 目录运行：

```powershell
node scripts/verify.mjs baseline
```

`baseline` 依次执行 handbook 静态构建、Lab2 host 组件测试、Lab2 QEMU 可信 recipe，并校验关键输出、5 轮 yield 以及 `trap_enter` / `task_switch` trace。也可单独运行：

```powershell
node scripts/verify.mjs handbook
node scripts/verify.mjs host
node scripts/verify.mjs qemu --lab lab2
```

任一步命令退出非零或 Lab 断言未全部通过，统一入口都会退出非零。运行前仍需按环境文档激活 Rust、QEMU 与 RISC-V target。

M0 纵向闭环另由 `handbook/npm run test:smoke` 验证：使用临时 SQLite 和本机 mock 模型串起可信运行、AI 追问、报告与评分证据。完整数据流与人工演示步骤见 `docs/lab2-m0-acceptance.md`。

## Day 1 验证

完整步骤见仓库 [`docs/os-lab.md`](../../docs/os-lab.md)。

简要命令（仓库根目录激活环境后）：

```powershell
. ..\scripts\activate-os-env.ps1
cd os-lab
cargo check -p os-sbi
cargo run -p kernel --features lab1
```

本机 Git 不在 `D:\AppGallery\Git` 时，将第一行改为 `activate-os-env.local.ps1`。

成功标准：QEMU 输出 `Hello, OS!` 与 `os-lab kernel lab1 is running on QEMU virt.`，进程 exit code 0。

## 链接脚本校验（成员 B Day1）

对照 `kernel/linker.ld` 与 `kernel/build.rs`，结论如下（无需修改）：

| 检查项 | 结论 |
|--------|------|
| `ENTRY(_start)` 与 `entry.asm` 全局符号一致 | 通过 |
| `BASE_ADDRESS = 0x80200000` 与 OpenSBI 跳转地址一致 | 通过 |
| `.text.entry` 段优先于普通 `.text` | 通过 |
| `.bss.stack` 位于 bss 段内 | 通过 |
| `build.rs` 通过 `-T` 注入链接脚本 | 通过 |

## Day 2 / Lab2 验证（成员 B Day2）

### 组件单元测试（host 目标）

`os-context` 含 RISC-V 汇编，须在 **host triple** 上跑纯 Rust 单元测试：

```powershell
cd os-lab
cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc
```

Linux/macOS 将 triple 换为对应 host（如 `x86_64-unknown-linux-gnu`）。

预期：`os-context` 3 项、`os-syscall` 4 项测试全部 `ok`。

### Lab2 编译与 QEMU 运行

```powershell
cargo check -p kernel --features lab2
cargo run -p kernel --features lab2
```

### 成功标准

QEMU 输出中应依次出现：

```text
os-lab kernel lab2: trap and multitask.
Loading 3 user apps ...
Hello from user app!
App 0 exited with code 0
Power test start
2^1000000002 % 998244353 = 409684505
Power check ok
App 1 exited with code 0
Yield test start
Yield round
Yield round
Yield round
Yield round
Yield round
App 2 exited with code 0
All user apps exited.
```

说明：yield 程序循环 5 次 `sys_yield`，lab2/lab3 均应完整输出 **5 轮** `Yield round`。若只有 1 轮，说明 trap 保存/恢复或 `SYS_YIELD` 分发路径可能被改坏。

## Day 3 / Lab3 验证（成员 B Day3）

### 组件单元测试（host 目标）

`os-alloc` / `os-vm` 须在 **host triple** 上跑单元测试（`os-vm` 测试使用进程内 `FAKE_MEM` 后备，须单线程）：

```powershell
cd os-lab
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1
```

Linux/macOS 将 triple 换为对应 host。

预期：`os-alloc` 6 项、`os-vm` 5 项测试全部 `ok`。

### Lab3 编译与 QEMU 运行

```powershell
cargo check -p kernel --features lab3
cargo run -p kernel --features lab3
```

### 成功标准

QEMU 输出中应依次出现：

```text
Hello from user app!
App 0 exited with code 0
Power test start
2^1000000002 % 998244353 = 409684505
Power check ok
App 1 exited with code 0
Yield test start
Yield round
Yield round
Yield round
Yield round
Yield round
App 2 exited with code 0
All user apps exited.
```

说明：lab3 启用分页后 yield 同样应完整输出 **5 轮** `Yield round`（与 lab2 相同）。Lab3 的可观察差异主要在虚存隔离（独立页表、`U` 位权限），而非 yield 轮次。

## Day 4 / Lab4 验证（成员 B Day4）

### 组件单元测试（host 目标，Day2/3 回归）

lab4 不新增 host 单元测试；验收前建议回归 Day2/3 组件测试：

```powershell
cd os-lab
cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1
```

### Lab4 编译与 QEMU 运行

```powershell
cargo check -p kernel --features lab4
cargo run -p kernel --features lab4
```

### 成功标准

QEMU 输出中应出现（OpenSBI 启动日志可忽略）：

```text
I am parent, child_pid=2
I am child, pid=2
waited pid done, exit_code=0
Process 2 exited with code 0
fork_test pass
Process 1 exited with code 0
All processes exited.
```

说明：

- lab4 下 `kernel/build.rs` 嵌入的用户程序为 `fork_test`、`exec_test`、`hello`（与 lab2/3 的 `hello`/`power`/`yield` 不同）；回归 lab2/lab3 须分别使用 `--features lab2` / `lab3`。
- 默认 initproc 运行 `fork_test`（`kernel/src/config.rs` 中 `INITPROC_APP_ID = 0`）。
- `exec_test` 不在默认路径自动运行。可选 spot-check：将 `INITPROC_APP_ID` 改为 `1` 后重编（属成员 A 内核配置），预期 `Before exec` → `Hello from user app!`，且无 `After exec`。

## Day 5 / Lab5 验证（成员 B Day5）

### 组件单元测试（host 目标）

lab5 新增 `os-fs`、`os-sbi` host 测试；验收前建议全量回归：

```powershell
cd os-lab
cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1
```

预期：`os-context` 3 项、`os-syscall` 4 项、`os-sbi` 2 项、`os-fs` 4 项、`os-alloc` 6 项、`os-vm` 5 项，共 **24 项**全部 `ok`。

### Lab5 编译与 QEMU 运行

若 `cargo run` 构建卡住，先单独构建用户程序：

```powershell
cargo build -p user --bin fs_test --bin pipe_test --target riscv64gc-unknown-none-elf --release
cargo check -p kernel --features lab5
cargo run -p kernel --features lab5 --release
```

### 成功标准

QEMU 输出中应出现（OpenSBI 启动日志可忽略）：

```text
os-lab kernel lab5: filesystem and sync.
Hello from testfile!
fs_test pass
pipe says hi
pipe_test pass
All processes exited.
```

说明：

- lab5 嵌入 `fs_test`、`pipe_test`、`fork_test`、`exec_test`、`hello`；默认 initproc 为 `fs_test`（索引 0）。
- `pipe_test pass` 由子进程打印（读端成功读取后）。
- 内核 `kernel/src/fs.rs` 通过 `os_fs::EmbeddedFs::default_fs()` 读写 `testfile`（与 crate `DEFAULT_FILES` 共用同一文件表）；可 `cargo test -p os-fs` 在 host 上独立验证。

## Day 6 / 全量交叉回归（成员 B Day6）

Day6 在成员 A 完成 `os-fs` 内核集成后，对 **Lab1→Lab5** 做端到端交叉回归，确认 feature gate 渐进路径无退化。

### 一键命令（PowerShell，仓库根目录）

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
$ErrorActionPreference = 'Continue'   # 避免 cargo 编译 warning 写入 stderr 时 PowerShell 中断

cd os-lab
cargo check --workspace

cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1

cargo build -p user --bin fs_test --bin pipe_test --target riscv64gc-unknown-none-elf --release
cargo run -p kernel --features lab5 --release
cargo run -p kernel --features lab4 --release
cargo run -p kernel --features lab3
cargo run -p kernel --features lab2
cargo run -p kernel --features lab1

cargo check -p kernel --features lab1
cargo check -p kernel --features lab2
cargo check -p kernel --features lab3
cargo check -p kernel --features lab4
cargo check -p kernel --features lab5
```

Linux/macOS：将 `cargo test` 的 `--target` 换为对应 host triple；`os-vm` 测试须保留 `-- --test-threads=1`。

### 各 Lab 成功标准（摘要）

| Lab | 关键输出 |
|-----|----------|
| lab5 | `Hello from testfile!`、`fs_test pass`、`pipe_test pass`、`All processes exited.` |
| lab4 | `I am parent`、`I am child`、`fork_test pass`、`All processes exited.` |
| lab3 | `409684505`、5 轮 `Yield round`、`All user apps exited.` |
| lab2 | `409684505`、5 轮 `Yield round`、`All user apps exited.` |
| lab1 | `Hello, OS!`、`os-lab kernel lab1 is running on QEMU virt.` |

各 Lab 细则见上文 Day1–Day5 各节。

### Day6 验收勾选清单

- [ ] `cargo check --workspace` 无 error
- [ ] 组件 host 单元测试 24 项全部 `ok`
- [ ] Lab5 QEMU：`fs_test pass`、`pipe_test pass`（验证 `os-fs` 内核集成）
- [ ] Lab4 QEMU：`I am parent`/`I am child`、`fork_test pass`、`All processes exited.`
- [ ] Lab3 QEMU：5 轮 `Yield round`
- [ ] Lab2 QEMU：`409684505`、`All user apps exited.`
- [ ] Lab1 QEMU：`Hello, OS!`
- [ ] `cargo check -p kernel --features lab1`…`lab5` 均可编译

## Day 7 / 终验回归（成员 B Day7）

Day7 在 Day6 全量交叉回归基础上，增加 **B 域 clippy 全绿** 与 **README 新人 5 分钟路径** 复验，作为三人协作的最终 B 侧收口。

### 一键命令（PowerShell，仓库根目录）

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
$ErrorActionPreference = 'Continue'

cd os-lab
cargo check --workspace

cargo clippy -p os-alloc -p os-context -p os-vm -p os-syscall -p os-sbi -p os-fs -- -D warnings

cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1

# README 新人路径（lab1→lab5 正序）
cargo run -p kernel --features lab1 --release
cargo run -p kernel --features lab2 --release
cargo run -p kernel --features lab3 --release
cargo run -p kernel --features lab4 --release
cargo run -p kernel --features lab5 --release

cargo build -p user --bin fs_test --bin pipe_test --target riscv64gc-unknown-none-elf --release
cargo run -p kernel --features lab5 --release
cargo run -p kernel --features lab4 --release
cargo run -p kernel --features lab3 --release
cargo run -p kernel --features lab2 --release
cargo run -p kernel --features lab1 --release

cargo check -p kernel --features lab1
cargo check -p kernel --features lab2
cargo check -p kernel --features lab3
cargo check -p kernel --features lab4
cargo check -p kernel --features lab5
```

Linux/macOS：将 `cargo test` 的 `--target` 换为对应 host triple；`os-vm` 测试须保留 `-- --test-threads=1`。

### Day7 验收勾选清单

- [ ] 全 workspace `cargo clippy --all -- -D warnings` 与各 `kernel --features lab1`…`lab5` 均无 error/warning
- [ ] `cargo clippy -p os-alloc -p os-context -p os-vm -p os-syscall -p os-sbi -p os-fs -- -D warnings` 无 error/warning
- [ ] `cargo check --workspace` 无 error
- [ ] 组件 host 单元测试 24 项全部 `ok`
- [ ] README 新人路径：lab1–lab5 正序 QEMU 均可运行
- [ ] Lab5 QEMU：`Hello from testfile!`、`fs_test pass`、`pipe_test pass`、`All processes exited.`
- [ ] Lab4 QEMU：`I am parent`/`I am child`、`fork_test pass`、`All processes exited.`
- [ ] Lab3 QEMU：5 轮 `Yield round`、`All user apps exited.`
- [ ] Lab2 QEMU：`409684505`、`All user apps exited.`
- [ ] Lab1 QEMU：`Hello, OS!`、`os-lab kernel lab1 is running on QEMU virt.`
- [ ] `cargo check -p kernel --features lab1`…`lab5` 均可编译

**说明**：全 workspace 与各 lab feature 的 `cargo clippy -- -D warnings` 均已通过（2026-06-27 终验）。详见 [`docs/os-lab.md` §5.11](../../docs/os-lab.md#511-完整验证) 与 [仓库总览](../../README.md)。

## 二期 / Lab6 验证（成员 B，2026-07-25）

Lab6 须 VirtIO 块设备，验收命令与一期不同：

```powershell
cd os-lab
. ..\scripts\activate-os-env.ps1   # 仓库根目录执行
cargo build -p user --target riscv64gc-unknown-none-elf --release --bins
cargo build -p kernel --features lab6 --release
make test-lab6
cargo test -p os-fs --target x86_64-pc-windows-msvc
```

### 成功标准

QEMU 输出应包含（顺序大致如下，OpenSBI 日志可忽略）：

```text
os-lab kernel lab6: VirtIO disk filesystem.
file_test pass
Test link OK!
mass open/unlink OK!
mmap_test pass
spawn_test pass
stride_test pass
fs_test pass
pipe_test pass
All processes exited.
```

### Lab6 验收勾选清单

- [ ] `cargo check -p kernel --features lab6` 无 error
- [ ] `cargo test -p os-fs` 8 项全部 `ok`
- [ ] `make check-fs-img` 通过
- [ ] `make test-lab6` 输出含上表全部关键行
- [ ] 阅读 `labs/lab6-disk-fs.md` 并完成【任务二】，对照 `labs/answers/lab6-answers.md`

专项进度见 [docs/lab6-8.md](../../docs/lab6-8.md)。
