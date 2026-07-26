# Lab5 参考答案与代码解读

> 配套实验指导：[lab5-fs-and-sync.md](../lab5-fs-and-sync.md)  
> 对应内容：【任务二：阅读理解与思考题（必做）】参考答案 + 代码解读  
> **使用建议**：先独立完成实验文档【任务二】，再来对答案。

## 一、完整代码逐行解读

### 1.1 组件 crate：os-fs（`os-fs/src/lib.rs`）

os-fs 提供"文件"的抽象数据结构，但不直接处理磁盘 I/O（教学简化为内嵌数据）。核心是 `EmbeddedFs` + 静态只读表 **`DEFAULT_FILES`**，提供 `open`/`read_at`/`size` 接口。内核 `kernel/src/fs.rs` 用 `static FS: EmbeddedFs = EmbeddedFs::default_fs()` 共用同一张表，**不再**维护内核内的 `EMBEDDED_FILES`。

### 1.2 文件描述符表（`kernel/src/fs.rs`）

**fd 类型枚举**

```rust
enum FdType {
    Regular { file_id: FileId, offset: usize },  // FileId 来自 os_fs
    PipeRead(usize),                               // 管道读端：记管道 id
    PipeWrite(usize),                              // 管道写端：记管道 id
}
```

**每进程的 fd 表**

```rust
struct FdTable { slots: [Option<FdType>; MAX_FD] }
static mut FD_TABLES: [FdTable; MAX_PROCESS_NUM] = [...];   // 每个进程一张

fn alloc(&mut self, ty: FdType) -> Option<usize> {
    for i in 0..MAX_FD {                          // 找第一个空槽位
        if self.slots[i].is_none() {
            self.slots[i] = Some(ty);
            return Some(i);                        // 返回的 i 就是 fd
        }
    }
    None
}
```

fd 就是数组下标。open 时 `alloc` 一个槽位，返回的下标即 fd。

### 1.3 openat / read / close / write

```rust
pub fn sys_openat(path, path_len, _flags) -> isize {
    let name = read_user_str(path, path_len)?;     // 从用户空间读文件名
    let file_id = find_file(name)?;                // FS.open → DEFAULT_FILES
    FD_TABLES[slot].alloc(FdType::Regular { file_id, offset: 0 })  // 分配 fd
}

pub fn sys_read(fd, buf, len) -> isize {
    match get_fd(slot, fd)? {
        FdType::PipeRead(id) => sync::pipe_read(id, buf, len),     // 读管道
        FdType::Regular { file_id, offset } => {
            // FS.read_at(file_id, offset, ...) 拷贝到用户 buf
            // 然后 offset 前移
        }
        FdType::PipeWrite(_) => -1,                // 写端不能读
    }
}
```

`sys_write` 和 `sys_close` 同理：按 fd 类型分发到对应处理。

### 1.4 fork 时继承 fd（`clone_fd_table`）

```rust
pub fn clone_fd_table(parent_slot, child_slot) {
    FD_TABLES[child_slot] = FD_TABLES[parent_slot];   // 子进程复制父的 fd 表
    for ty in FD_TABLES[child_slot].slots.iter().flatten() {
        match ty {
            FdType::PipeRead(id) => sync::pipe_add_refs(*id, true, false),   // 管道引用 +1
            FdType::PipeWrite(id) => sync::pipe_add_refs(*id, false, true),
            FdType::Regular { .. } => {}    // 普通文件不用计数（只读静态数据）
        }
    }
}
```

管道要计数，普通文件不用——因为管道的缓冲区是动态资源，要等所有引用关闭才释放；普通文件是静态字节切片，没有"释放"概念。

### 1.5 自旋锁（`kernel/src/sync.rs`）

```rust
pub struct SpinMutex<T> {
    lock: AtomicBool,                          // 原子门锁
    data: UnsafeCell<T>,                       // 受保护的数据
}

impl<T> SpinMutex<T> {
    pub fn lock(&self) -> SpinMutexGuard<'_, T> {
        while self.lock.compare_exchange_weak(false, true, Acquire, Relaxed).is_err() {}
        // ↑ CAS 原子操作：把 lock 从 false 改成 true，失败就循环重试（自旋）
        SpinMutexGuard { mutex: self }
    }
}

impl Drop for SpinMutexGuard<'_, T> {
    fn drop(&mut self) {
        self.mutex.lock.store(false, Release);   // 离开作用域自动解锁（RAII）
    }
}
```

