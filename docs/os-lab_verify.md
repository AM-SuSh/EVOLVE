# os-lab 验证执行指令

伙伴在本机复现 **成员 B Day1（Lab1）** 至 **Day7（终验回归）** 结果时，按本文顺序执行即可。

所有 `cargo` 命令必须在 **`os-lab/`** 目录下运行（workspace 根在此，不在仓库根目录）。**每新开一个 PowerShell 窗口，都必须先执行环境激活脚本**，否则会出现 `cargo` 找不到。

环境安装说明见 [environment_setup.md](environment_setup.md)。

## 验证总览

| 阶段 | 编译检查 | 组件单元测试（host） | QEMU 运行 | 关键输出 |
| --- | --- | --- | --- | --- |
| Day1 / Lab1 | `cargo check -p os-sbi`、`-p kernel --features lab1` | 无 | `cargo run -p kernel --features lab1` | `Hello, OS!` |
| Day2 / Lab2 | `-p kernel --features lab2` | `os-context` 3 项 + `os-syscall` 4 项 | `cargo run -p kernel --features lab2` | `409684505`、`Yield round` |
| Day3 / Lab3 | `-p kernel --features lab3` | `os-alloc` 6 项 + `os-vm` 5 项 | `cargo run -p kernel --features lab3` | 虚存启用日志、5 轮 `Yield round` |
| Day4 / Lab4 | `-p kernel --features lab4` | Day2/3 回归 | `cargo run -p kernel --features lab4 --release` | `fork_test pass`、`I am parent`/`I am child` |
| Day5 / Lab5 | `-p kernel --features lab5` | 全量 24 项 | `cargo run -p kernel --features lab5 --release` | `fs_test pass`、`pipe_test pass` |
| Day6 | `cargo check` lab1–lab5 | 全量 24 项 | lab5→lab1 依次 QEMU | 见第 16 节勾选清单 |
| Day7 | `cargo check --workspace` + B 域 clippy | 全量 24 项 | lab5→lab1 + README 新人路径 | 见第 17 节勾选清单 |

**推荐顺序**：激活环境 → 工具检查 → 全 workspace 编译 → 组件单元测试 → Lab1 → Lab2 → Lab3 → Lab4 → Lab5；Day6/Day7 做 lab5→lab1 倒序 QEMU 全量回归；Day7 另按 [`os-lab/README.md`](../os-lab/README.md) 新人 5 分钟路径复验。

**host triple 对照**（`cargo test` 必须指定，不可省略）：

| 平台 | `--target` |
| --- | --- |
| Windows x64 | `x86_64-pc-windows-msvc` |
| Linux x64 | `x86_64-unknown-linux-gnu` |
| macOS Apple Silicon | `aarch64-apple-darwin` |
| macOS Intel | `x86_64-apple-darwin` |

下文一键复制块默认 Windows triple；Linux/macOS 请替换为表中对应值。

---

## 1. 激活实验环境

在仓库根目录 `Or2-1-OS/` 打开 PowerShell：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
```

应看到类似输出：

```text
OS experiment environment activated.
CARGO_HOME=D:\AppGallery\Rust\cargo
RUSTUP_HOME=D:\AppGallery\Rust\rustup
```

若本机 Git 不在 `D:\AppGallery\Git`（例如在 `E:\Git`），改用：

```powershell
. .\scripts\activate-os-env.local.ps1
```

---

## 2. 检查工具路径与版本

```powershell
Get-Command rustc,cargo,rustup,qemu-system-riscv64,bash | Format-Table Name,Source -AutoSize

rustc --version
cargo --version
qemu-system-riscv64 --version
bash --version
```

团队标准路径（`activate-os-env.ps1`）：

| 工具 | 预期路径 |
| --- | --- |
| `rustc` / `cargo` / `rustup` | `D:\AppGallery\Rust\cargo\bin\` |
| `qemu-system-riscv64` | `D:\AppGallery\QEMU\` |
| `bash` | `D:\AppGallery\Git\bin\` 或本机 `E:\Git\bin\` |

---

## 3. 进入 os-lab 并编译检查

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

### Day1 补充：`os-sbi` 组件

```powershell
cd os-lab
cargo check -p os-sbi
```

`os-sbi` 无 host 单元测试；以编译通过 + Lab1 QEMU 输出为准。

---

## 4. 组件单元测试（host 目标）

`os-context` / `os-vm` 含 RISC-V 相关逻辑，**不能**在默认的 `riscv64gc-unknown-none-elf` 目标上跑 `cargo test`；须在 **本机 host triple** 上执行。

### 4.1 Day2：`os-context` + `os-syscall`

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

### 4.2 Day3：`os-alloc` + `os-vm`

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

### 4.3 Day1–Day3 全部组件测试（可选合并执行）

Windows 示例（一次跑完 18 项单元测试）：

```powershell
cd os-lab
cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc
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

