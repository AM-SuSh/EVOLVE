# 集成测试

Day 2 起由成员 B 补充内核与用户态集成测试。

## Day 1 验证

完整步骤见仓库 [`docs/os-lab_verify.md`](../../docs/os-lab_verify.md)。

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
App 2 exited with code 0
All user apps exited.
```

说明：当前批处理调度器在单 app 调用 `yield` 且无其他 Ready 任务时会提前关机，故 yield 测试可能只打印一行 `Yield round`；`SYS_YIELD` 路径已被触发。完整协作式轮转属成员 A 后续优化。

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

说明：lab3 启用分页后 yield 应完整输出 **5 轮** `Yield round`（lab2 通常只有 1 轮），这是虚存与任务切换改进的可观察差异。
