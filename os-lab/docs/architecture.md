# os-lab 架构说明

## 设计目标

与参考环境 `tg-rcore-tutorial`（8 个独立内核 + 23 个 crate）不同，本环境采用：

1. **单内核渐进式架构**：一个 `kernel` 二进制，通过 Cargo feature 逐级启用功能。
2. **精简组件化**：7 个独立库 crate，两层依赖，降低初学者认知负担。
3. **内嵌验证**：后续在内核与组件中通过 `#[cfg(test)]` 与集成测试自证正确性。

## Workspace 结构

```mermaid
graph TD
    subgraph workspace [os-lab workspace]
        kernel[kernel bin]
        osSbi[os-sbi]
        osContext[os-context]
        osSyscall[os-syscall]
        osAlloc[os-alloc]
        osVm[os-vm]
        osFs[os-fs]
        user[user lib]
    end

    kernel -->|lab1+| osSbi
    kernel -->|lab2+| osContext
    kernel -->|lab2+| osSyscall
    kernel -->|lab3+| osAlloc
    kernel -->|lab3+| osVm
    kernel -->|lab5+| osFs
    osVm --> osAlloc
    osFs --> osAlloc
```

## Feature Gate 层级

```mermaid
flowchart LR
    lab1[lab1 裸机] --> lab2[lab2 中断/任务]
    lab2 --> lab3[lab3 虚存]
    lab3 --> lab4[lab4 进程]
    lab4 --> lab5[lab5 文件系统/同步]
```

| Feature | 内核模块 | 依赖 crate |
|---------|----------|------------|
| lab1 | `main`, `console` | os-sbi |
| lab2 | + `trap`, `task` | os-context, os-syscall |
| lab3 | + `mm` | os-alloc, os-vm |
| lab4 | + `process` | （沿用 lab3） |
| lab5 | + `fs`, `sync` | os-fs |

## Lab1 启动流程（当前已实现）

```mermaid
sequenceDiagram
    participant QEMU
    participant OpenSBI
    participant _start
    participant rust_main
    participant SBI

    QEMU->>OpenSBI: -bios default
    OpenSBI->>_start: 跳转 0x80200000
    _start->>_start: 设置 sp
    _start->>rust_main: call
    rust_main->>rust_main: clear_bss
    rust_main->>rust_main: println Hello
    rust_main->>SBI: shutdown
```

### 关键地址与文件

- 内核加载地址：`0x80200000`（`kernel/linker.ld`）
- 入口汇编：`kernel/src/entry.asm` → `_start`
- Rust 入口：`kernel/src/main.rs` → `rust_main`
- SBI 封装：`os-sbi` crate（legacy console / shutdown）
- 构建：`kernel/build.rs` 注入链接脚本；`.cargo/config.toml` 配置 `build-std` 与 QEMU runner

## 协作边界（三人分工）

| 目录 | 负责人 | 说明 |
|------|--------|------|
| `kernel/src/` | 成员 A | 内核主体与 feature 集成 |
| `os-*/`, `user/`, `tests/` | 成员 B | 组件 crate 与测试 |
| `labs/`, `docs/`（实验文档） | 成员 C | 实验指导与评估文档 |

Day 1 由成员 A 搭建内核骨架；成员 B 完成 `os-sbi` 与组件 crate 占位，待 Day 2–5 填充实现。

## Lab2 当前状态（Day2 已完成）

- 内核模块：`trap.rs`（syscall write/exit/yield + 定时器抢占）、`task.rs`（TCB + 批处理调度）、`loader.rs`（构建期嵌入 `.bin` 加载）。
- 组件：`os-context`（TrapContext + `trap.asm`）、`os-syscall`（编号 64/93/124 等）。
- 用户程序：`hello`、`power`、`yield`。
- 验证：`cargo run -p kernel --features lab2` 通过；`cargo test -p os-context -p os-syscall` host 测试通过。

## Lab3 当前状态（Day3 成员 A 已集成）

- 组件：`os-alloc`（栈式页帧分配）、`os-vm`（Sv39 三级页表 + `MemorySet`）。
- 内核：`mm.rs` 建立内核恒等映射与用户程序映射；`ensure_paging()` 在首次进入用户态前启用 satp。
- 用户程序：仍通过 `build.rs` 嵌入 `.bin`，按 `sys_exit` 链式加载到固定用户槽 `0x80400000`（共享页表覆写映射）。
- 验证：`cargo run -p kernel --features lab3` 通过；`cargo run -p kernel --features lab2` 回归通过。

**与计划差异（待后续迭代）**：尚未实现每任务独立地址空间与 ELF PT_LOAD 加载；`TRAMPOLINE`/`TRAP_CONTEXT` 高地址跳板未启用。

## Lab3 待集成（Day3）

- 成员 B：与 A 已实现内容对齐文档/测试（`os-alloc`、`os-vm` 已由 A 侧先行落地）。
- 成员 A（后续）：每任务独立页表、ELF PT_LOAD 加载、trampoline 高地址映射。
- 成员 C：`labs/lab3-memory.md` 初稿。

## 验证入口

```powershell
cd os-lab
cargo run -p kernel --features lab1    # QEMU 输出 Hello 并退出
cargo run -p kernel --features lab2    # 多用户程序 + syscall（Day2）
cargo run -p kernel --features lab3    # 虚存模式（Day3 目标）
make check                           # 验证 lab1–lab5 feature 均可编译
```
