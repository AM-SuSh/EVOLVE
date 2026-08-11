<script lang="ts">
export interface FinalProjectLeaderboardMetric {
  id: string
  label: string
  unit: string
  direction: 'higher' | 'lower'
}

export interface FinalProjectLeaderboard {
  metrics: FinalProjectLeaderboardMetric[]
}

export interface FinalProjectDraft {
  title: string
  kind: string
  description: string
  mechanisms: string[]
  verificationCommand: string
  rubric: string[]
  leaderboard?: FinalProjectLeaderboard
}

const APP_TASK_MARKDOWN = `# 实验 9A：终端小应用

> 前置知识：Lab1-8 全部完成；本任务运行在你自己的 Lab8 内核上。

## 零、开始之前

1. 已跑通 Lab8 全链，确认 \`make test-lab8\` 通过。
2. 已理解用户程序如何嵌入内核：\`user/src/bin/\` 中的 bin 会构建到 \`KERNEL_APP_DIR\`，并由 \`kernel/src/loader.rs\` 登记。
3. 建议先重读 Lab4 进程、Lab5 管道、Lab7 信号、Lab8 线程的调用入口，再开始写作品。

## 一、问题场景

你已经拥有一个能跑进程、文件、管道、信号与线程的小内核，但它还缺少一个能证明这些能力可以组合成真实作品的例子。这个任务要求你**把系统调用变成可演示的程序**：一个运行在 QEMU 终端里的字符应用。

| 关键能力 | 在作品中的体现 |
| --- | --- |
| 进程 | fork/exec/wait、进程树、协作计算 |
| IPC | pipe/dup、进程间接力与重定向 |
| 信号 | 通知、超时、退出控制 |
| 并发 | 线程、mutex/condvar、任务队列 |
| 文件 | 读写文件、持久化成绩或存档 |

## 二、背景知识

终端小应用没有独立 GUI，它以 **stdout 输出** 呈现。程序从 \`main()\` 开始，通过 \`user_lib\` 提供的 syscall 完成计算、协作与交互。

运行前需要理解两件事：

1. **bin 必须被 loader 登记**：只放到 \`user/src/bin/\` 还不够，还需要在 \`kernel/src/loader.rs\` 中加入 \`include_bytes!\`，并把 \`NUM_APP\` 和 \`INITPROC_APP_ID\` 调整好，内核才会运行它。
2. **fd 0/1 是控制台**：使用管道前要先占住低 fd，否则管道端可能落到控制台。

## 三、实验任务

### 任务一：完成一个终端小应用

| 可选方向 | 例子 |
| --- | --- |
| 字符游戏 | 贪吃蛇、2048、打字竞速、迷宫 |
| 进程实验场 | 多进程流水线、赛跑动画、进程树 |
| 多线程作品 | 任务队列、聊天室、并发渲染 |
| 自定义 | 说明为什么需要至少 4 种机制 |

### 任务二：机制要求

必须使用以下机制中**至少 4 种**：

\`fork/exec/wait\`、\`pipe/dup\`、\`signal\`、\`mmap\`、\`文件读写\`、\`threads\`、\`mutex/condvar/semaphore\`、\`set_priority\`

### 任务三：自主创新

至少包含一个自主创新点：自创玩法、自创算法、自创交互，或把多个机制组合成新功能。

## 四、验证

### 4.1 运行检查单

1. 用「我的系统」add-bin 登记 \`final_app\`。
2. 在 \`kernel/src/loader.rs\` 加入 \`include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/final_app"))\`。
3. \`NUM_APP\` 加 1，\`INITPROC_APP_ID\` 指向新下标。
4. 运行 \`cargo run -p kernel --features lab8 --release\`。
5. 把 QEMU 终端输出保存为运行证据。

### 4.2 示例代码：进程接力赛

\`\`\`rust
#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, exit, fork, open, pipe, print_usize, println, read, waitpid, write, yield_};

global_asm!(include_str!("../entry.asm"));

fn recv(fd: usize) -> u8 {
    let mut buf = [0u8; 1];
    loop {
        let n = read(fd, &mut buf);
        if n > 0 {
            return buf[0];
        }
        let _ = yield_();
    }
}

#[no_mangle]
pub fn main() -> ! {
    println("[final_app] 进程接力赛开始");
    let h0 = open("testfile");
    let h1 = open("testfile");
    if h0 < 0 || h1 < 0 {
        println("[final_app] open placeholder failed");
        exit(1);
    }
    let mut fds = [0i32; 2];
    if pipe(&mut fds) < 0 {
        println("[final_app] pipe failed");
        exit(1);
    }
    let _ = close(h0 as usize);
    let _ = close(h1 as usize);
    let pid = fork();
    if pid < 0 {
        println("[final_app] fork failed");
        exit(1);
    }
    if pid == 0 {
        let _ = close(fds[0] as usize);
        for step in 0..5 {
            let token = b'A' + step as u8;
            let _ = write(fds[1] as usize, &[token]);
            println("[final_app] child passed a token");
            let _ = yield_();
        }
        let _ = close(fds[1] as usize);
        exit(0);
    }
    let _ = close(fds[1] as usize);
    let mut got = 0;
    while got < 5 {
        let _ = recv(fds[0] as usize);
        got += 1;
        print_usize(got);
        println(" tokens received by parent");
    }
    let mut code = 0i32;
    let _ = waitpid(pid, &mut code);
    println("[final_app] relay finished");
    exit(0);
}
\`\`\`

### 4.3 完成线

| 等级 | 要求 |
| --- | --- |
| 及格 | 跑通示例并替换成自己的玩法或交互 |
| 良好 | 使用至少 4 种机制，加入一个创新点 |
| 优秀 | 可演示、机制证据完整，并解释一次设计或调试取舍 |

## 五、AI 提问模板

- 概念澄清：fork 后管道两端的引用计数由谁维护？
- 代码追因：为什么 \`write(fd, ...)\` 可能返回 -1？
- 对比迁移：线程和进程哪个更适合做共享状态？

## 六、思考题与参考答案

- 你的作品为什么需要这 4 种机制？参考答案：每种机制都承担不可替代的职责，例如进程提供执行边界，管道提供数据流，信号提供异步通知，锁保护共享状态。
- 如果去掉其中一种机制，会退化成什么？参考答案：例如去掉同步原语，共享状态会出现竞态，程序结果不再确定。
- 如何证明它运行在你自己的内核？参考答案：给出 QEMU 输出、对应 \`kernel/src/\` 改动与 runId。
`

