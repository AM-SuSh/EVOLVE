# Lab1 参考答案与代码解读

> 本文件是 [lab1-bare-metal.md](../lab1-bare-metal.md) 的配套答案，包含完整代码的逐行解读和阅读理解题的参考答案。
> **使用建议**：先独立完成 lab1 的【任务二：阅读理解】，再来这里对答案。

## 一、完整代码逐行解读

### 1.1 汇编入口 `kernel/src/entry.asm`

内核真正的第一条指令不是 Rust，而是汇编。它只做两件事：设置好栈、跳转到 Rust 函数。

```asm
    .section .text.entry
    .globl _start
_start:
    la sp, boot_stack_top      # 设置栈指针到栈顶
    call rust_main             # 进入 Rust 世界

    .section .bss.stack
    .globl boot_stack
boot_stack:
    .space 4096 * 16           # 预留 64KB 启动栈
boot_stack_top:
```

- `.section .text.entry`：把 `_start` 放进名为 `.text.entry` 的段，配合 `linker.ld` 让它成为内核镜像最前面的字节（OpenSBI 跳转过来必须落在入口上）。
- `.globl _start`：声明为全局符号，供链接器和后续汇编引用。
- `la sp, boot_stack_top`：把栈指针 `sp` 指向预分配栈的顶端。**这一步必须在 `call` 之前**——Rust 函数调用要用栈保存返回地址和局部变量，`sp` 无效时调用 Rust 函数会崩溃。
- `.space 4096 * 16`：预留 64KB 栈空间，足够 lab1 这种简单内核使用。

### 1.2 Rust 入口 `kernel/src/main.rs`

```rust
#![no_std]
#![no_main]

mod console;
mod sbi;

use core::arch::global_asm;
global_asm!(include_str!("entry.asm"));   // 把汇编嵌入进来

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    clear_bss();          // 1. 清零未初始化全局变量段
    console::init();      // 2. 控制台初始化（当前为空占位）
    println!("Hello, OS!");                 // 3. 输出
    println!("os-lab kernel lab1 is running on QEMU virt.");
    sbi::shutdown();      // 4. 关机
}
```

- `#[no_mangle]`：禁止 Rust 改名，保证汇编里 `call rust_main` 能找到这个符号。
- `extern "C"`：用 C 的调用约定，这样汇编能正确传参/返回。
- `-> !`：返回类型表示"永不返回"——内核主函数不该返回，返回了就是错误。
- `clear_bss()`：BSS 段是"未初始化的全局变量"，Rust 假设它初值为 0，但在裸机上没人保证这点，必须手动清零，否则可能读到垃圾值。

`clear_bss` 的实现：

```rust
fn clear_bss() {
    extern "C" {
        fn sbss();
        fn ebss();
    }
    let start = sbss as *const () as usize;
    let end = ebss as *const () as usize;
    unsafe {
        core::ptr::write_bytes(start as *mut u8, 0, end - start);
    }
}
```

`sbss`/`ebss` 是 `linker.ld` 中定义的两个符号，标记 BSS 段的起止地址。`write_bytes` 把这段内存逐字节清零。

panic 处理（`no_std` 程序强制要求）：

```rust
#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    println!("{}", info);
    sbi::shutdown();
}
```

发生 panic 时打印信息后关机，避免内核进入未定义状态。

### 1.3 SBI 调用 `kernel/src/sbi.rs`

内核没有驱动，怎么在屏幕上画字？答案是请 OpenSBI 代劳，通过 `ecall` 指令陷入 M-mode。

```rust
const SBI_LEGACY_CONSOLE_PUTCHAR: usize = 1;
const SBI_LEGACY_SHUTDOWN: usize = 8;

pub fn console_putchar(ch: u8) {
    unsafe {
        core::arch::asm!(
            "ecall",
            in("a7") SBI_LEGACY_CONSOLE_PUTCHAR,
            in("a0") ch as usize,
            in("a6") 0usize,
            lateout("a0") _,
        );
    }
}

pub fn shutdown() -> ! {
    unsafe {
        core::arch::asm!(
            "ecall",
            in("a7") SBI_LEGACY_SHUTDOWN,
            in("a6") 0usize,
            options(noreturn)
        );
    }
}
```

- `a7` 寄存器放"功能编号"（1 = 输出字符，8 = 关机），`a0` 放参数。
- `ecall` 是 RISC-V 的"环境调用"指令，执行后 CPU 陷入更高特权级（M-mode），由 OpenSBI 处理。
- 输出字符和关机用的是**同一条 `ecall` 指令**，区别只在 `a7` 里的功能编号。

### 1.4 控制台输出 `kernel/src/console.rs`

它把"逐字节输出"包装成 Rust 标准的 `core::fmt::Write` trait，再定义 `println!` 宏，这样就能用熟悉的语法输出格式化文本。

```rust
impl Write for Stdout {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        for byte in s.bytes() {
            crate::sbi::console_putchar(byte);   // 每个字节走一次 SBI
        }
        Ok(())
    }
}
```

`println!` 宏最终调用 `Stdout.write_fmt`，而 `write_fmt` 会对每个字符串片段调用 `write_str`，每个字节走一次 SBI 输出。

### 1.5 链接脚本 `kernel/linker.ld`

