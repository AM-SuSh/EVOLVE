# os-lab 验证执行指令

伙伴在本机复现 **成员 B Day1（Lab1）**、**Day2（Lab2）** 与 **Day3（Lab3）** 结果时，按本文顺序执行即可。

所有 `cargo` 命令必须在 **`os-lab/`** 目录下运行（workspace 根在此，不在仓库根目录）。**每新开一个 PowerShell 窗口，都必须先执行环境激活脚本**，否则会出现 `cargo` 找不到。

环境安装说明见 [environment_setup.md](environment_setup.md)。

## 验证总览

| 阶段 | 编译检查 | 组件单元测试（host） | QEMU 运行 | 关键输出 |
| --- | --- | --- | --- | --- |
| Day1 / Lab1 | `cargo check -p os-sbi`、`-p kernel --features lab1` | 无 | `cargo run -p kernel --features lab1` | `Hello, OS!` |
| Day2 / Lab2 | `-p kernel --features lab2` | `os-context` 3 项 + `os-syscall` 4 项 | `cargo run -p kernel --features lab2` | `409684505`、`Yield round` |
| Day3 / Lab3 | `-p kernel --features lab3` | `os-alloc` 6 项 + `os-vm` 5 项 | `cargo run -p kernel --features lab3` | 虚存启用日志、5 轮 `Yield round` |

**推荐顺序**：激活环境 → 工具检查 → 全 workspace 编译 → 组件单元测试 → Lab1 → Lab2 → Lab3。

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

## 11. 常见问题

| 现象 | 处理 |
| --- | --- |
| `cargo` / `rustc` 找不到 | 未激活环境或新开终端后未重新执行 `activate-os-env.ps1` / `activate-os-env.local.ps1` |
| `could not find Cargo.toml` | 未进入 `os-lab/`，先 `cd os-lab` |
| `rustc` 找不到或路径不对 | 重新执行激活脚本；见 [environment_setup.md](environment_setup.md) |
| `qemu-system-riscv64` 找不到 | 确认 QEMU 已安装到 `D:\AppGallery\QEMU` 且已在 PATH |
| `cargo test` 报 `can't find crate for test` 或 RISC-V 汇编错误 | 未指定 host `--target`；见本文第 4 节 |
| `cargo run` 下载 rustup 超时 | 检查网络；或先执行 `rustup update stable` |
| PowerShell 中 `lab1~lab5` 无效 | 逐条执行 `lab1`、`lab2`…`lab5`，不要用 shell 范围写法 |
| Lab2 yield 不足 5 轮 | `SYS_YIELD` 路径已触发即可；与调度实现有关，见第 6 节 |
| Lab3 无虚存启用日志 | 确认使用 `--features lab3`，而非 `lab2` |
| Lab3 yield 不足 5 轮 | 检查是否使用 `--features lab3`；分页未启用时行为同 lab2 |
| `os-vm` 单元测试崩溃或 access violation | 加 `--test-threads=1`（见第 4.2 节） |

---

## 相关文档

- [os-lab.md](os-lab.md)：自研环境入口
- [environment_setup.md](environment_setup.md)：Rust / QEMU / Git 安装路径
- [os-lab/README.md](../os-lab/README.md)：快速开始与 feature 说明
- [os-lab/tests/README.md](../os-lab/tests/README.md)：集成测试与 Day1/Day2/Day3 细则
- [os-lab/labs/lab1-bare-metal.md](../os-lab/labs/lab1-bare-metal.md)：Lab1 实验指导
- [os-lab/labs/lab2-trap-and-task.md](../os-lab/labs/lab2-trap-and-task.md)：Lab2 实验指导
- [os-lab/labs/lab3-memory.md](../os-lab/labs/lab3-memory.md)：Lab3 实验指导