const PERFORMANCE_TASK_MARKDOWN = `# 实验 9B：性能画像与调优

> 前置知识：Lab1-8 全部完成；本任务要求先实现用户态时间读数，再测量并优化内核。

## 零、开始之前

1. 已跑通 Lab8 全链。
2. 理解 \`read_time()\` 与 \`CLOCK_FREQ\`：时间戳换算公式为 \`us = time * 1_000_000 / CLOCK_FREQ\`。
3. 理解自定义 bin 的运行登记方式（\`loader.rs\` + \`INITPROC_APP_ID\`）。

## 一、问题场景

内核完成不等于“够快”。性能画像要回答：**我的内核哪一部分最贵？改一处会产生多大影响？用什么证据支持结论？**

| 需要回答的问题 | 对应的证据 |
| --- | --- |
| 系统调用是否昂贵 | 平均延迟、调用次数 |
| 调度切换是否频繁 | 切换开销、任务数 |
| 内存分配是否成为瓶颈 | 分配吞吐、页数 |
| 锁竞争是否拖慢并发 | 平均等待、唤醒次数 |

## 二、背景知识

### 2.1 用户态时间读数

当前内核没有向用户程序提供时间 syscall。你需要新增一个最小 \`get_time_us\`：

1. 在 \`kernel/src/trap.rs\` 的 syscall 分发中新增 1003。
2. 返回 \`read_time()\` 换算后的微秒值。
3. 在 \`user/src/syscall.rs\` 与 \`user/src/lib.rs\` 中封装并导出。

### 2.2 打榜指标

| 指标 | 含义 | 单位 | 方向 |
| --- | --- | --- | --- |
| syscall-latency-ns | 单次 write/getpid/yield 平均延迟 | ns | 越小越好 |
| ctx-switch-us | 两次 yield 切换开销 | us | 越小越好 |
| alloc-ops-ms | 连续 mmap/munmap 吞吐 | ops/ms | 越大越好 |
| pipe-mbps | 父子进程管道吞吐 | MB/s | 越大越好 |
| lock-wait-us | 多线程 mutex 平均等待 | us | 越小越好 |

## 三、实验任务

### 任务一：实现时间 syscall

在 \`kernel/src/trap.rs\` 中新增：

\`\`\`rust
1003 => {
    cx.set_return_value(crate::riscv::read_time() * 1_000_000 / crate::config::CLOCK_FREQ);
}
\`\`\`

### 任务二：一次提交五个榜

五个指标都要测量；一次运行得到五列成绩，并在任务页一次性提交。提交接口会同时更新五个榜单，同一指标只保留更优值。

### 任务三：设计实验并优化

1. 写可重复 benchmark：固定规模、多次采样、去掉冷启动。
2. 选择一个自变量：调度、分配器、管道缓冲、锁实现、syscall 实现。
3. 提出可证伪假设：改 X 后 Y 会变好，因为 Z。
4. 至少 3 次取中位数，保留每次 runId。
5. 允许自选指标或自创基准负载。

## 四、验证

### 4.1 用户态封装示例

\`\`\`rust
pub fn get_time_us() -> usize {
    let ret;
    unsafe {
        core::arch::asm!(
            "ecall",
            in("a7") 1003usize,
            lateout("a0") ret,
        );
    }
    ret
}
\`\`\`

### 4.2 基准程序示例

下面的示例只展示 syscall 延迟测量；五合一 \`bench_all.rs\` 完整代码位于 lab8check 工作区，一次运行输出五个指标，任务页一次提交同时更新五个榜。

\`\`\`rust
#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, get_time_us, print_usize, println, write};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    const SAMPLES: usize = 1000;
    let mut total = 0usize;
    for _ in 0..SAMPLES {
        let start = get_time_us();
        let _ = write(1, &[b'x']);
        let end = get_time_us();
        total += end.saturating_sub(start);
    }
    let avg_ns = total * 1000 / SAMPLES;
    print_usize(avg_ns);
    println(" ns per write syscall (baseline)");
    exit(0);
}
\`\`\`

### 4.3 运行检查单

1. 登记 \`bench_all\`。
2. \`loader.rs\` 加入 \`include_bytes!\`，\`NUM_APP\` 加 1，\`INITPROC_APP_ID\` 指向新下标。
3. 运行 \`cargo run -p kernel --features lab8 --release\`，得到基线。
4. 选择指标做最小优化，重新测量后一次性提交五个指标。

### 4.4 完成线

| 等级 | 要求 |
| --- | --- |
| 及格 | 实现时间 syscall，跑通基准并提交五个基线成绩 |
| 良好 | 做一个最小优化，给出前后对比 |
| 优秀 | 解释变量为什么影响该指标，并提交更优打榜成绩 |

## 五、AI 提问模板

- 概念澄清：\`read_time()\` 的单位如何换算？
- 代码追因：syscall 延迟主要花在 trap 保存还是 syscall 实现？
- 对比迁移：为什么测量要取中位数而不是最小值？

## 六、思考题与参考答案

- 你如何证明测到的数值不是噪声？参考答案：多次采样取中位数，并保留 runId 与相同输入规模。
- 优化为什么只改一处？参考答案：只改一处才能建立因果证据；同时改多处无法归因。
- 打榜成绩与报告证据的关系？参考答案：成绩用于排名，报告用于解释和复核。
`

