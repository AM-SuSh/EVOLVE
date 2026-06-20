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