```ld
OUTPUT_ARCH(riscv)
ENTRY(_start)

BASE_ADDRESS = 0x80200000;

SECTIONS
{
    . = BASE_ADDRESS;
    .text : {
        *(.text.entry)      /* 入口段放最前 */
        *(.text .text.*)
    }
    .rodata : { *(.rodata .rodata.*) *(.srodata .srodata.*) }
    .data : { *(.data .data.*) *(.sdata .sdata.*) }
    .bss : {
        *(.bss.stack)
        sbss = .;
        *(.bss .bss.*)
        *(.sbss .sbss.*)
        ebss = .;
    }
    /DISCARD/ : { *(.eh_frame) }
}
```

- `BASE_ADDRESS = 0x80200000`：内核必须放在这个地址（OpenSBI 的加载地址，见习题 1）。
- `.text` 段最前面放 `.text.entry`，保证 `_start` 是镜像第一个字节。
- `.bss` 段里定义 `sbss`/`ebss` 符号，供 `clear_bss` 使用。

## 二、阅读理解题参考答案

### 任务二第 1 题：为什么要先设栈

`call rust_main` 是函数调用，RISC-V 调用约定要求把返回地址压入栈。如果 `sp` 还没指向有效内存，压栈会写到非法地址或覆盖关键数据，导致崩溃。所以必须先用 `la sp, boot_stack_top` 把栈指针指到预分配的栈区，再调用 Rust 函数。

### 任务二第 2 题：`-> !` 与 `clear_bss` 顺序

- `rust_main` 返回 `-> !`（never 类型）表示它永不返回。内核是系统的终点，没有"调用者"可以返回；若意外返回，CPU 会执行未定义的内存内容。

- `clear_bss()` 为什么必须在 `println!` 之前？分三层理解：

  1. **BSS 段是什么**：程序里"未初始化或初值为 0 的全局变量/静态变量"会被链接器放进 `.bss` 段。有操作系统时，加载器会在程序运行前自动把 BSS 清零；但**裸机上没有加载器**，开机时 BSS 段里是随机的垃圾值。
  2. **为什么必须清零**：Rust 语言假设所有静态变量初值合法（如 `Option` 是 `None`、`static mut` 是声明的初值）。BSS 没清零时这些变量读到的是垃圾，行为不可预测——可能打印乱码、可能死循环、可能崩溃。
  3. **为什么必须在 `println!` 之前**：`println!` 的实现链路（`console.rs` → `Stdout` → `Write` trait 的 `write_fmt`）内部可能间接引用位于 BSS 段的静态状态（如格式化相关缓冲、锁标志）。如果 BSS 没清零就先 `println!`，这些状态是垃圾值，输出可能错乱甚至卡死。所以 `clear_bss()`（用 `write_bytes` 把 `[sbss, ebss)` 逐字节写成 0）必须赶在所有可能用到静态变量的代码之前。

> 一句话：`clear_bss()` 是裸机程序"初始化运行时"的第一步，对应有 OS 环境里加载器自动做的事。它必须赶在所有可能用到静态变量的代码之前。

### 任务二第 3 题：SBI 调用的寄存器

- 输出字符时：`a7` 放功能号 `1`（console putchar），`a0` 放要输出的字符。
- 关机时：`a7` 放功能号 `8`（shutdown）。
- 两者用的是**同一条 `ecall` 指令**，区别仅在 `a7` 的值。OpenSBI 根据 `a7` 分发到不同的处理逻辑。

### 任务二第 4 题：链接地址 0x80200000

这个地址来自 QEMU `virt` 机器上 OpenSBI 固件与内核的约定。OpenSBI 自身占据 `0x80000000` 起的低地址区域（约 317KB），它把后续要跳转的 S-mode 内核镜像加载到 `0x80200000` 并从这里开始执行。可以在 OpenSBI 启动日志里看到 `Domain0 Next Address : 0x0000000080200000`，正是这个约定。

如果把 `BASE_ADDRESS` 改成远离 `0x80200000` 的值（如 `0x88000000`），内核符号地址就和实际加载地址错位——OpenSBI 仍跳到 `0x80200000`，但那里没有正确的指令，会崩溃或无输出，QEMU 报 `No enough memory to place DTB after kernel/initrd`。这正是【任务三·修改 2】要体会的现象。

> 注意：如果改成的地址离 `0x80200000` 太近（比如 `0x80100000`，只差 1MB），由于 lab1 内核镜像很小（几十 KB），加上 RISC-V 的 PC 相对寻址，内核**可能照常运行**而观察不到崩溃。所以实验里要用 `0x88000000` 这种远离的值才能稳定复现。

## 三、任务三动手修改的现象参考

- **修改 1（换欢迎语）**：能正常输出你的自定义文字，证明你已经掌握"修改 Rust 源码 → 重新编译 → QEMU 运行"的开发循环。
- **修改 2（改链接地址，用 `0x88000000`）**：QEMU 启动即报错退出，输出 `qemu-system-riscv64: No enough memory to place DTB after kernel/initrd`，exit code 非 0，看不到 `Hello, OS!`。原因是内核被链接到远离 `0x80200000` 的地址，OpenSBI 固定跳转到 `0x80200000` 后取到的不是正确指令。
- **修改 3（改小栈）**：lab1 仍能正常跑，因为它没有深层函数调用和大的局部变量，16KB 栈绰绰有余。这也提示：后续 lab（尤其是有递归/深调用的进程管理）不能随意减小栈。