- 幂模正确结果为 **409684505**（非临时占位值 `960319429`）。
- 当前实现下 yield 通常可输出 **5 轮** `Yield round`；若仅 1 轮，说明 `SYS_YIELD` 路径已触发，可记为已知差异，不单独阻断 Day2。

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

- 必须出现 **虚存启用** 两行日志（`enabling virtual memory` / `virtual memory ready`），证明 lab3 feature 与 `mm` 模块已生效。
- yield 测试应完整输出 **5 轮** `Yield round`。
- 幂模正确结果仍为 **409684505**。
- 进程正常关机，exit code 0。

---

## 8. 一键复制：Day1 全量验证

将 `<仓库根目录>` 替换为实际路径（例如 `E:\HomeWorkForDaSE\Or2-1-OS`）。Git 路径非标准时，将第二行改为 `activate-os-env.local.ps1`。

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

Get-Command rustc,cargo,qemu-system-riscv64,bash | Format-Table Name,Source -AutoSize
rustc --version
cargo --version
qemu-system-riscv64 --version

cd os-lab
cargo check --workspace
cargo check -p os-sbi
cargo check -p kernel --features lab1
cargo check -p kernel --features lab2
cargo check -p kernel --features lab3
cargo check -p kernel --features lab4
cargo check -p kernel --features lab5
cargo run -p kernel --features lab1
```

---

## 9. 一键复制：Day2 全量验证

在 Day1 编译检查基础上，增加 Day2 组件单元测试与 Lab2 QEMU 运行：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
cargo check --workspace
cargo check -p os-sbi
cargo check -p kernel --features lab1
cargo check -p kernel --features lab2
cargo check -p kernel --features lab3
cargo check -p kernel --features lab4
cargo check -p kernel --features lab5

cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc

cargo run -p kernel --features lab1
cargo run -p kernel --features lab2
```

Linux/macOS 请将 `cargo test` 行的 `--target` 换成第 1 节 host triple 对照表中的值。

---

## 10. 一键复制：Day3 全量验证

在 Day2 基础上，增加 `os-alloc`/`os-vm` 单元测试与 Lab3 QEMU 运行（**推荐：成员 B Day3 最终验收用此块**）：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
cargo check --workspace
cargo check -p os-sbi
cargo check -p kernel --features lab1
cargo check -p kernel --features lab2
cargo check -p kernel --features lab3
cargo check -p kernel --features lab4
cargo check -p kernel --features lab5

cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1

cargo run -p kernel --features lab1
cargo run -p kernel --features lab2
cargo run -p kernel --features lab3
```

Linux/macOS：

- 将两条 `cargo test` 的 `--target` 换成对应 host triple。
- `os-vm` 测试**必须保留** `-- --test-threads=1`。

### Day3 验收勾选清单

- [ ] `cargo check --workspace` 无 error
- [ ] `os-context` 3 项 + `os-syscall` 4 项测试通过
- [ ] `os-alloc` 6 项 + `os-vm` 5 项测试通过（单线程）
- [ ] Lab1 QEMU：`Hello, OS!` 并正常关机
- [ ] Lab2 QEMU：`409684505`、`Power check ok`、`All user apps exited.`
- [ ] Lab3 QEMU：虚存启用两行日志、5 轮 `Yield round`、`All user apps exited.`

---

## 11. 运行 Lab4（QEMU）

在 Day3 基础上，使用 lab4 feature 运行进程管理测试（默认 initproc 为 `fork_test`）：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
cargo check -p kernel --features lab4
cargo run -p kernel --features lab4
```

### 成功标准

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

- lab4 嵌入的用户程序为 `fork_test`、`exec_test`、`hello`；与 lab2/3 的 `hello`/`power`/`yield` 构建集不同，**不能**用 lab4 的 QEMU 输出判断 lab2/3 回归。
- `exec_test` 验证 exec 语义：成功 exec 后原程序后续代码不执行。默认不自动运行；可选将 `kernel/src/config.rs` 的 `INITPROC_APP_ID` 改为 `1` 后重编，预期 `Before exec` → `Hello from user app!`，无 `After exec`。

---

## 12. 一键复制：Day4 全量验证

在 Day3 块基础上，增加 Lab4 QEMU 运行（**推荐：成员 B Day4 最终验收用此块**）：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
cargo check --workspace
cargo check -p os-sbi
cargo check -p kernel --features lab1
cargo check -p kernel --features lab2
cargo check -p kernel --features lab3
cargo check -p kernel --features lab4
cargo check -p kernel --features lab5

cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1

