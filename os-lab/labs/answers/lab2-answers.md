# Lab2 参考答案与代码解读

> 本文件是 [lab2-trap-and-task.md](../lab2-trap-and-task.md) 的配套答案，含完整代码逐行解读和阅读理解题答案。
> **使用建议**：先独立完成 lab2 的【任务二：阅读理解】，再来对答案。

## 一、完整代码逐行解读

### 1.1 TrapContext（`os-context/src/lib.rs`）

TrapContext 是 trap 时保存的用户态全套寄存器状态，布局与 `trap.asm` 严格对应：

```rust
pub const TRAP_CONTEXT_SIZE: usize = 35 * 8;   // 32 GPR + 3 CSR

pub struct TrapContext {
    pub x: [usize; 32],      // 32 个通用寄存器（x0-x31）
    pub sstatus: usize,      // 监督态状态寄存器
    pub sepc: usize,         // 触发 trap 的指令地址
    pub kernel_sp: usize,    // 内核栈指针（保存以便恢复）
}
```

关键 API：

```rust
pub fn init_user(entry, user_sp, kernel_sp, sstatus) -> Self
// 构造首次进入用户态的初始上下文：sepc=entry、x[2]=user_sp、kernel_sp 保存

pub fn user_sp(&self) / set_user_sp(&mut self, sp)
// 读写用户栈指针（存在 x[2] 即 sp 寄存器位置）

pub fn syscall_id(&self) -> usize   // 取 a7（x17）= syscall 号
pub fn syscall_arg(&self, n) -> usize  // 取 a0+a(n) = 第 n 个参数
pub fn set_return_value(&mut self, val)  // 写 a0（x10）= 返回值
pub fn advance_sepc(&mut self)  // sepc += 4，跳过 ecall 指令
```

`const _: () = assert!(size_of::<TrapContext>() == TRAP_CONTEXT_SIZE);` 是编译期断言：保证结构体大小与汇编里写的 `35*8` 一致，布局错位会立即编译失败。

### 1.2 保存/恢复汇编（`os-context/src/trap.asm`）

```asm
.altmacro
.macro SAVE_GP n
    sd x\n, \n*8(sp)      # 把寄存器 x\n 存到栈偏移 n*8 处
.endm
.macro LOAD_GP n
    ld x\n, \n*8(sp)      # 从栈偏移 n*8 处恢复到 x\n
.endm
.equ TRAP_CTX_SIZE, 35 * 8
```

**`__alltraps`（trap 入口，保存上下文）**：

```asm
__alltraps:
    csrrw sp, sscratch, sp     # ① 交换 sp 和 sscratch（用户栈↔内核栈）
    addi sp, sp, -TRAP_CTX_SIZE # ② 内核栈腾出 35*8 空间
    sd x1, 1*8(sp)             # ③ 保存 x1（ra），x0 硬件恒为 0 不用存
    .set n, 2
    .rept 29                   # ④ 批量保存 x2-x30（29 个）
        SAVE_GP %n
        .set n, n+1
    .endr
    csrr t0, sstatus           # ⑤ 读 sstatus、sepc
    csrr t1, sepc
    sd t0, 32*8(sp)            # ⑥ 存到 TrapContext 的 sstatus、sepc 位置
    sd t1, 33*8(sp)
    addi t2, sp, TRAP_CTX_SIZE # ⑦ 计算原内核栈顶（用于保存到 kernel_sp）
    sd t2, 34*8(sp)
    mv a0, sp                  # ⑧ TrapContext 指针作为参数
    call trap_handler          # ⑨ 进入 Rust 的 trap_handler
    j __restore                # ⑩ 处理完，跳到恢复流程
```

**为什么是 29 个？** x0 恒为 0 不存，x1（ra）单独 `sd`（因为 `SAVE_GP` 宏里 `n*8(sp)` 对 x0 会是 `0*8(sp)`，容易和别的冲突，所以 x0、x1 特殊处理）。实际存 x1 + x2-x30 = 30 个通用寄存器，加上 sstatus/sepc/kernel_sp 共 33 个 + x0 占位 = 35 个 slot。

**`__restore`（恢复上下文并返回用户态）**：

```asm
__restore:
    ld t0, 32*8(sp)            # 从栈读 sstatus、sepc、kernel_sp
    ld t1, 33*8(sp)
    ld t2, 34*8(sp)
    csrw sstatus, t0           # 写回 CSR
    csrw sepc, t1
    csrw sscratch, t2          # 把 kernel_sp 存进 sscratch，供下次 trap 用
    ld x1, 1*8(sp)             # 恢复 x1
    .set n, 2
    .rept 29                   # 批量恢复 x2-x30
        LOAD_GP %n
        .set n, n+1
    .endr
    addi sp, sp, TRAP_CTX_SIZE # 回收栈空间
    sret                       # 返回用户态（sstatus.SPP 决定回到 U 还是 S）
```

注意 `__restore` 是和 `__alltraps` 共享的代码——`__alltraps` 末尾 `j __restore`，处理完直接复用恢复逻辑。

### 1.3 系统调用编号（`os-syscall/src/lib.rs`）

```rust
pub const SYS_WRITE: usize = 64;   // 写入（屏幕输出）
pub const SYS_EXIT: usize = 93;    // 退出
pub const SYS_YIELD: usize = 124;  // 让出 CPU
```

这些编号遵循 RISC-V Linux ABI，用编译期断言 `const _: () = assert!(SYS_WRITE == 64);` 防止写错。

### 1.4 trap 分发（`kernel/src/trap.rs`）

