# os-lab 自研教学实验环境

仓库 `os-lab/` 为赛题**自研环境**：基于 Rust + RISC-V 64 的单内核渐进式教学实验，通过 `lab1`–`lab5` feature 在同一代码库中从裸机演进到文件系统与管道。

本文为自研环境统一说明文档，集中提供环境入口、验证与复现、Web 手册使用方式。交付范围总览见 [README.md](../README.md)；仓库索引见本文与根目录 README。

## 1. 交付物入口


| 类别             | 入口                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| 设计总结报告         | [os-lab/docs/design-report.md](../os-lab/docs/design-report.md)                                                   |
| 三方对比与学习效率      | [os-lab/docs/comparison.md](../os-lab/docs/comparison.md)、[comparison-data.md](../os-lab/docs/comparison-data.md) |
| 架构与 feature 设计 | [os-lab/docs/architecture.md](../os-lab/docs/architecture.md)                                                     |
| AI 协作记录        | [os-lab/docs/ai-collaboration.md](../os-lab/docs/ai-collaboration.md)                                             |
| 实验指导（lab1–5）   | [os-lab/labs/overview.md](../os-lab/labs/overview.md)                                                             |
| 参考答案（对应【任务二】） | [os-lab/labs/answers/](../os-lab/labs/answers/)                                                                   |
| Web 学习手册源码     | `os-lab/handbook/`                                                                                                |
| 源码 workspace   | [os-lab/README.md](../os-lab/README.md)                                                                           |




## 2. 自研环境概览

`os-lab` 使用单内核 + feature gate 方案：


| Lab  | 主题          | 关键输出                            |
| ---- | ----------- | ------------------------------- |
| lab1 | 裸机启动与 SBI   | `Hello, OS!`                    |
| lab2 | Trap 与批处理任务 | `409684505`、`Yield round`       |
| lab3 | Sv39 虚存     | `virtual memory ready`          |
| lab4 | 进程管理        | `fork_test pass`                |
| lab5 | 文件系统与管道     | `fs_test pass`、`pipe_test pass` |


所有 `cargo` 命令均在 `os-lab/` 目录下执行。每次新开终端须先激活环境，否则可能出现 `cargo`、`qemu-system-riscv64` 或 `bash` 找不到。

## 3. 环境激活

环境安装见 [environment_setup.md](environment_setup.md)。在仓库根目录打开 PowerShell：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
```

若脚本内路径与本机不符，可复制为 `scripts/activate-os-env.local.ps1` 后修改路径再执行。

## 4. 快速验证

最小验证路径如下：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
cargo run -p kernel --features lab1 --release
cargo run -p kernel --features lab5 --release
cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
```

期望结果：

- Lab1 输出 `Hello, OS!`
- Lab5 输出 `fs_test pass`、`pipe_test pass`
- 组件测试全部 `ok`



## 5. 验证与复现



### 5.1 验证总览