export const FINAL_PROJECT_PRESETS: Record<string, FinalProjectDraft> = {
  app: {
    title: '终端小应用：在我的内核里跑一个作品',
    kind: 'app',
    description: `# 终端小应用：在我的内核里跑一个作品

## 任务速览

| 项目 | 内容 |
| --- | --- |
| 运行环境 | 你自己的 Lab8 内核 |
| 完成形式 | 用户态程序 + QEMU 终端演示 |
| 机制要求 | 至少 4 种系统机制 |
| 最低完成线 | 跑通示例并替换成自己的玩法 |
| 最终提交 | 实验报告 + 运行证据 |

## 任务背景

你已经完成了 8 层内核：启动、trap、虚存、进程、文件、磁盘 FS、信号/IPC、线程与同步。这个期末任务把这些能力真正用起来：在**你自己的 Lab8 内核**上，用用户态程序做一个能演示、能玩、能讲清楚的作品。

## 可选方向（四选一）

1. 字符游戏：贪吃蛇、2048、打字竞速、迷宫、回合制小游戏。
2. 进程实验场：多个 fork 出的进程通过管道协作，例如流水线计算、赛跑动画、进程树演示。
3. 多线程作品：用线程 + mutex/condvar 实现任务队列、聊天室、并发渲染。
4. 自定义应用：只要你说明它为什么需要用到至少 4 种系统机制。

## 硬性要求

- 代码必须跑在你的 Lab8 内核上，放在 \`user/src/bin/final_app.rs\` 并通过额外 bin 登记。
- 必须用到以下机制中**至少 4 种**：fork/exec/wait、pipe/dup、signal、mmap、文件读写、线程、mutex/condvar/semaphore、set_priority。
- 至少有一个**自主创新点**：自创玩法、自创算法、自创交互，或把多个机制组合成新功能。
- 报告里必须给出：运行输出、机制清单与代码位置、一次成功运行证据、失败修复记录、反思。

## 交付物

- 源码：\`user/src/bin/final_app.rs\`
- 演示输出：运行时的终端记录
- 报告：含机制证据与反思

## 示例起点（可直接运行）

下面是一个「进程接力赛」例子：父子进程通过管道传递 5 个令牌，覆盖 fork / pipe / read / write / waitpid / yield。把它贴进 \`user/src/bin/final_app.rs\`；运行前需要在 \`kernel/src/loader.rs\` 的 APP_ELF/APP_BINARIES 中加入该 bin，并把 \`INITPROC_APP_ID\` 指向它（或者临时替换已嵌入的 bin 来验证）。

\`\`\`rust
#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{close, exit, fork, open, pipe, print_usize, println, read, waitpid, write, yield_};

global_asm!(include_str!("../entry.asm"));

fn recv(fd: usize) -> u8 {
    let mut buf = [0u8; 1];
    loop {
        let n = read(fd, &mut buf);
        if n > 0 {
            return buf[0];
        }
        let _ = yield_();
    }
}

#[no_mangle]
pub fn main() -> ! {
    println("[final_app] 进程接力赛开始");

    // 先占住 fd 0/1，避免管道端落到控制台 fd。
    let h0 = open("testfile");
    let h1 = open("testfile");
    if h0 < 0 || h1 < 0 {
        println("[final_app] open placeholder failed");
        exit(1);
    }

    let mut fds = [0i32; 2];
    if pipe(&mut fds) < 0 {
        println("[final_app] pipe failed");
        exit(1);
    }
    let _ = close(h0 as usize);
    let _ = close(h1 as usize);

    let pid = fork();
    if pid < 0 {
        println("[final_app] fork failed");
        exit(1);
    }

    if pid == 0 {
        let _ = close(fds[0] as usize);
        for step in 0..5 {
            let token = b'A' + step as u8;
            if write(fds[1] as usize, &[token]) < 0 {
                println("[final_app] child write failed");
                exit(1);
            }
            println("[final_app] child passed a token");
            let _ = yield_();
        }
        let _ = close(fds[1] as usize);
        exit(0);
    }

    let _ = close(fds[1] as usize);
    let mut got = 0;
    while got < 5 {
        let _ = recv(fds[0] as usize);
        got += 1;
        print_usize(got);
        println(" tokens received by parent");
    }

    let mut code = 0i32;
    let _ = waitpid(pid, &mut code);
    println("[final_app] relay finished");
    exit(0);
}
\`\`\`

## 运行检查单

1. 在工作台「我的系统」用 add-bin 登记 \`final_app\`。
2. 确认 \`user/Cargo.toml\` 里有 \`final_app\` 的 \`[bin]\`。
3. 在 \`kernel/src/loader.rs\` 的 APP_ELF/APP_BINARIES 中加入 \`include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/final_app"))\`。
4. 把 \`loader.rs\` 的 \`NUM_APP\` 加 1，并把 \`config.rs\` 的 \`INITPROC_APP_ID\` 改成新下标。
5. 运行 \`cargo run -p kernel --features lab8 --release\`。

## 完成线

- 及格：跑通示例，并把它替换成你自己的一个玩法或交互。
- 良好：使用至少 4 种机制，并加入一个自主创新点。
- 优秀：作品可演示、机制证据完整，并解释一次设计或调试上的取舍。

## 降低难度提示

如果修改 \`loader.rs\` 暂时卡住，可以先把示例代码贴进已嵌入的 \`hello\` 或 \`fs_test\` 验证整条运行链路；跑通后再复制回 \`final_app.rs\` 并完成正式登记。及格线不要求完整游戏，只要求一个能演示、能讲清楚机制的替换玩法。

你的作品要在这个基础上增加玩法、算法或机制组合，不能只提交这个例子。`,
    mechanisms: [
      'fork/exec/wait',
      'pipe/dup',
      'signal',
      'mmap',
      '文件读写',
      'threads',
      'mutex/condvar/semaphore',
      'set_priority',
    ],
    verificationCommand: 'cargo build -p user --bin final_app --release',
    rubric: ['选题与创意', '系统机制运用', '运行与稳定性', '报告与证据', '反思与迁移'],
  },
  performance: {
    title: '性能画像与调优：给你的内核做一次体检',
    kind: 'performance',
    description: `# 性能画像与调优：给你的内核做一次体检

## 任务速览

| 项目 | 内容 |
| --- | --- |
| 运行环境 | 你自己的 Lab8 内核 |
| 前置改造 | 用户态时间 syscall |
| 打榜指标 | 5 个固定指标中选 1 个 |
| 最低完成线 | 跑通基准并提交基线成绩 |
| 最终提交 | 打榜成绩 + 实验报告 |

## 任务背景

性能画像不是简单“跑得更快”，而是能回答：我的内核哪一个子系统最贵？改一处会产生多大影响？用什么证据支持结论？

## 第一步：给内核加用户态时间读数

当前内核没有向用户程序提供时间 syscall。为了让性能可测，你要在内核中实现一个最小 \`get_time_us\`（或等价时间接口）：

- 在内核 trap 分发中新增一个系统调用号（建议 1003，避开现有编号）。
- 返回 \`read_time()\` 换算为微秒后的值，用户程序通过 \`ecall\` 读取。
- 说明你如何保证数值单调、单位一致。

> 如果你的内核已经有用户态时间接口，可以跳过这一步，但要说明具体 API 和换算方式。

## 第二步：选择一个打榜指标

从以下指标中选一个，作为你的“打榜成绩”：

- \`syscall-latency-ns\`：单次 write/getpid/yield 平均延迟，单位 ns，越小越好。
- \`ctx-switch-us\`：两个进程/线程 yield 切换一次的开销，单位 us，越小越好。
- \`alloc-ops-ms\`：连续 mmap/munmap 或页分配操作数/ms，越大越好。
- \`pipe-mbps\`：父子进程通过管道搬运数据的吞吐，单位 MB/s，越大越好。
- \`lock-wait-us\`：多线程争用 mutex 时的平均等待时间，单位 us，越小越好。

## 第三步：设计实验

- 写一个可重复的 benchmark 程序：固定输入规模、多次采样、去掉冷启动。
- 选择一个自变量：调度策略/优先级、内存分配算法、管道缓冲大小、锁实现、系统调用实现等。
- 提出可证伪假设：改 X 后 Y 会变好，因为 Z。
- 先测基线，再做一处最小修改，再回归；至少 3 次取中位数。
- 保留每次成功 runId，作为打榜证据。

## 自主创新

- 自选一个指标/变量，或自己设计一个基准负载。
- 允许提出一个优化，但必须解释为什么只改这一处就能影响该指标。

## 交付物

- 时间 syscall 实现与说明
- benchmark 源码：\`user/src/bin/bench_<metric>.rs\`
- 数据表：指标、变量、基线、优化后、样本数
- 打榜：在任务页提交最佳成绩与 runId

## 示例起点：先得到你自己的基线

**1. 内核加时间 syscall**

在 \`kernel/src/trap.rs\` 的 syscall 分发中新增：

\`\`\`rust
1003 => {
    cx.set_return_value(crate::riscv::read_time() * 1_000_000 / crate::config::CLOCK_FREQ);
}
\`\`\`

在 \`user/src/syscall.rs\` 新增用户态封装：

\`\`\`rust
pub fn get_time_us() -> usize {
    let ret;
    unsafe {
        core::arch::asm!(
            "ecall",
            in("a7") 1003usize,
            lateout("a0") ret,
        );
    }
    ret
}
\`\`\`

并把 \`get_time_us\` 加进 \`user/src/lib.rs\` 的 \`pub use\`。

**2. 基准程序**

把下面的程序放成 \`user/src/bin/bench_syscall.rs\`，在 \`kernel/src/loader.rs\` 中登记并让 \`INITPROC_APP_ID\` 指向它：

\`\`\`rust
#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, get_time_us, print_usize, println, write};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    const SAMPLES: usize = 1000;
    let mut total = 0usize;
    for _ in 0..SAMPLES {
        let start = get_time_us();
        let _ = write(1, &[b'x']);
        let end = get_time_us();
        total += end.saturating_sub(start);
    }
    let avg_ns = total * 1000 / SAMPLES;
    print_usize(avg_ns);
    println(" ns per write syscall (baseline)");
    exit(0);
}
\`\`\`

## 运行检查单

1. 登记 \`bench_syscall\` 到 \`user/Cargo.toml\`。
2. 在 \`kernel/src/loader.rs\` 中加入 \`include_bytes!(concat!(env!("KERNEL_APP_DIR"), "/bench_syscall"))\`，\`NUM_APP\` 加 1，\`INITPROC_APP_ID\` 指向新下标。
3. 运行 \`cargo run -p kernel --features lab8 --release\`，得到你自己的基线。
4. 选择 5 个指标之一做最小优化并重新测量。

## 完成线

- 及格：实现时间 syscall，跑通基准程序并提交一个基线成绩。
- 良好：选择一个变量做一次最小优化，给出前后对比。
- 优秀：解释该变量为什么影响该指标，并提交更优打榜成绩。

## 降低难度提示

时间 syscall 可以先按示例代码照抄，不要求一次理解全部内核流程；先把基准程序跑通并提交一个基线成绩，这部分已经算及格。优化放在报告和打榜里，不计入及格门槛。

先跑一次得到你自己的基线，再选择 5 个打榜指标之一做优化。`,
    mechanisms: [
      '新增/使用时间 syscall',
      'syscall 调用',
      'fork/yield 调度',
      'mmap/munmap',
      'pipe',
      'threads/mutex',
    ],
    verificationCommand: 'cargo build -p user --bin bench_all --release',
    rubric: ['时间接口与可测性', '实验设计与变量控制', '基线质量', '优化影响与证据', '打榜成绩'],
    leaderboard: {
      metrics: [
        { id: 'syscall-latency-ns', label: '系统调用平均延迟', unit: 'ns', direction: 'lower' },
        { id: 'ctx-switch-us', label: '任务切换开销', unit: 'us', direction: 'lower' },
        { id: 'alloc-ops-ms', label: '内存分配吞吐', unit: 'ops/ms', direction: 'higher' },
        { id: 'pipe-mbps', label: '管道吞吐', unit: 'MB/s', direction: 'higher' },
        { id: 'lock-wait-us', label: '锁平均等待', unit: 'us', direction: 'lower' },
      ],
    },
  },
}

