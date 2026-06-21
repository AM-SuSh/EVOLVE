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