| 范围   | 编译检查                                                | 组件单元测试（host）                        | QEMU 运行                                         | 关键输出                                        |
| ---- | --------------------------------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Lab1 | `cargo check -p os-sbi`、`-p kernel --features lab1` | 无                                   | `cargo run -p kernel --features lab1`           | `Hello, OS!`                                |
| Lab2 | `-p kernel --features lab2`                         | `os-context` 3 项 + `os-syscall` 4 项 | `cargo run -p kernel --features lab2`           | `409684505`、`Yield round`                   |
| Lab3 | `-p kernel --features lab3`                         | `os-alloc` 6 项 + `os-vm` 5 项        | `cargo run -p kernel --features lab3`           | 虚存启用日志、5 轮 `Yield round`                    |
| Lab4 | `-p kernel --features lab4`                         | Lab2/3 组件回归                         | `cargo run -p kernel --features lab4 --release` | `fork_test pass`、`I am parent`/`I am child` |
| Lab5 | `-p kernel --features lab5`                         | 全量 24 项                             | `cargo run -p kernel --features lab5 --release` | `fs_test pass`、`pipe_test pass`             |
| 完整回归 | `cargo check --workspace` + clippy                  | 全量 24 项                             | Lab1→Lab5 正序                                    | 见 [§5.11 完整验证](#511-完整验证)                   |


推荐顺序：激活环境 → 工具检查 → workspace 编译 → 组件单元测试 → Lab1 → Lab2 → Lab3 → Lab4 → Lab5。

host 单元测试必须指定本机 `--target`：


| 平台                  | `--target`                 |
| ------------------- | -------------------------- |
| Windows x64         | `x86_64-pc-windows-msvc`   |
| Linux x64           | `x86_64-unknown-linux-gnu` |
| macOS Apple Silicon | `aarch64-apple-darwin`     |
| macOS Intel         | `x86_64-apple-darwin`      |




### 5.2 检查工具版本

```powershell
Get-Command rustc,cargo,rustup,qemu-system-riscv64,bash | Format-Table Name,Source -AutoSize

rustc --version
cargo --version
qemu-system-riscv64 --version
bash --version
```



### 5.3 编译检查

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

各级命令均应输出 `Finished`，无 `error`。若使用 Git Bash 且已安装 `make`，也可执行：

```bash
cd os-lab
make check
```

`os-sbi` 含 2 项 host 单元测试（Legacy 功能号常量断言），并以 Lab1 QEMU 输出为准。

### 5.4 组件单元测试（host）

`os-context` / `os-vm` 含 RISC-V 相关逻辑，不能在 `riscv64gc-unknown-none-elf` 目标上执行 `cargo test`，须在本机 host triple 上运行。

#### 5.4.1 `os-context` + `os-syscall`

Windows：

```powershell
cd os-lab
cargo test -p os-context -p os-syscall --target x86_64-pc-windows-msvc
```

成功标准：

```text
running 3 tests
test result: ok. 3 passed; 0 failed

running 4 tests
test result: ok. 4 passed; 0 failed
```



#### 5.4.2 `os-alloc` + `os-vm`

`os-vm` 页表测试共享全局页帧分配器，必须加 `-- --test-threads=1`。

```powershell
cd os-lab
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1
```

成功标准：

```text
running 6 tests
test result: ok. 6 passed; 0 failed

running 5 tests
test result: ok. 5 passed; 0 failed
```



#### 5.4.3 全部组件测试

```powershell
cd os-lab
cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1
```



### 5.5 运行 Lab1

```powershell
cd os-lab
cargo run -p kernel --features lab1
```

或使用 cargo alias：

```powershell
cargo run-lab1
```

成功标准：

```text
Hello, OS!
os-lab kernel lab1 is running on QEMU virt.
```

OpenSBI 日志中应出现：

```text
Domain0 Next Address        : 0x0000000080200000
```

进程正常关机后回到 PowerShell 提示符，exit code 0。

### 5.6 运行 Lab2

```powershell
cd os-lab
cargo check -p kernel --features lab2
cargo run -p kernel --features lab2
```

成功标准：

```text
os-lab kernel lab2: trap and multitask.
Loading 3 user apps (batch slot at 0x80400000)...
Hello from user app!
Power test start
2^1000000002 % 998244353 = 409684505
Power check ok
Yield test start
Yield round
Yield round
Yield round
Yield round
Yield round
All user apps exited.
```

说明：

- 幂模结果应为 `409684505`
- yield 通常输出 5 轮 `Yield round`



### 5.7 运行 Lab3

```powershell
cd os-lab
cargo check -p kernel --features lab3
cargo run -p kernel --features lab3
```

成功标准：

```text
os-lab kernel lab3: enabling virtual memory...
os-lab kernel lab3: virtual memory ready.
Loading 3 user apps (batch slot at 0x80400000)...
Hello from user app!
Power test start
2^1000000002 % 998244353 = 409684505
Power check ok
Yield test start
Yield round
Yield round
Yield round
Yield round
Yield round
All user apps exited.
```

说明：

- 必须出现 `enabling virtual memory` 与 `virtual memory ready`
- yield 测试应完整输出 5 轮 `Yield round`



### 5.8 运行 Lab4

```powershell
cd os-lab
cargo check -p kernel --features lab4
cargo run -p kernel --features lab4
```

成功标准：

```text
I am parent, child_pid=2
I am child, pid=2
Process 2 exited with code 0
fork_test pass
Process 1 exited with code 0
All processes exited.
```

说明：

- lab4 嵌入的用户程序为 `fork_test`、`exec_test`、`hello`
- 若验证 `exec_test`，可将 `kernel/src/config.rs` 的 `INITPROC_APP_ID` 改为 `1` 后重编；预期 `Before exec` 后直接进入新程序输出，无 `After exec`



### 5.9 运行 Lab5

```powershell
cd os-lab
cargo build -p user --bin fs_test --bin pipe_test --bin fork_test --bin exec_test --bin hello --target riscv64gc-unknown-none-elf --release

cargo check -p kernel --features lab5
cargo run -p kernel --features lab5 --release
```

成功标准：

```text
os-lab kernel lab5: filesystem and sync.
Hello from testfile!
fs_test pass
pipe says hi
pipe_test pass
All processes exited.
```

说明：

- lab5 嵌入 5 个用户程序：`fs_test`、`pipe_test`、`fork_test`、`exec_test`、`hello`
- `pipe_test pass` 由子进程在成功读取管道数据后打印
- host 单测与 QEMU 共用 `DEFAULT_FILES` 文件表



### 5.10 快速验证

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1

cd os-lab
cargo run -p kernel --features lab1 --release
cargo run -p kernel --features lab5 --release
cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
```

期望：Lab1 输出 `Hello, OS!`；Lab5 输出 `fs_test pass`、`pipe_test pass`；组件测试全部 `ok`。

### 5.11 完整验证

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.ps1
$ErrorActionPreference = 'Continue'

cd os-lab
cargo check --workspace

cargo clippy -p os-alloc -p os-context -p os-vm -p os-syscall -p os-sbi -p os-fs -- -D warnings

cargo test -p os-context -p os-syscall -p os-sbi -p os-fs --target x86_64-pc-windows-msvc
cargo test -p os-alloc -p os-vm --target x86_64-pc-windows-msvc -- --test-threads=1

cargo run -p kernel --features lab1 --release
cargo run -p kernel --features lab2 --release
cargo run -p kernel --features lab3 --release
cargo run -p kernel --features lab4 --release

cargo build -p user --bin fs_test --bin pipe_test --bin fork_test --bin exec_test --bin hello --target riscv64gc-unknown-none-elf --release
cargo run -p kernel --features lab5 --release
```

Linux/macOS 仅需将 `cargo test` 的 `--target` 改成对应 host triple；`os-vm` 测试必须保留 `-- --test-threads=1`。

成功标准摘要：

- `cargo check --workspace` 与 clippy 无 error 或 warning
- 24 项 host 单元测试全部 `ok`
- 各 Lab QEMU 输出符合 [§5.5](#55-运行-lab1) 至 [§5.9](#59-运行-lab5) 的成功标准



## 6. Web 学习手册

`os-lab/handbook/` 是基于 VitePress 的静态学习门户，用于聚合实验指导、参考答案与设计报告。

### 6.1 主要功能


| 功能      | 说明                                              |
| ------- | ----------------------------------------------- |
| 文档聚合    | 实验指导、参考答案、设计报告等统一浏览                          |
| Mermaid | 知识地图等图表原样渲染                                     |
| 学习进度    | 首页与“学习进度”页可勾选 Lab1–Lab5 步骤（浏览器 localStorage 保存） |
| 命令复制    | 各 Lab 验证命令、环境激活命令一键复制                           |




### 6.2 本地运行

前置： [Node.js](https://nodejs.org/) 18+（含 `npm`）

```powershell
cd os-lab/handbook
npm install
npm run dev
```

浏览器打开终端提示的地址（默认 `http://localhost:5173`）。

`npm run dev` 与 `npm run build` 会自动从 `os-lab/labs/`、`os-lab/docs/`、仓库 `docs/` 同步 Markdown 到站点内容目录。

### 6.3 构建静态站点

```powershell
cd os-lab/handbook
npm run build
npm run preview
```

构建产物位于 `os-lab/handbook/.vitepress/dist/`。

### 6.4 与验证路径的关系

手册是教学体验增强入口，不改变内核代码与 QEMU 验证结论；终端复现以本文第 4 节、第 5 节为准。

## 7. 常见问题


| 现象                                 | 处理                                                      |
| ---------------------------------- | ------------------------------------------------------- |
| `cargo` / `rustc` 找不到              | 未激活环境或新开终端后未重新执行激活脚本                                    |
| `could not find Cargo.toml`        | 未进入 `os-lab/`，先 `cd os-lab`                             |
| `rustc` 路径不对                       | 重新执行激活脚本；见 [environment_setup.md](environment_setup.md) |
| `qemu-system-riscv64` 找不到          | 确认 QEMU 已安装且在 `PATH` 中                                  |
| `cargo test` 报 host 相关错误           | 未指定本机 `--target`                                        |
| PowerShell 中 `lab1~lab5` 无效        | 逐条执行 `lab1`、`lab2`、`lab3`、`lab4`、`lab5`                 |
| `os-vm` 单元测试崩溃                     | 加 `-- --test-threads=1`                                 |
| Lab2 yield 不足 5 轮                  | 确认 `SYS_YIELD` 路径触发；实现差异可能导致输出轮数变化                      |
| Lab3 无虚存启用日志                       | 确认使用 `--features lab3`                                  |
| Lab4 无 `fork_test pass`            | 确认使用 `--features lab4`，检查 fork 返回值与 waitpid             |
| 用 lab4 跑 lab2/3 测试失败               | 各 Lab 构建集不同，须分别用对应 feature 回归                           |
| `cargo run --features lab5` 长时间无输出 | 先单独 `cargo build -p user ... --release` 再运行             |
| Lab5 无 `fs_test pass`              | 检查 `open`/`read` syscall 与 `os-fs` `DEFAULT_FILES`      |
| Lab5 无 `pipe_test pass`            | 检查 `SYS_PIPE` 与 fork 后 pipe fd 继承                       |




## 8. 相关文档

- [README.md](../README.md)：仓库导航与交付索引
- [environment_setup.md](environment_setup.md)：工具链安装
- [os-lab/README.md](../os-lab/README.md)：源码 workspace 快速开始
- [os-lab/tests/README.md](../os-lab/tests/README.md)：集成测试说明
- [os-lab/labs/overview.md](../os-lab/labs/overview.md)：实验总览
- [os-lab/docs/design-report.md](../os-lab/docs/design-report.md)：设计总结报告



## 9. 与参考环境的关系

参考环境 `reference/tg-rcore-tutorial` 用于 **30% 练习** 对照；自研环境在 `os-lab/` 独立演进，不修改参考仓库。base 测试与练习实现见 [reference-report.md](reference-report.md)。