// 任务书正文按 Lab 手册「零～六」章节风格重写，覆盖上面旧版内联正文。
FINAL_PROJECT_PRESETS.app.description = APP_TASK_MARKDOWN
FINAL_PROJECT_PRESETS.performance.description = PERFORMANCE_TASK_MARKDOWN
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Boxes, Gauge, Save, Trash2 } from 'lucide-vue-next'

const props = defineProps<{ initial: FinalProjectDraft; busy?: boolean }>()
const emit = defineEmits<{
  (event: 'save', draft: FinalProjectDraft): void
  (event: 'clear'): void
}>()

function cloneDraft(source: FinalProjectDraft): FinalProjectDraft {
  return {
    title: source.title,
    kind: source.kind,
    description: source.description,
    mechanisms: [...(source.mechanisms || [])],
    verificationCommand: source.verificationCommand,
    rubric: [...(source.rubric || [])],
    leaderboard: source.leaderboard
      ? { metrics: source.leaderboard.metrics.map((metric) => ({ ...metric })) }
      : undefined,
  }
}

const draft = ref<FinalProjectDraft>(cloneDraft(props.initial))
watch(
  () => props.initial,
  (value) => {
    draft.value = cloneDraft(value)
  },
  { immediate: true },
)

const mechanismsText = computed({
  get: () => draft.value.mechanisms.join('\n'),
  set: (value: string) => {
    draft.value.mechanisms = value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
  },
})

