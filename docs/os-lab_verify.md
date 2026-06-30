# 自研环境验证与复现

本文说明如何在终端复现 `os-lab` 的编译检查、组件单元测试与 Lab1–Lab5 QEMU 运行。环境安装见 [environment_setup.md](environment_setup.md)；交付范围见 [delivery-checklist.md](delivery-checklist.md)。

所有 `cargo` 命令须在 **`os-lab/`** 目录下执行（workspace 根在此）。每新开终端须先激活环境，否则可能出现 `cargo` 找不到。

## 验证总览

| 范围 | 编译检查 | 组件单元测试（host） | QEMU 运行 | 关键输出 |
| --- | --- | --- | --- | --- |
| Lab1 | `cargo check -p os-sbi`、`-p kernel --features lab1` | 无 | `cargo run -p kernel --features lab1` | `Hello, OS!` |
| Lab2 | `-p kernel --features lab2` | `os-context` 3 项 + `os-syscall` 4 项 | `cargo run -p kernel --features lab2` | `409684505`、`Yield round` |
| Lab3 | `-p kernel --features lab3` | `os-alloc` 6 项 + `os-vm` 5 项 | `cargo run -p kernel --features lab3` | 虚存启用日志、5 轮 `Yield round` |
| Lab4 | `-p kernel --features lab4` | Lab2/3 组件回归 | `cargo run -p kernel --features lab4 --release` | `fork_test pass`、`I am parent`/`I am child` |
| Lab5 | `-p kernel --features lab5` | 全量 24 项 | `cargo run -p kernel --features lab5 --release` | `fs_test pass`、`pipe_test pass` |
| 完整回归 | `cargo check --workspace` + clippy | 全量 24 项 | lab5→lab1 倒序 + lab1→lab5 正序 | 见 [§11 完整验证](#11-完整验证) |

**推荐顺序**：激活环境 → 工具检查 → workspace 编译 → 组件单元测试 → Lab1 → Lab2 → Lab3 → Lab4 → Lab5；完整验证另含 clippy 与双向 QEMU 回归。

**host triple 对照**（`cargo test` 必须指定 `--target`）：

| 平台 | `--target` |
| --- | --- |
| Windows x64 | `x86_64-pc-windows-msvc` |
| Linux x64 | `x86_64-unknown-linux-gnu` |
| macOS Apple Silicon | `aarch64-apple-darwin` |
| macOS Intel | `x86_64-apple-darwin` |

下文一键复制块默认 Windows triple；Linux/macOS 请替换为表中对应值。

---

## 1. 激活实验环境

在仓库根目录打开 PowerShell：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
```

若脚本内路径与本机不符，可复制为 `scripts/activate-os-env.local.ps1` 后修改路径再执行（见 [environment_setup.md](environment_setup.md)）。

---

## 2. 检查工具版本

```powershell
Get-Command rustc,cargo,rustup,qemu-system-riscv64,bash | Format-Table Name,Source -AutoSize

rustc --version
cargo --version
qemu-system-riscv64 --version
bash --version
```

---

## 3. 编译检查

```powershell
cd os-lab

cargo check --workspace
cargo check -p os-sbi
cargo check -p kernel --features lab1
cargo check -p kernel --features lab2
cargo check -p kernel --features lab3
cargo check -p kernel --features lab4
cargo check -p kernel --features lab5
```

各级命令均应输出 `Finished`，无 `error`（`warning` 可暂时忽略）。

等价于 Makefile 的 `make check`（需 Git Bash 且已安装 `make`）：

```bash
cd os-lab
make check
```

`os-sbi` 无 host 单元测试；以编译通过 + Lab1 QEMU 输出为准。

---

## 4. 组件单元测试（host 目标）

`os-context` / `os-vm` 含 RISC-V 相关逻辑，**不能**在 `riscv64gc-unknown-none-elf` 目标上跑 `cargo test`；须在 **本机 host triple** 上执行。

### 4.1 `os-context` + `os-syscall`

**Windows（PowerShell）：**

```powershell
cd os-lab
cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc
```

**Linux：**

```bash
cd os-lab
cargo test -p os-context -p os-syscall --target x86_64-unknown-linux-gnu
```

**macOS（Apple Silicon）：**

```bash
cd os-lab
cargo test -p os-context -p os-syscall --target aarch64-apple-darwin
```

**macOS（Intel）：**

```bash
cd os-lab
cargo test -p os-context -p os-syscall --target x86_64-apple-darwin
```

**成功标准：**

```text
running 3 tests   # os-context
test result: ok. 3 passed; 0 failed

running 4 tests   # os-syscall
test result: ok. 4 passed; 0 failed
```

### 4.2 `os-alloc` + `os-vm`

`os-vm` 页表测试共享全局页帧分配器，**必须**加 `--test-threads=1`。

**Windows（PowerShell）：**

```powershell
cd os-lab
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1
```

**Linux：**

```bash
cd os-lab
cargo test -p os-alloc -p os-vm --target x86_64-unknown-linux-gnu -- --test-threads=1
```

**macOS（Apple Silicon）：**

```bash
cd os-lab
cargo test -p os-alloc -p os-vm --target aarch64-apple-darwin -- --test-threads=1
```

**macOS（Intel）：**

```bash
cd os-lab
cargo test -p os-alloc -p os-vm --target x86_64-apple-darwin -- --test-threads=1
```

**成功标准：**

```text
running 6 tests   # os-alloc
test result: ok. 6 passed; 0 failed

running 5 tests   # os-vm
test result: ok. 5 passed; 0 failed
```

### 4.3 全部组件测试（合并执行）

Windows 示例（Lab5 前为 18 项；含 `os-sbi`、`os-fs` 后为 24 项）：

```powershell
cd os-lab
cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1
```

---

## 5. 运行 Lab1（QEMU）

```powershell
cd os-lab
cargo run -p kernel --features lab1
```

或使用 cargo alias：

```powershell
cargo run-lab1
```

### Lab1 成功标准

QEMU 输出中应包含：

```text
Hello, OS!
os-lab kernel lab1 is running on QEMU virt.
```

OpenSBI 日志中应出现：

```text
Domain0 Next Address        : 0x0000000080200000
```

进程正常关机后回到 PowerShell 提示符（非卡死），exit code 0。

---

## 6. 运行 Lab2（QEMU）

```powershell
cd os-lab
cargo check -p kernel --features lab2
cargo run -p kernel --features lab2
```

### Lab2 成功标准

QEMU 输出中应依次出现（OpenSBI 启动日志可忽略）：

```text
os-lab kernel lab2: trap and multitask.
Loading 3 user apps (batch slot at 0x80400000)...
  app 0: ... bytes -> 0x80400000
Hello from user app!
App 0 exited with code 0
  app 1: ... bytes -> 0x80400000
Power test start
2^1000000002 % 998244353 = 409684505
Power check ok
App 1 exited with code 0
  app 2: ... bytes -> 0x80400000
Yield test start
Yield round
Yield round
Yield round
Yield round
Yield round
All user apps exited.
```

说明：

- 幂模正确结果为 **409684505**。
- yield 通常输出 **5 轮** `Yield round`；若仅 1 轮，说明 `SYS_YIELD` 路径已触发，属已知实现差异。

---

## 7. 运行 Lab3（QEMU）

```powershell
cd os-lab
cargo check -p kernel --features lab3
cargo run -p kernel --features lab3
```

### Lab3 成功标准

QEMU 输出中应依次出现（OpenSBI 启动日志可忽略）：

```text
os-lab kernel lab3: enabling virtual memory...
os-lab kernel lab3: virtual memory ready.
Loading 3 user apps (batch slot at 0x80400000)...
  app 0: ... bytes -> 0x80400000
Hello from user app!
App 0 exited with code 0
  app 1: ... bytes -> 0x80400000
Power test start
2^1000000002 % 998244353 = 409684505
Power check ok
App 1 exited with code 0
  app 2: ... bytes -> 0x80400000
Yield test start
Yield round
Yield round
Yield round
Yield round
Yield round
App 2 exited with code 0
All user apps exited.
```

说明：

- 必须出现虚存启用两行日志（`enabling virtual memory` / `virtual memory ready`）。
- yield 测试应完整输出 **5 轮** `Yield round`。
- 进程正常关机，exit code 0。

---

## 8. 运行 Lab4（QEMU）

使用 lab4 feature 运行进程管理测试（默认 initproc 为 `fork_test`）：

```powershell
cd os-lab
cargo check -p kernel --features lab4
cargo run -p kernel --features lab4
```

### Lab4 成功标准

QEMU 输出中应出现（OpenSBI 启动日志可忽略）：

```text
I am parent, child_pid=2
I am child, pid=2
Process 2 exited with code 0
fork_test pass
Process 1 exited with code 0
All processes exited.
```

说明：

- lab4 嵌入的用户程序为 `fork_test`、`exec_test`、`hello`；与 lab2/3 的 `hello`/`power`/`yield` 构建集不同，**须分别**用对应 feature 回归。
- `exec_test` 验证 exec 语义：成功 exec 后原程序后续代码不执行。默认不自动运行；可选将 `kernel/src/config.rs` 的 `INITPROC_APP_ID` 改为 `1` 后重编，预期 `Before exec` → `Hello from user app!`，无 `After exec`。

---

## 9. 运行 Lab5（QEMU）

使用 lab5 feature 运行文件系统与管道测试（默认 initproc 为 `fs_test`，链式 `exec` 进入 `pipe_test`）：

```powershell
cd os-lab
# 若 kernel 构建卡住，先单独构建用户程序（见常见问题）
cargo build -p user --bin fs_test --bin pipe_test --bin fork_test --bin exec_test --bin hello --target riscv64gc-unknown-none-elf --release

cargo check -p kernel --features lab5
cargo run -p kernel --features lab5 --release
```

### Lab5 成功标准

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

- lab5 嵌入 5 个用户程序：`fs_test`、`pipe_test`、`fork_test`、`exec_test`、`hello`。
- `pipe_test pass` 由子进程在成功读取管道数据后打印。
- 内核通过 `os_fs::EmbeddedFs::default_fs()` 读写 `testfile`；host 单测与 QEMU 共用同一 `DEFAULT_FILES` 文件表。

---

## 10. 快速验证

将 `<仓库根目录>` 替换为实际路径。Git 路径非标准时，将激活脚本改为 `activate-os-env.local.ps1`。

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
cargo run -p kernel --features lab1 --release
cargo run -p kernel --features lab5 --release
cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
```

期望：Lab1 输出 `Hello, OS!`；Lab5 输出 `fs_test pass`、`pipe_test pass`；组件测试全部 `ok`。

---

## 11. 完整验证

完整回归包含 workspace 编译、组件 clippy、24 项 host 单元测试、lab1→lab5 正序与 lab5→lab1 倒序 QEMU。

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
$ErrorActionPreference = 'Continue'

cd os-lab
cargo check --workspace

cargo clippy -p os-alloc -p os-context -p os-vm -p os-syscall -p os-sbi -p os-fs -- -D warnings

cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1

# lab1→lab5 正序
cargo run -p kernel --features lab1 --release
cargo run -p kernel --features lab2 --release
cargo run -p kernel --features lab3 --release
cargo run -p kernel --features lab4 --release
cargo run -p kernel --features lab5 --release

cargo build -p user --bin fs_test --bin pipe_test --target riscv64gc-unknown-none-elf --release

# lab5→lab1 倒序回归
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

Linux/macOS：将 `cargo test` 的 `--target` 换成 [验证总览](#验证总览) 表中对应 host triple；`os-vm` 测试**必须保留** `-- --test-threads=1`。

PowerShell 下若未设置 `$ErrorActionPreference = 'Continue'`，`cargo` 编译 warning 写入 stderr 可能导致脚本提前中断。

**成功标准摘要**：clippy 无 error/warning；24 项单元测试全部 `ok`；各 Lab QEMU 输出符合 [§5–§9](#5-运行-lab1qemu) 成功标准。

---

## 12. 常见问题

| 现象 | 处理 |
| --- | --- |
| `cargo` / `rustc` 找不到 | 未激活环境或新开终端后未重新执行激活脚本 |
| `could not find Cargo.toml` | 未进入 `os-lab/`，先 `cd os-lab` |
| `rustc` 找不到或路径不对 | 重新执行激活脚本；见 [environment_setup.md](environment_setup.md) |
| `qemu-system-riscv64` 找不到 | 确认 QEMU 已安装且在 `PATH` 中 |
| `cargo test` 报 `can't find crate for test` 或 RISC-V 汇编错误 | 未指定 host `--target`；见 [§4](#4-组件单元测试host-目标) |
| `cargo run` 下载 rustup 超时 | 检查网络；或先执行 `rustup update stable` |
| PowerShell 中 `lab1~lab5` 无效 | 逐条执行 `lab1`、`lab2`…`lab5`，不要用 shell 范围写法 |
| PowerShell 脚本在 `cargo run` 时提前中断 | 激活环境后设置 `$ErrorActionPreference = 'Continue'`（见 [§11](#11-完整验证)） |
| Lab2 yield 不足 5 轮 | `SYS_YIELD` 路径已触发即可；见 [§6](#6-运行-lab2qemu) |
| Lab3 无虚存启用日志 | 确认使用 `--features lab3`，而非 `lab2` |
| `os-vm` 单元测试崩溃或 access violation | 加 `--test-threads=1`（见 [§4.2](#42-os-alloc--os-vm)） |
| Lab4 无 `fork_test pass` | 确认 `--features lab4`；检查 fork 返回值与 waitpid 是否匹配子 PID |
| 用 lab4 跑 lab2/3 测试失败 | lab4 构建集不同，须分别 `cargo run --features lab2` / `lab3` |
| `cargo run --features lab5` 长时间无输出 / 卡住 | 先单独 `cargo build -p user --bin fs_test --bin pipe_test ... --release`，再 `cargo run` |
| Lab5 无 `fs_test pass` | 确认 `--features lab5`；检查 `open`/`read` syscall 与 `os-fs` `DEFAULT_FILES` |
| Lab5 无 `pipe_test pass` | 检查 `SYS_PIPE`（59）与 fork 后 pipe fd 继承；`pipe_test` 在 `pipe()` 前用两次 `open` 占位避开 fd 0/1 |

---

## 13. 相关文档

- [delivery-checklist.md](delivery-checklist.md)：交付范围与验证路径
- [environment_setup.md](environment_setup.md)：工具链安装
- [os-lab.md](os-lab.md)：自研环境入口
- [os-lab/README.md](../os-lab/README.md)：快速开始与 feature 说明
- [os-lab/tests/README.md](../os-lab/tests/README.md)：集成测试说明
- [os-lab/labs/lab1-bare-metal.md](../os-lab/labs/lab1-bare-metal.md) … [lab4-process.md](../os-lab/labs/lab4-process.md)：各 Lab 实验指导
