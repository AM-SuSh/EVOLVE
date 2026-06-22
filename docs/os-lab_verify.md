# os-lab 验证执行指令

伙伴在本机复现 **成员 B Day1（Lab1）** 与 **Day2（Lab2）** 结果时，按本文顺序执行即可。

所有 `cargo` 命令必须在 **`os-lab/`** 目录下运行（workspace 根在此，不在仓库根目录）。**每新开一个 PowerShell 窗口，都必须先执行环境激活脚本**，否则会出现 `cargo` 找不到。

环境安装说明见 [environment_setup.md](environment_setup.md)。

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

## 4. Day2 组件单元测试（host 目标）

`os-context` 含 RISC-V 汇编，**不能**在默认的 `riscv64gc-unknown-none-elf` 目标上跑 `cargo test`；须在 **本机 host triple** 上执行：

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

### 成功标准

```text
running 3 tests   # os-context
test result: ok. 3 passed; 0 failed

running 4 tests   # os-syscall
test result: ok. 4 passed; 0 failed
```

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

进程正常关机后回到 PowerShell 提示符（非卡死）。

## 6. 运行 Lab2（QEMU）

```powershell
cd os-lab
cargo check -p kernel --features lab2
cargo run -p kernel --features lab2
```

### Lab2 成功标准

QEMU 输出中应依次出现：

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
All user apps exited.
```

说明：

- 幂模正确结果为 **409684505**（非临时占位值 `960319429`）。
- 当前批处理调度器在单 app 调用 `yield` 且无其他 Ready 任务时会提前关机，故 yield 测试**可能只打印一行** `Yield round`；`SYS_YIELD` 路径已被触发即视为通过。

## 7. 一键复制：Day1 全量验证

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

## 8. 一键复制：Day2 全量验证

在 Day1 编译检查基础上，增加组件单元测试与 Lab2 QEMU 运行：

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

Linux/macOS 请将 `cargo test` 行的 `--target` 换成第 4 节对应 triple。

## 9. 常见问题

| 现象 | 处理 |
| --- | --- |
| `cargo` / `rustc` 找不到 | 未激活环境或新开终端后未重新执行 `activate-os-env.ps1` / `activate-os-env.local.ps1` |
| `could not find Cargo.toml` | 未进入 `os-lab/`，先 `cd os-lab` |
| `rustc` 找不到或路径不对 | 重新执行激活脚本；见 [environment_setup.md](environment_setup.md) |
| `qemu-system-riscv64` 找不到 | 确认 QEMU 已安装到 `D:\AppGallery\QEMU` 且已在 PATH |
| `cargo test` 报 `can't find crate for test` 或 RISC-V 汇编错误 | 未指定 host `--target`；见本文第 4 节 |
| `cargo run` 下载 rustup 超时 | 检查网络；或先执行 `rustup update stable` |
| PowerShell 中 `lab1~lab5` 无效 | 逐条执行 `lab1`、`lab2`…`lab5`，不要用 shell 范围写法 |
| Lab2 yield 只打印一行 | 当前已知限制，见第 6 节说明；不视为 Day2 验收失败 |

## 相关文档

- [os-lab.md](os-lab.md)：自研环境入口
- [environment_setup.md](environment_setup.md)：Rust / QEMU / Git 安装路径
- [os-lab/README.md](../os-lab/README.md)：快速开始与 feature 说明
- [os-lab/tests/README.md](../os-lab/tests/README.md)：集成测试与 Day1/Day2 细则
- [os-lab/labs/lab1-bare-metal.md](../os-lab/labs/lab1-bare-metal.md)：Lab1 实验指导