const rubricText = computed({
  get: () => draft.value.rubric.join('\n'),
  set: (value: string) => {
    draft.value.rubric = value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
  },
})

function submit() {
  emit('save', {
    title: draft.value.title.trim(),
    kind: draft.value.kind,
    description: draft.value.description.trim(),
    mechanisms: draft.value.mechanisms
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12),
    verificationCommand: draft.value.verificationCommand.trim(),
    rubric: draft.value.rubric
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10),
    leaderboard: draft.value.leaderboard
      ? {
          metrics: draft.value.leaderboard.metrics.map((metric) => ({
            id: metric.id,
            label: metric.label,
            unit: metric.unit,
            direction: metric.direction,
          })),
        }
      : undefined,
  })
}

function loadPreset(kind: string) {
  const preset = FINAL_PROJECT_PRESETS[kind]
  if (!preset) return
  draft.value = cloneDraft(preset)
}
</script>

<template>
  <div class="fp-editor">
    <div class="fp-presets">
      <span>内置模板</span>
      <button type="button" class="fp-button ghost" @click="loadPreset('app')">
        <Boxes :size="14" aria-hidden="true" />终端小应用
      </button>
      <button type="button" class="fp-button ghost" @click="loadPreset('performance')">
        <Gauge :size="14" aria-hidden="true" />性能画像与调优
      </button>
    </div>

    <label class="fp-field">
      <span>任务名称</span>
      <input v-model="draft.title" type="text" maxlength="80" placeholder="例如：我的内核性能画像" />
    </label>

    <label class="fp-field">
      <span>探索方向</span>
      <select v-model="draft.kind" aria-label="期末探索任务方向">
        <option value="performance">性能画像与调优</option>
        <option value="app">终端小应用</option>
        <option value="debug">故障注入与排障</option>
        <option value="open">开放课题</option>
        <option value="custom">自定义探索</option>
      </select>
    </label>

    <label class="fp-field">
      <span>任务书（Markdown）</span>
      <textarea
        v-model="draft.description"
        rows="8"
        placeholder="写明期末任务的背景、目标、可选方向与交付要求。学生端会原样渲染 Markdown。"
      />
    </label>

    <label class="fp-field">
      <span>必须用到的系统机制（每行一条）</span>
      <textarea
        v-model="mechanismsText"
        rows="3"
        placeholder="fork/exec/pipe&#10;signal/dup&#10;threads/mutex/condvar&#10;文件系统"
      />
    </label>

    <label class="fp-field">
      <span>验证命令（可选）</span>
      <input
        v-model="draft.verificationCommand"
        type="text"
        placeholder="例如：cargo build -p user --bin final_project --release"
      />
    </label>

    <label class="fp-field">
      <span>评分维度（每行一条）</span>
      <textarea v-model="rubricText" rows="4" />
    </label>

    <div class="fp-actions">
      <button type="button" class="fp-button ghost" :disabled="busy" @click="emit('clear')">
        <Trash2 :size="14" aria-hidden="true" />清除发布
      </button>
      <button
        type="button"
        class="fp-button"
        :disabled="busy || !draft.title.trim() || !draft.description.trim()"
        @click="submit"
      >
        <Save :size="14" aria-hidden="true" />保存并发布
      </button>
    </div>
    <p class="fp-hint">
      学生端「系统构建路径」会显示期末任务节点；仅当 Lab8 完成且本范围已发布任务时解锁。
    </p>
  </div>
</template>

<style scoped>
.fp-editor {
  display: grid;
  gap: var(--ws-space-3);
}

.fp-presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ws-space-2);
}

.fp-presets > span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.fp-field {
  display: grid;
  gap: 4px;
}

.fp-field > span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.fp-field input,
.fp-field select,
.fp-field textarea {
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background-color: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.fp-field textarea {
  min-height: 0;
  margin-bottom: 0;
  background: var(--ws-surface-alt);
  resize: vertical;
}

.fp-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ws-space-2);
}

.fp-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
  white-space: nowrap;
}

.fp-button.ghost {
  color: var(--ws-accent);
  background: transparent;
}

.fp-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.fp-hint {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

@media (max-width: 560px) {
  .fp-actions {
    width: 100%;
  }

  .fp-actions .fp-button {
    flex: 1 1 auto;
  }
}
</style>