精髓：
- `compare_exchange_weak` 是硬件原子指令（CAS），保证"测试并设置"不被打断。
- `Acquire`（加锁）/`Release`（解锁）是内存屏障，防止临界区内的操作被 CPU 乱序重排。
- `Drop` 自动解锁：guard 离开作用域时自动 `store(false)`，不会忘解锁。

### 1.6 管道环形缓冲区（`kernel/src/sync.rs`）

```rust
struct PipeInner {
    buffer: [u8; PIPE_BUFFER_SIZE],
    read_pos: usize, write_pos: usize,
    count: usize,                // 当前缓冲区里有几个字节
    write_closed: bool,
    read_refs: usize, write_refs: usize,   // 引用计数
}

pub fn pipe_write(pipe_id, buf, len) -> isize {
    let mut inner = pipe.inner.lock();          // 持锁保护
    for &byte in user_slice {
        if inner.count >= PIPE_BUFFER_SIZE { break; }   // 满了就停
        inner.buffer[inner.write_pos] = byte;
        inner.write_pos = (inner.write_pos + 1) % PIPE_BUFFER_SIZE;  // 环形绕回
        inner.count += 1;
    }
    written as isize
}

pub fn pipe_read(pipe_id, buf, len) -> isize {
    let mut inner = pipe.inner.lock();
    if inner.count == 0 {
        return if inner.write_closed { 0 } else { -1 };   // 空且写端关了→EOF；空但还开着→暂无数据
    }
    // 从 read_pos 拷贝，read_pos 环形前进，count 减少
}
```

环形的关键：`pos = (pos + 1) % SIZE`，到达末尾绕回 0，复用已读走的空位。

### 1.7 sys_pipe：建立管道

```rust
pub fn sys_pipe(fds: *mut i32) -> isize {
    let pipe_id = alloc_pipe_id()?;              // 分配一个管道
    let (read_fd, write_fd) = crate::fs::alloc_pipe_fds(pipe_id)?;  // 分配读写 fd
    pipe_add_refs(pipe_id, true, true);          // 引用计数初始化
    write_user_i32_pair(fds, read_fd, write_fd); // 把两个 fd 写回用户空间
    0
}
```

用户调 `pipe(&mut fds)`，内核返回两个 fd（`fds[0]`=读端、`fds[1]`=写端），进程 fork 后各拿一端通信。

## 二、任务二：阅读理解与思考题参考答案

### 第 1 题：fd 表如何设计？为什么 `Regular` 要记 `offset`？

每进程一张 `FdTable`，fd 是数组下标（0, 1, 2, …）。`openat` 时 `alloc` 找第一个空槽位，返回的下标就是 fd。槽位存 `FdType` 枚举，区分三种打开对象：

```rust
enum FdType {
    Regular { file_id: FileId, offset: usize },
    PipeRead(usize),
    PipeWrite(usize),
}
```

**`Regular` 记 `offset` 的原因**：顺序 `read` 要从上次位置继续。第一次 read 从 offset=0 拷贝，读完后 offset 前移；下次 read 从新 offset 继续，才能读完整个文件。不记 offset 则每次从头读，无法顺序消费文件内容。

管道读写端用 `PipeRead`/`PipeWrite` 区分，不需要 offset——数据从环形缓冲按 `read_pos` 取。

> 一句话：fd = 数组下标 → 查 `FdType` 得真实对象；Regular 的 offset 记住「读到哪了」。

### 第 2 题：`sys_read` 为什么要按 fd 类型分发？

「一切皆文件」的统一接口背后，实现完全不同：

```rust
match get_fd(slot, fd)? {
    FdType::PipeRead(id) => sync::pipe_read(id, buf, len),
    FdType::Regular { file_id, offset } => {
        // FS.read_at(file_id, offset, ...) 拷贝到用户 buf，offset 前移
    }
    FdType::PipeWrite(_) => -1,   // 写端不能读
}
```