cargo run -p kernel --features lab1
cargo run -p kernel --features lab2
cargo run -p kernel --features lab3
cargo run -p kernel --features lab4
```

Linux/macOS：

- 将两条 `cargo test` 的 `--target` 换成对应 host triple。
- `os-vm` 测试**必须保留** `-- --test-threads=1`。

### Day4 验收勾选清单

- [ ] `cargo check --workspace` 无 error
- [ ] `os-context` 3 项 + `os-syscall` 4 项测试通过
- [ ] `os-alloc` 6 项 + `os-vm` 5 项测试通过（单线程）
- [ ] Lab1 QEMU：`Hello, OS!` 并正常关机
- [ ] Lab2 QEMU：`409684505`、`Power check ok`、`All user apps exited.`
- [ ] Lab3 QEMU：5 轮 `Yield round`、`All user apps exited.`
- [ ] Lab4 QEMU：`fork_test pass`、`I am parent`、`I am child`、`All processes exited.`

---

## 13. 运行 Lab5（QEMU）

在 Day4 基础上，使用 lab5 feature 运行文件系统与管道测试（默认 initproc 为 `fs_test`，链式 `exec` 进入 `pipe_test`）：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
# 若 kernel 构建卡住，先单独构建用户程序（见常见问题）
cargo build -p user --bin fs_test --bin pipe_test --bin fork_test --bin exec_test --bin hello --target riscv64gc-unknown-none-elf --release

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

- lab5 嵌入 5 个用户程序：`fs_test`、`pipe_test`、`fork_test`、`exec_test`、`hello`。
- `pipe_test pass` 由**子进程**在成功读取管道数据后打印（与内核 `wait4` yield 语义一致）。
- 内核 `kernel/src/fs.rs` 通过 `os_fs::EmbeddedFs::default_fs()` 读写 `testfile`；`os-fs` crate 的 host 单测与 QEMU 共用同一 `DEFAULT_FILES` 文件表。

---

## 14. 一键复制：Day5 全量验证

在 Day4 块基础上，扩展组件测试与 Lab5 QEMU（**推荐：成员 B Day5 最终验收用此块**）：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
cargo check --workspace
cargo check -p kernel --features lab5

cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1

cargo build -p user --bin fs_test --bin pipe_test --target riscv64gc-unknown-none-elf --release
cargo run -p kernel --features lab5 --release
cargo run -p kernel --features lab4 --release
cargo run -p kernel --features lab3 --release
```

Linux/macOS：

- 将 `cargo test` 的 `--target` 换成对应 host triple。
- `os-vm` 测试**必须保留** `-- --test-threads=1`。

### Day5 验收勾选清单

- [ ] `cargo check --workspace` 无 error
- [ ] `os-context` 3 项 + `os-syscall` 4 项 + `os-sbi` 2 项 + `os-fs` 4 项测试通过
- [ ] `os-alloc` 6 项 + `os-vm` 5 项测试通过（单线程）
- [ ] Lab5 QEMU：`fs_test pass`、`pipe_test pass`、`Hello from testfile!`、`All processes exited.`
- [ ] Lab4 QEMU 回归：`fork_test pass`、`All processes exited.`
- [ ] Lab3 QEMU 回归：5 轮 `Yield round`、`All user apps exited.`

---

## 15. 常见问题

| 现象 | 处理 |
| --- | --- |
| `cargo` / `rustc` 找不到 | 未激活环境或新开终端后未重新执行 `activate-os-env.ps1` / `activate-os-env.local.ps1` |
| `could not find Cargo.toml` | 未进入 `os-lab/`，先 `cd os-lab` |
| `rustc` 找不到或路径不对 | 重新执行激活脚本；见 [environment_setup.md](environment_setup.md) |
| `qemu-system-riscv64` 找不到 | 确认 QEMU 已安装到 `D:\AppGallery\QEMU` 且已在 PATH |
| `cargo test` 报 `can't find crate for test` 或 RISC-V 汇编错误 | 未指定 host `--target`；见本文第 4 节 |
| `cargo run` 下载 rustup 超时 | 检查网络；或先执行 `rustup update stable` |
| PowerShell 中 `lab1~lab5` 无效 | 逐条执行 `lab1`、`lab2`…`lab5`，不要用 shell 范围写法 |
| PowerShell 脚本在 `cargo run` 时提前中断 | 激活环境后设置 `$ErrorActionPreference = 'Continue'`（见第 16 节） |
| Lab2 yield 不足 5 轮 | `SYS_YIELD` 路径已触发即可；与调度实现有关，见第 6 节 |
| Lab3 无虚存启用日志 | 确认使用 `--features lab3`，而非 `lab2` |
| Lab3 yield 不足 5 轮 | 检查是否使用 `--features lab3`；分页未启用时行为同 lab2 |
| `os-vm` 单元测试崩溃或 access violation | 加 `--test-threads=1`（见第 4.2 节） |
| Lab4 无 `fork_test pass` | 确认 `--features lab4`；检查 fork 返回值与 waitpid 是否匹配子 PID |
| Lab4 仍看到 `After exec` | exec 未成功替换程序；检查 `exec` ABI（`a1` 为路径长度）或内核 `sys_execve` |
| 用 lab4 跑 lab2/3 测试失败 | lab4 构建集不同，须分别 `cargo run --features lab2` / `lab3` |
| `cargo run --features lab5` 长时间无输出 / 卡住 | `kernel/build.rs` 嵌套 cargo 可能死锁；先单独 `cargo build -p user --bin fs_test --bin pipe_test ... --release`，再 `cargo run`（A 已在 build.rs 对已有 ELF 跳过子构建） |
| Lab5 无 `fs_test pass` | 确认 `--features lab5`；检查 `open`/`read` syscall 与 `os-fs` `DEFAULT_FILES` |
| Lab5 无 `pipe_test pass` | 检查 `SYS_PIPE`（59）与 fork 后 pipe fd 继承；子进程读空时应 `yield_()` 重试；若 `pipe` 写端为 fd 1，本内核会把 `write(1,…)` 当控制台而非管道——`pipe_test` 在 `pipe()` 前用两次 `open` 占位避开 0/1 |