```rust
pub fn trap_handler(cx: &mut TrapContext) {
    let scause = read_scause();    // 读 trap 原因
    match scause {
        SCAUSE_USER_ECALL | SCAUSE_SUPERVISOR_ECALL => {
            cx.advance_sepc();     // 关键：先跳过 ecall 指令
            match cx.syscall_id() {
                SYS_WRITE => {
                    let ret = sys_write(cx.syscall_arg(0), cx.syscall_arg(1) as *const u8, cx.syscall_arg(2));
                    cx.set_return_value(ret);   // 返回值写进 a0
                }
                SYS_EXIT => sys_exit(cx.syscall_arg(0) as i32),
                SYS_YIELD => { mark_current_suspended(); run_next_task(); }
                id => { cx.set_return_value(-1); }   // 未知 syscall
            }
        }
        SCAUSE_SUPERVISOR_TIMER => { /* 时钟中断：设下次定时器，切下一个任务 */ }
        _ => { shutdown(); }   // 其他异常：直接关机
    }
}
```

### 1.5 任务管理（`kernel/src/task.rs`）

```rust
pub struct TaskControlBlock {
    pub task_status: TaskStatus,   // UnInit/Ready/Running/Exited
    pub trap_cx: TrapContext,      // 该任务的上下文
    pub user_token: usize,         // lab2 常为 0；lab3+ 为用户 satp token
    pub user_stack: [u8; USER_STACK_SIZE],
    pub kernel_stack: [u8; KERNEL_STACK_SIZE],
}
```

- `user_token`：分页开启后保存该任务用户地址空间的 satp 值；lab2 无虚存时通常为 0。
- `init_tasks`：为每个 app 构造初始 TCB，`trap_cx_init` 设置 entry 和栈。
- `run_first_task`/`run_next_task`：选一个 Ready 任务，调 `run_user_task` 进入用户态。
- `sys_write(fd, buf, len)`：把用户传的字节切片当 UTF-8 解码后 `print!`（fd 必须是 1 = stdout）。
- `sys_exit`：标记当前任务 Exited，加载并运行下一个 app。

### 1.6 用户态系统调用（`user/src/syscall.rs`）

```rust
pub fn write(fd: usize, buf: &[u8]) -> isize {
    let ret;
    unsafe {
        asm!("ecall",
            in("a7") SYS_WRITE,      // syscall 号
            in("a0") fd,             // 参数：fd
            in("a1") buf.as_ptr(),   // 参数：buf 指针
            in("a2") buf.len(),      // 参数：长度
            lateout("a0") ret,       // 返回值在 a0
        );
    }
    ret
}
```

这就是用户程序侧的 `ecall`——和内核侧的 `trap_handler` 形成完整的请求-响应闭环。

## 二、阅读理解题参考答案

### 任务二第 1 题：`csrrw sp, sscratch, sp` 的作用

执行前：`sp` = 用户栈指针，`sscratch` = 内核栈指针。这一条指令把两者交换，执行后：`sp` = 内核栈（可以安全保存寄存器），`sscratch` = 用户栈（保存了以便恢复）。必须在最前面，因为后续所有 `sd x, offset(sp)` 都依赖 `sp` 指向内核栈；先保存再换栈会写到用户栈导致破坏或崩溃。

### 任务二第 2 题：为什么保存这么多 + 漏 sepc 后果

用户程序被 trap 打断时，它的全部状态（32 GPR + sstatus + sepc）都是"正在运行中的中间结果"，必须完整保存才能精确恢复。漏保存 `sepc`：`sepc` 记录 trap 时的 PC，恢复时 `sret` 会跳到 `sepc` 指向的地址；如果 sepc 是错值，返回后会跳到不可预测的位置执行，必然崩溃。

### 任务二第 3 题：`advance_sepc` 的必要性

`ecall` 触发 trap 后，`sepc` 指向 `ecall` 指令本身的地址。返回时 `sret` 跳到 `sepc`——如果不 `advance_sepc()`（sepc 不加 4），返回后会重新执行同一条 `ecall`，再次陷入同一个 syscall，死循环。所以处理 syscall 前先 `advance_sepc()` 让 sepc 指向下一条指令。

### 任务二第 4 题：参数传递链路

用户侧 `sys_write`：`a7=64`(SYS_WRITE)、`a0=fd`、`a1=buf.as_ptr()`、`a2=buf.len()`，执行 `ecall`。trap 后 `__alltraps` 把这些寄存器存进 TrapContext.x[]（a0=x10、a1=x11、a2=x12、a7=x17）。内核 `trap_handler` 用 `cx.syscall_id()`（取 x17）确认是 WRITE，用 `cx.syscall_arg(0/1/2)`（取 x10/11/12）取出 fd/buf/len 传给 `sys_write(fd, buf, len)`。链路：用户寄存器 → TrapContext.x[] → 内核函数参数。

### 任务二第 5 题：用户栈和内核栈为什么分开

三层理由：① 安全——用户栈在用户空间，用户程序能乱写；内核栈在内核空间，用户碰不到，分开后内核有受保护的栈。② 正确——trap 时用户栈可能没映射（lab3 虚存后）或已满，内核往里写会出错。③ 隔离——用户程序的栈溢出不会破坏内核数据。合成一个栈这三点都没法保证。

## 三、任务三动手修改的现象参考

- **修改 1（hello 多说一句）**：看到两行 Hello 输出，证明用户程序修改→重新编译→内核加载运行链路通畅。
- **修改 2（注释掉 csrrw）**：崩溃或卡死。因为 sp 没换成内核栈，后续 `sd x, offset(sp)` 写到用户栈，可能访问非法地址或破坏用户数据。
- **修改 3（自定义 syscall）**：需要三处改动——`os-syscall` 加编号常量、`trap.rs` 的 match 加分支、`user/` 新程序 `ecall` 该编号。跑通后内核打印出自定义信息，完成"定义→分发→调用"闭环。
