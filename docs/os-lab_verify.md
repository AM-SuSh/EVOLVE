# os-lab 验证执行指令

伙伴在本机复现 **成员 B Day1 / Lab1** 结果时，按本文顺序执行即可。所有 `cargo` 命令必须在 **`os-lab/`** 目录下运行（workspace 根在此，不在仓库根目录）。

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

各级命令均应输出 `Finished`，无 `error`。

等价于 Makefile 的 `make check`（需 Git Bash 且已安装 `make`）：

```bash
cd os-lab
make check
```

## 4. 运行 Lab1（QEMU）

```powershell
cd os-lab
cargo run -p kernel --features lab1
```

或使用 cargo alias：

```powershell
cargo run-lab1
```

## 5. 成功标准

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

## 6. 一键复制（环境 + 全量检查 + Lab1）

将 `<仓库根目录>` 替换为实际路径（例如 `E:\HomeWorkForDaSE\Or2-1-OS`）：

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

## 7. 常见问题

| 现象 | 处理 |
| --- | --- |
| `could not find Cargo.toml` | 未进入 `os-lab/`，先 `cd os-lab` |
| `rustc` 找不到或路径不对 | 重新执行 `activate-os-env.ps1`；见 [environment_setup.md](environment_setup.md) |
| `qemu-system-riscv64` 找不到 | 确认 QEMU 已安装到 `D:\AppGallery\QEMU` 且已在 PATH |
| `cargo run` 下载 rustup 超时 | 检查网络；或在本机终端先执行一次 `rustup update stable` |
| PowerShell 中 `lab1~lab5` 无效 | 请逐条执行 `lab1`、`lab2`…`lab5`，不要用 shell 范围写法 |

## 相关文档

- [os-lab.md](os-lab.md)：自研环境入口
- [environment_setup.md](environment_setup.md)：Rust / QEMU / Git 安装路径
- [os-lab/README.md](../os-lab/README.md)：快速开始与 feature 说明
- [os-lab/labs/lab1-bare-metal.md](../os-lab/labs/lab1-bare-metal.md)：Lab1 实验指导