---

## 16. 一键复制：Day6 全量交叉回归

在 Day5 块基础上，对 **Lab1→Lab5** 做端到端交叉回归（**推荐：成员 B Day6 最终验收用此块**）。须在成员 A Day6 完成 `os-fs` 内核集成后执行，以验证 lab5 文件读取路径无退化。

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
$ErrorActionPreference = 'Continue'

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

Linux/macOS：

- 将 `cargo test` 的 `--target` 换成对应 host triple。
- `os-vm` 测试**必须保留** `-- --test-threads=1`。
- PowerShell 下若未设置 `$ErrorActionPreference = 'Continue'`，`cargo` 编译 warning 写入 stderr 可能导致脚本提前中断。

### Day6 验收勾选清单

- [ ] `cargo check --workspace` 无 error
- [ ] `os-context` 3 项 + `os-syscall` 4 项 + `os-sbi` 2 项 + `os-fs` 4 项测试通过
- [ ] `os-alloc` 6 项 + `os-vm` 5 项测试通过（单线程）
- [ ] Lab5 QEMU：`Hello from testfile!`、`fs_test pass`、`pipe_test pass`、`All processes exited.`（`os-fs` 内核集成）
- [ ] Lab4 QEMU：`I am parent`/`I am child`、`fork_test pass`、`All processes exited.`
- [ ] Lab3 QEMU：5 轮 `Yield round`、`All user apps exited.`
- [ ] Lab2 QEMU：`409684505`、`All user apps exited.`
- [ ] Lab1 QEMU：`Hello, OS!`、`os-lab kernel lab1 is running on QEMU virt.`
- [ ] `cargo check -p kernel --features lab1`…`lab5` 均可编译

---

## 17. 一键复制：Day7 终验回归

在 Day6 块基础上，增加 **B 域 clippy 全绿** 与 **README 新人 5 分钟路径** 复验（**推荐：成员 B Day7 最终验收用此块**）。

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

Linux/macOS：

- 将 `cargo test` 的 `--target` 换成对应 host triple。
- `os-vm` 测试**必须保留** `-- --test-threads=1`。

### Day7 验收勾选清单

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

**说明**：全 workspace `cargo clippy --all -D warnings` 可能因 `kernel/` 中 `PROCESS_MANAGER`、`FD_TABLES` 等 `static mut` 教学简化仍有个别 warning（属成员 A 域）；**B 域交付标准**为上述 6 个组件 crate 的 clippy 全绿。

---

## 相关文档

- [os-lab.md](os-lab.md)：自研环境入口
- [environment_setup.md](environment_setup.md)：Rust / QEMU / Git 安装路径
- [os-lab/README.md](../os-lab/README.md)：快速开始与 feature 说明
- [os-lab/tests/README.md](../os-lab/tests/README.md)：集成测试与 Day1–Day7 细则
- [os-lab/labs/lab1-bare-metal.md](../os-lab/labs/lab1-bare-metal.md)：Lab1 实验指导
- [os-lab/labs/lab2-trap-and-task.md](../os-lab/labs/lab2-trap-and-task.md)：Lab2 实验指导
- [os-lab/labs/lab3-memory.md](../os-lab/labs/lab3-memory.md)：Lab3 实验指导
- [os-lab/labs/lab4-process.md](../os-lab/labs/lab4-process.md)：Lab4 实验指导
