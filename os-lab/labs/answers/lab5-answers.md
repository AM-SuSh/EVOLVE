# Lab5 参考答案与代码解读

> 本文件是 [lab5-fs-and-sync.md](../lab5-fs-and-sync.md) 的配套答案，含完整代码逐行解读和阅读理解题答案。
> **使用建议**：先独立完成 lab5 的【任务二：阅读理解】，再来对答案。

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

## 二、阅读理解题参考答案

### 任务二第 1 题：fd 表设计 + offset 必要性

每进程一张数组 `FdTable`，fd 是下标。槽位存 `FdType` 枚举区分普通文件/管道读写端。Regular 记 offset 是因为顺序 read 要从上次位置继续——不记 offset 每次从头读，没法读完整个文件。

### 任务二第 2 题：read 按 fd 类型分发

fd 是统一抽象，fd=3 可能是普通文件也可能是管道读端，"读"的实现完全不同（文件从字节切片按 offset 拷贝；管道从环形缓冲按 read_pos 拿）。必须查 FdType 后 `match` 分发到对应逻辑。这是"一切皆文件"统一接口的代价。

### 任务二第 3 题：为什么 CAS + Acquire/Release

普通赋值非原子（读-改-写可能被打断），两进程可能同时进临界区。`compare_exchange_weak` 是硬件原子 CAS，保证"测试并设置"不被打断。Acquire（加锁）防临界区读重排到加锁前；Release（解锁）防临界区写重排到解锁后——这两个内存屏障保证临界区操作不被 CPU 乱序优化破坏。

### 任务二第 4 题：管道满 break 的后果

满了 break 防止覆盖未读数据，但写不完大数据——读端不消费时写端只能停。真实系统会阻塞等待（sleep 到读端腾空间），本实验简化为"满就返回"，调用方需自己分批写。

### 任务二第 5 题：fork 继承 fd + 管道引用计数

fd 继承是 shell 管道的基础（`ls|grep` 靠 fork 后子进程各拿管道一端）。管道要引用计数是因为读写端可能被多个进程持有（fork 复制），只有所有引用关闭才能释放缓冲区。普通文件不用计数，因为它是只读静态数据，没有"释放"概念。

## 三、任务三动手修改的现象参考

- **修改 1（新增内嵌文件）**：在 `os-fs` 的 `DEFAULT_FILES` 加一项，用户程序 openat+read 能读到，走通"加文件→open→read"闭环。
- **修改 2（去掉管道锁）**：数据竞争有随机性，可能偶尔正常偶尔数据错乱/count 计数错误。验证锁的必要性——无锁时并发操作共享缓冲区会出错。
- **修改 3（写满等待）**：结合 lab2 yield，写满时让出 CPU 等读端消费。体会"阻塞式 I/O"的实现——比自旋/直接返回更高效，但要处理"何时唤醒"的同步问题。
