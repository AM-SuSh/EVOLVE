# 实验环境安装与配置

本文说明复现本仓库参考练习与自研 `os-lab` 所需工具链。验证步骤见 [delivery-checklist.md §3](delivery-checklist.md)。

## 1. 环境要求

依据赛题 [Task.md](../Task.md) 与参考环境 [tg-rcore-tutorial](https://github.com/rcore-os/tg-rcore-tutorial)：


| 类别           | 要求                                                           |
| ------------ | ------------------------------------------------------------ |
| Rust         | stable toolchain                                             |
| 裸机目标         | `riscv64gc-unknown-none-elf`                                 |
| Rust 组件      | `rust-src`、`llvm-tools-preview`                              |
| Windows 原生编译 | Visual Studio C++ Build Tools（提供 MSVC `link.exe` / `cl.exe`） |
| 模拟器          | `qemu-system-riscv64`，建议 ≥ 7.0                               |
| Cargo 工具（推荐） | `cargo-binutils`、`cargo-clone`                               |
| 章节测试         | `tg-rcore-tutorial-checker`                                  |
| Shell        | Git Bash（运行参考实验中的 shell 脚本）                                  |




## 2. 安装步骤



### 2.1 Rust 工具链

```powershell
rustup default stable
rustup target add riscv64gc-unknown-none-elf
rustup component add rust-src llvm-tools-preview
```



### 2.2 Cargo 辅助工具

```powershell
cargo install cargo-binutils cargo-clone tg-rcore-tutorial-checker
```



### 2.3 QEMU

安装 [QEMU](https://www.qemu.org/download/) 并将 `qemu-system-riscv64` 所在目录加入 `PATH`。

### 2.4 Visual Studio C++ Build Tools（Windows）

安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，勾选「使用 C++ 的桌面开发」工作负载。`rustc` 通过 `vswhere` 自动定位 MSVC 链接器，通常无需手动写入 `PATH`。

### 2.5 Git Bash

安装 [Git for Windows](https://gitforwindows.org/)，确保 `bash` 在 `PATH` 中可用。

## 3. 环境变量

按需设置（路径替换为本机实际安装位置）：

```
CARGO_HOME=<cargo 主目录>
RUSTUP_HOME=<rustup 主目录>
PATH 包含：<cargo>/bin、<QEMU 目录>、<Git>/usr/bin
```

仓库提供 Windows 便捷脚本 [scripts/activate-os-env.ps1](../scripts/activate-os-env.ps1)，在**当前 PowerShell 会话**中设置 `CARGO_HOME`、`RUSTUP_HOME` 与 `PATH`。脚本内路径为提交方开发机示例；若与本机不符，可复制为 `scripts/activate-os-env.local.ps1`（已列入 `.gitignore`）后修改路径，再执行：

```powershell
cd <仓库根目录>
. .\scripts\activate-os-env.local.ps1   # 或 activate-os-env.ps1
```

注意：前面的点号表示 dot-source，使环境变量作用于当前会话而非子进程。

## 4. 已验证版本（参考）

提交方在以下版本组合下完成全部 exercise 与 `os-lab` 验证：

```text
rustc 1.96.0
cargo 1.96.0
QEMU 11.0.x（≥ 7.0 即可）
MSVC 14.44（Visual Studio Build Tools 2022）
```

已安装 target：`riscv64gc-unknown-none-elf`、`x86_64-pc-windows-msvc`（host 单元测试用）。

## 5. 验证命令

在仓库根目录执行：

```powershell
. .\scripts\activate-os-env.ps1    # 或本机 .local.ps1
rustc --version
cargo --version
rustup target list --installed
rustup component list --installed
qemu-system-riscv64 --version
cargo install --list
bash --version
```

以上命令均能输出版本与安装清单后，即可按 [delivery-checklist.md](delivery-checklist.md) 进行快速或完整验证。

## 6. 常见问题

- **MSVC** `link.exe` **缺失或冲突**：未安装 VS C++Build Tools 时，++`cargo install` ++可能误调用 Git 自带的 GNU++ `link.exe` ++并报++ `link: extra operand`++。安装 Build Tools 的「使用 C++ 的桌面开发」后，`rustc` 会自动选用 MSVC 链接器。
- **PowerShell 中文脚本乱码**：Windows PowerShell 5.1 默认 GBK 编码可能导致含中文的脚本解析失败。脚本文件使用 UTF-8 with BOM，或改用英文输出。

