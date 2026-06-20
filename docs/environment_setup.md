# 操作系统实验环境配置记录

## 1. 环境要求来源

根据 `Task.md` 和参考实验环境 `rcore-os/tg-rcore-tutorial` 的说明，本项目本机实验环境需要满足：

- Rust stable toolchain。
- RISC-V 64 裸机目标：`riscv64gc-unknown-none-elf`。
- Rust 组件：`rust-src`、`llvm-tools-preview`。
- QEMU：`qemu-system-riscv64`，版本建议不低于 7.0。
- 推荐 Cargo 工具：`cargo-binutils`、`cargo-clone`。
- 章节测试工具：`tg-rcore-tutorial-checker`。
- Git Bash：用于运行参考实验中的 shell 脚本。

## 2. 当前安装位置

当前环境统一安装在 `D:\AppGallery` 下：

| 组件 | 路径 |
| --- | --- |
| Cargo home | `D:\AppGallery\Rust\cargo` |
| Rustup home | `D:\AppGallery\Rust\rustup` |
| QEMU | `D:\AppGallery\QEMU` |
| Git Bash | `D:\AppGallery\Git\bin\bash.exe` |

用户级环境变量已设置为：

```powershell
CARGO_HOME=D:\AppGallery\Rust\cargo
RUSTUP_HOME=D:\AppGallery\Rust\rustup
PATH includes D:\AppGallery\Rust\cargo\bin
PATH includes D:\AppGallery\QEMU
```

新打开的终端会继承以上用户级环境变量。若当前终端未刷新环境，可在仓库根目录执行：

```powershell
. .\scripts\activate-os-env.ps1
```

注意：前面的点号表示 dot-source，作用是让脚本修改当前 PowerShell 会话的环境变量。

## 3. 已安装内容

已验证的核心版本：

```text
rustc 1.96.0 (ac68faa20 2026-05-25)
cargo 1.96.0 (30a34c682 2026-05-25)
QEMU emulator version 11.0.50
```

已安装 Rust target：

```text
riscv64gc-unknown-none-elf
x86_64-pc-windows-msvc
```

已安装 Rust 组件：

```text
rust-src
llvm-tools-x86_64-pc-windows-msvc
rust-std-riscv64gc-unknown-none-elf
```

已安装 Cargo 工具：

```text
cargo-binutils v0.4.0
cargo-clone v1.2.4
tg-rcore-tutorial-checker v0.4.8
```

## 4. 验证命令

在仓库根目录执行：

```powershell
. .\scripts\activate-os-env.ps1
rustc --version
cargo --version
rustup target list --installed
rustup component list --installed
qemu-system-riscv64 --version
cargo install --list
bash --version
```

若以上命令能正常输出版本和安装清单，则本机基础实验环境已可用于后续参考实验配置。
