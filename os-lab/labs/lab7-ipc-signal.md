# 实验 7：IPC 与信号

> 对应 feature：`lab7`（依赖 `lab6`）。

> **配套教材**（《操作系统导论》OSTEP 中译）：[第 5 章 · 进程 API（PDF 第 40 页）](/downloads/ostep-zh.pdf#page=40) · [第 39 章 · 文件和目录 / 管道直觉（PDF 第 352 页）](/downloads/ostep-zh.pdf#page=352) · [第 33 章 · 基于事件的并发（PDF 第 302 页）](/downloads/ostep-zh.pdf#page=302) · [全书入口](/downloads/ostep-zh.pdf)  
> 说明：OSTEP 无独立「信号」专章；信号机制可对照 Unix 文档，并用第 33 章理解「异步事件何时介入执行流」。

完成Lab6之后，你的内核已经能创建进程、读写磁盘上的文件，也能用管道在父子进程之间传一句 `hi`。看起来「进程协作」好像有了答案。但是在实际应用时，程序之间打交道并不只有「递一段字节」这一种方式。

有时你确实需要像水管一样，把一串数据**同步地**从一端送到另一端：写的人往里倒，读的人从另一头接；没人读时，写方常常得等等。管道做的就是这件事。可还有另一类需求更轻、也更「突然」：父进程只想告诉子进程「该处理一件事了」，并不打算附带一大段数据；子进程此刻也不一定正卡在 `read` 上——它可能在循环、在计算，或在 `yield`。这时更合适的是轻轻「拍一下」对方，让它稍后换一条路径执行，处理完再回到原来的地方。教材把前一类多归到 **IPC（进程间通信）**，把后一类叫做**信号（signal）**。

本实验就在已有管道与磁盘 fd 之上，把这两条线同时理清楚。具体会做三件事：第一，把文件和管道的读写收进**同一套** `read` / `write` 入口，让「一切皆文件」在接口上真正闭环；第二，补上 `dup`，弄明白「多一个文件描述符编号」到底共享了什么；第三，接上一套教学版信号（`kill` / `sigaction` / `sigprocmask` / `sigreturn`），看清异步通知在内核里何时投递、如何返回。管道你在 Lab5 已经见过雏形——这里重点不是再写一遍水管，而是想清楚：**同一套接口如何同时服务文件与管道**，以及**信号这种提醒落在哪一个时机**。跑通之后，协作就不止「传字节」，还能「递事件」了。

## 零、开始之前

1. **已完成 Lab6**：能跑通 `make test-lab6`，理解 fd、VirtIO 与磁盘 FS（见 [lab6-disk-fs.md](lab6-disk-fs.md)）。
2. **进入工作目录**：`cd os-lab`；如果使用了新开终端需要先 `. .\scripts\activate-os-env.ps1`。
3. **自检**：`rustc --version` 与 `qemu-system-riscv64 --version` 能输出版本。
4. **建议先翻书**：IPC、信号相关章节。带着「管道和信号差在哪」「信号什么时候真正执行」进来即可。



### 环境准备（与 Lab6 相同）

Lab7 同样依赖 VirtIO 与 `fs.img`。进入 `os-lab` 后建议先预构建：

```powershell
cd os-lab
cargo build -p user --target riscv64gc-unknown-none-elf --release --bins
cargo build -p kernel --features lab7 --release
```

`kernel/build.rs` 在 `lab7` 下将 **`lab7_usertest`** 打包为 `initproc`，串联 dup → 信号 → 管道回归。

> 跑通验证请用【任务一】中的 `make test-lab7`（已封装 VirtIO）。请勿用裸 `cargo run -p kernel --features lab7`，否则访问不到 `fs.img`。

## 一、问题场景

磁盘文件能读写之后，用户态协作仍会碰到更「活」的需求。例如：

> 「我已经有一条管道，能不能像复制文件描述符那样，再复制一个写端？另外，父进程想通知子进程『该处理一件事了』，子进程却不一定正卡在 read 上——怎么办？」

我们具体分析一下这个问题：

- **文件和管道是否该走同一扇门？**  
若 `read` / `write` 对管道另搞一套 syscall，用户态要记两套接口。统一之后，内核查表时如何区分「普通文件 / 读端 / 写端」？写端上做 `read` 该怎样失败？
- **复制一个已打开的 fd 意味着什么？**  
`dup` 之后，新旧两个编号指向的是不是同一个底层对象？若对象是管道写端，关掉其中一个，另一个是否还能写？这里和「引用计数」有什么关系？
- **信号与管道差在哪里？**  
管道传的是字节流，发送方常常要等到有人读（或至少缓冲区未满）。信号更像带编号的事件：如何投递、如何暂时屏蔽、用户处理函数跑完后如何回到「被打断前」的现场？
- **处理函数究竟在什么时机插入？**  
是任意指令中间硬插一刀，还是选一个内核已经「站稳」的边界（例如系统调用即将返回用户态）？若子进程只在 `yield` 循环里等待，漏掉哪一步检查会永远等不到信号？

本实验会同时碰到「同步 IPC」与「异步通知」两条线。跑通后，你应能看到 `dup_test`、信号相关测例以及管道回归都通过。

## 二、背景知识

这几个问号，其实都在问同一类设计题：用户态手里只有整数 fd 或 pid，内核如何在**不破坏已有抽象**的前提下，把「传字节」和「递事件」都接进去。

### 2.1 统一入口：还是那张 fd 表

Lab5/Lab6 里管道已经存在，但若读写路径散落在各处，后面每加一种对象（设备、将来的更多类型）都会复制一套逻辑。更干净的做法是：用户永远调用 `read` / `write` / `close`；内核根据当前进程 fd 表槽位上的 `FdType` 再分叉。


| `FdType`    | `read`         | `write` |
| ----------- | -------------- | ------- |
| `Regular`   | 走磁盘 / 文件 inode | 同行      |
| `PipeRead`  | 走环形缓冲          | 应失败     |
| `PipeWrite` | 应失败            | 走环形缓冲   |


管道槽位往往**没有**普通文件的 `OpenedFile`——不能先去查 `files[fd]` 再决定是不是管道，否则会把「管道写失败」之类的回归重新引进来。`os-fs` 里的 `fd_kind` 可在 host 上单测这张读写矩阵，帮助你先把规则想清楚，再下到 QEMU。

「一切皆文件」在这里又深了一层：不只是口号，而是**分发点唯一、类型信息藏在表后**。

### 2.2 管道：同步递字节（回顾并收紧）

管道仍是单向、内核缓冲的字节流。父进程 `write`，子进程 `read`（或反过来）；空则读端可能暂时失败并 `yield` 重试，满则写端停止继续堆积——教学实现里常见这种简化，与「阻塞直到有空位」的完整语义还有距离。

```mermaid
sequenceDiagram
    participant P as 父进程
    participant K as 内核环形缓冲
    participant C as 子进程
    P->>K: write(写端 fd)
    C->>K: read(读端 fd)
    K-->>C: 数据
```



与 Lab4 的配合方式不变：先 `pipe`，再 `fork`，子进程继承两端 fd，再各自关掉不需要的一端。Lab7 要盯紧的是：这些操作是否都走统一的 `sys_read` / `sys_write`，以及关闭、复制时引用计数是否正确。

### 2.3 dup：多一个门牌，指向同一份对象

`dup(old_fd)` 的直觉很简单：在 fd 表里再占一个空槽，让它与 `old_fd` **指向同一底层对象**。

- 对普通文件：共享打开对象（inode 相同）；本实现里各 fd 仍可能各自维护一份 `offset` 副本——读代码时留意，不要想当然成「完全共享偏移」。
- 对管道：除了复制 `FdType`，还要对读端或写端做 `pipe_add_refs`。只有某一侧的引用真正降到 0，才适合标记「写端已全部关闭」之类的状态。

因此会出现测例关心的现象：父进程 `dup` 出写端后 `close` 原来的写 fd，仍应能通过新 fd 写入；若过早把 `write_closed` 置位，对端就会误以为 EOF 或写失败。`dup_test` 正是在逼这条路径。

### 2.4 信号：异步递事件

管道适合「我有一串字节要给你」；信号适合「我通知你一件编号为 N 的事」。两者对比可以帮助建立直觉：


| 维度      | 管道        | 信号                         |
| ------- | --------- | -------------------------- |
| 连接方式    | 先建好 fd 对  | 知道对方 pid 即可 `kill`         |
| 发送方是否等待 | 常受缓冲区空满影响 | 一般不阻塞在「对方已处理完」             |
| 数据形态    | 字节流       | 离散事件（信号编号）                 |
| 内核结构    | 环形缓冲      | pending / mask / handler 等 |


本环境用 `os-signal` 的 `SignalState` 描述每进程的 pending 位图、屏蔽字与处理函数表；可在 host 上单测。内核侧 `kernel/src/signal.rs` 负责与 trap 上下文打交道。

**投递与返回用户态的边界**往往比「信号长什么样」更关键。一种教学上干净的选择是：在系统调用处理完毕、**即将返回用户态之前**检查是否有可交付信号。若存在用户注册的 handler，就先保存当前 `TrapContext`，把 `sepc` 改到 handler，并把信号编号放进约定寄存器（如 `a0`）；handler 末尾调用 `sigreturn`，再把保存的上下文恢复回去。普通函数 `ret` 无法完成这件事——因为被改掉的不只是「返回地址」，还包括整帧 trap 状态。

```mermaid
sequenceDiagram
    participant U as 用户程序
    participant T as trap_handler
    participant S as SignalState
    U->>T: syscall（如 yield）
    T->>S: handle_pending()
    alt 有可交付信号且存在 handler
        S-->>T: 保存 TrapContext，转入 handler
        T-->>U: 执行 handler
        U->>T: sigreturn
        T-->>U: 恢复原上下文
    else 默认致命
        T-->>U: exit
    end
```



还要注意两条细则：

- `sigprocmask`：屏蔽期间到达的信号通常进入 pending，**不轻易丢**；解除屏蔽后，往往还要再次陷入内核，才能在返回用户态前真正交付。
- `yield` **路径**：若测例靠「循环 yield 等信号」，调度前也必须检查 pending；否则信号已置位，执行流却永远在空转等待。`SIGKILL` 一类「必杀」语义，教学实现里常设计成**绕过 mask**，否则无法保证终止。

默认动作（未注册 handler 时）可先按简表理解：如 `SIGINT` / `SIGKILL` 倾向终止，`SIGUSR1` 在本环境中可能默认忽略——以代码与测例为准。

---

串起来：统一 fd 让文件与管道共用入口；`dup` 让「多一个编号」变得可预期；信号则在返回用户态的边界上插入另一条控制流。下一节用测例把这三条路都点亮。

## 三、实验任务

> 建议先 `make test-lab7`，再读 `signal.rs` 与 `trap.rs` 中的 `yield_and_schedule`，对照用户测例。


| 文件                           | 角色                           | 先想                           |
| ---------------------------- | ---------------------------- | ---------------------------- |
| `os-signal/src/lib.rs`       | `SignalState`、pending/mask   | SIGKILL 为何绕过 mask？           |
| `kernel/src/signal.rs`       | kill / sigaction / sigreturn | 何时保存、何时恢复 trap 上下文？          |
| `kernel/src/trap.rs`         | syscall 分发 + 信号投递            | yield 路径为何也要 handle_pending？ |
| `kernel/src/fs/disk.rs`      | 统一 fd、`sys_dup`              | PipeWrite 上 read 为何失败？       |
| `kernel/src/sync.rs`         | 管道引用计数                       | 最后一个写端关闭意味着什么？               |
| `user/src/bin/dup_test.rs` 等 | 测例                           | —                            |


> 完整解读见 `labs/answers/lab7-answers.md`。



### 任务一：跑通 lab7

```powershell
make test-lab7
```

**预期输出**（OpenSBI 日志可忽略）：

```text
os-lab kernel lab7: IPC and signals.
dup_test pass
signal_test pass
signal_mask_test pass
pipe says hi
pipe_test pass
All processes exited.
```

**通过标准**：出现以上全部 `pass` 行，且 QEMU 正常退出。



### 任务二：阅读理解与思考题

每道题建议**先合上代码想答案，再打开对照**；**参考答案见** `labs/answers/lab7-answers.md`。

1. `FdType` 三分支：`sys_read` 对 `PipeWrite` 为何返回 `-1`？为何不单独实现 `pipe_read` syscall，而走统一 `read`？
2. `SignalState::take_deliverable`：SIGKILL 为何能绕过 mask？pending 与 mask 各表示什么？
3. `sigaction` 保存的 `saved_trap_cx` 在何时写入、何时由 `sigreturn` 恢复？用户 handler 末尾为何不能只用普通 `ret`？
4. `yield_and_schedule` 与 trap 末尾的 `handle_pending` 各在什么路径调用？若 yield 后不检查 pending，会怎样？
5. `dup` 管道写端后 `close` 原 fd，为何仍能通过新 fd 写入？`sigprocmask` 屏蔽期间 `kill` 的信号会丢失吗？

> 能画出「kill → pending → 交付 handler → sigreturn」路径，lab7 就过关了。



### 任务三：动手小修改

**修改 1**：在信号处理函数中打印收到的 `signum`，确认 `a0` 与注册信号一致。

**修改 2**：对 `SIGINT` 注册「忽略」handler（空操作 + `sigreturn`），父进程 `kill` 后子进程应继续运行。

**修改 3**（进阶）：阅读 `reference-patches` 中相关信号片段，列出本环境相对完整 OS 的简化点（无多线程信号、无 `SA_RESTART` 等）。



## 四、验证


| 验证项         | 命令                                                        | 通过标准                   |
| ----------- | --------------------------------------------------------- | ---------------------- |
| 主编译         | `cargo check -p kernel --features lab7`                   | 无 error                |
| QEMU 全链     | `make test-lab7`                                          | 见任务一预期输出               |
| fs.img      | `make check-fs-img`                                       | `fs.img OK`            |
| host 单测（可选） | `cargo test -p os-fs -p os-signal --target <host-triple>` | fd_kind + signal 相关项通过 |


## 五、AI 提问模板

1. **概念澄清型**：「管道是同步还是异步？信号是同步还是异步？能否用管道模拟信号？」
2. **现象解释型**：「`signal_mask_test` 屏蔽期间 `kill` 自己，为何 handler 不立即执行？」
3. **代码追因型**：「`yield` 之后若不调用 `handle_pending`，`signal_test` 为何会超时？」
4. **对比深化型**：「本环境信号与 Linux 的 `sigaction` 栈、`SA_RESTART` 等有何简化？」
5. **动手探索型**：「若要把 stdout 重定向到文件，用户态应如何组合 `dup` 与 `close`？」