- **普通文件**：从 `DEFAULT_FILES` 内嵌字节切片按 `offset` 拷贝。
- **管道读端**：从内核环形缓冲按 `read_pos` 取数，可能空（返回 -1）或 EOF（写端关闭且 count=0）。

同一 `read(fd, buf, len)` 接口，fd=3 可能是文件也可能是管道——必须先查 `FdType` 再 `match` 分发。这是统一抽象的代价。

> 一句话：fd 是统一入口，实现按类型分叉——文件读切片，管道读环形缓冲。

### 第 3 题：自旋锁为何必须用 CAS？`Acquire`/`Release` 做什么？

**为什么不能用普通赋值**：`lock = true` 展开成读–改–写，两进程/两 trap 可能同时读到 `false`、都写 `true`，同时进临界区——数据竞争。

**CAS（compare_exchange_weak）**：硬件原子指令，「若 lock 为 false 则改为 true，否则失败」——测试与设置不被打断。

**为什么用 weak**：允许偶发虚假失败（spurious failure），自旋循环里可接受且往往比 strong 更快。

**Acquire / Release 内存序**：

- `Acquire`（加锁成功时）：防止临界区内的读被 CPU 重排到加锁之前。
- `Release`（解锁时）：防止临界区内的写被重排到解锁之后。

两者保证临界区操作不会被乱序优化「泄漏」到锁外。管道的 `pipe_read`/`pipe_write` 全程持锁，就是为此。

> 一句话：CAS 保证互斥；Acquire/Release 保证临界区内存可见性。

### 第 4 题：管道写满为何 `break`？与阻塞等待差在哪？

管道缓冲有上限 `PIPE_BUFFER_SIZE`。写满后再写会**覆盖未读数据**，所以：

```rust
if inner.count >= PIPE_BUFFER_SIZE { break; }
```

写满就停，返回已写字节数——调用方需分批写。

**与真实系统的差异**：

| 本实验 | 真实系统 |
|--------|----------|
| 写满 → break 返回 | 写满 → 阻塞（sleep），等读端消费 |
| 读空且写端未关 → 返回 -1 | 读空 → 阻塞，等写端写入 |
| 调用方自己 yield/重试 | 内核负责唤醒 |

本实验简化为「满了/空了就直接返回」，由用户程序处理（所以 pipe_test 可能看到 `pipe write failed`）。真实阻塞式 I/O 更高效，但要处理「何时唤醒读/写端」的同步问题——任务三修改 3 可体验这一雏形。

> 一句话：break 防覆盖；真实系统用阻塞等待读端腾空间。

### 第 5 题：fork 后为何要继承 fd？管道为何要引用计数？

**继承 fd 表**（`clone_fd_table`）：

```rust
FD_TABLES[child_slot] = FD_TABLES[parent_slot];   // 整表复制
```

shell 管道 `ls | grep` 的基础：父进程 `pipe()` 得读写 fd，fork 后子进程继承同一张 fd 表，各拿管道一端通信。不继承则 fork 出的子进程看不到父进程打开的文件/管道。

**管道引用计数**：

fork 复制 fd 表时，管道读写端的引用 +1（`pipe_add_refs`）。多个进程可能同时持有同一管道的读端或写端——只有**所有引用都 close** 后才释放环形缓冲。普通内嵌只读文件是静态字节切片，没有「释放缓冲区」的生命周期问题，故不必计数。

> 一句话：继承 fd = shell 管道的前提；管道引用计数 = 多进程共享时的安全回收。

## 三、任务三动手修改的现象参考

- **修改 1（新增内嵌文件）**：在 `os-fs` 的 `DEFAULT_FILES` 加一项，用户程序 openat+read 能读到，走通"加文件→open→read"闭环。
- **修改 2（去掉管道锁）**：数据竞争有随机性，可能偶尔正常偶尔数据错乱/count 计数错误。验证锁的必要性——无锁时并发操作共享缓冲区会出错。
- **修改 3（写满等待）**：结合 lab2 yield，写满时让出 CPU 等读端消费。体会"阻塞式 I/O"的实现——比自旋/直接返回更高效，但要处理"何时唤醒"的同步问题。
