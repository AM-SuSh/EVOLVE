# Lab3 参考答案与代码解读

> 配套实验指导：[lab3-memory.md](../lab3-memory.md)  
> 对应内容：【任务二：阅读理解与思考题（必做）】参考答案 + 代码解读  
> **使用建议**：先独立完成实验文档【任务二】，再来对答案。

## 一、完整代码逐行解读

### 1.1 页帧分配器（`os-alloc/src/lib.rs`）

**核心抽象：物理页号**

```rust
pub const PAGE_SIZE: usize = 4096;
pub const PAGE_SIZE_BITS: usize = 12;   // 2^12 = 4096

pub struct PhysPageNum(pub usize);   // 物理页号（不是地址！）

impl PhysPageNum {
    pub fn addr(&self) -> usize { self.0 << PAGE_SIZE_BITS }        // 页号 → 地址：左移12
    pub fn from_addr(addr: usize) -> Self { Self(addr >> PAGE_SIZE_BITS) } // 地址 → 页号：右移12
}
```

区分"页号"和"地址"是关键：页号 N 对应地址 N*4096。

**分配器 trait 与栈式实现**

```rust
pub trait FrameAllocator {
    fn alloc_frame(&mut self) -> Option<PhysPageNum>;
    fn dealloc_frame(&mut self, ppn: PhysPageNum);
}

pub struct StackFrameAllocator { current: usize, end: usize }
```

栈式：维护 `[current, end)`，`alloc` 时取 `current` 并 +1，`dealloc` 时只在回收的是 `current-1` 时才退一格（只能回收最后分配的那块——这是简化实现的局限）。

**全局单例**：用 `static mut FRAME_ALLOCATOR` + `frame_alloc()`/`frame_dealloc()` 包装，内核各处通过这俩函数分配物理帧。

### 1.2 Sv39 页表（`os-vm/src/lib.rs`）

**地址类型**

```rust
pub struct VirtAddr(pub usize);
impl VirtAddr {
    pub fn page_offset(&self) -> usize { self.0 & (PAGE_SIZE - 1) }  // 低12位
    pub fn floor(&self) -> VirtPageNum { VirtPageNum(self.0 >> 12) } // 向下取整页
    pub fn ceil(&self) -> VirtPageNum { VirtPageNum((self.0 + 4095) >> 12) } // 向上取整页
}

pub struct VirtPageNum(pub usize);
impl VirtPageNum {
    pub fn indexes(&self) -> [usize; 3] {   // 拆成 3 个 9 位索引
        let vpn = self.0;
        [(vpn >> 18) & 0x1ff, (vpn >> 9) & 0x1ff, vpn & 0x1ff]
    }
}
```

`floor`（向下取整）得到包含该地址的页号；`ceil`（向上取整）用于"覆盖到某地址为止"时算出要映射几个页。`0x1ff = 0b1_1111_1111` 是 9 位掩码。

**PTE 布局与权限位**

```rust
struct PageTableEntry(pub usize);   // 64 位
impl PageTableEntry {
    fn new_ppn(ppn: PhysPageNum, perm: MapPermission) -> Self {
        let mut flags = PTE_V;  // V 位(0位) = 1
        if perm.contains(R) { flags |= 1 << 1; }  // R 位(1位)
        if perm.contains(W) { flags |= 1 << 2; }  // W 位(2位)
        if perm.contains(X) { flags |= 1 << 3; }  // X 位(3位)
        if perm.contains(U) { flags |= 1 << 4; }  // U 位(4位)
        Self(ppn.0 << 10 | flags)   // 帧号左移10位腾出权限位
    }
    fn ppn(&self) -> PhysPageNum { PhysPageNum((self.0 >> 10) & ((1<<44)-1)) }
    fn is_valid(&self) -> bool { self.0 & PTE_V != 0 }
}
```

为什么左移 10？低 10 位是权限（V/R/W/X/U 等位在 0-9 位），高 44 位放物理帧号。

**三级查找 `find_pte`**

```rust
fn find_pte(&self, vpn: VirtPageNum, alloc: bool) -> Option<*mut PageTableEntry> {
    let indexes = vpn.indexes();   // [VPN2, VPN1, VPN0]
    let mut ppn = self.root_ppn;   // 从根表开始
    for (i, idx) in indexes.iter().enumerate() {
        let table = ppn.addr() as *mut PageTableEntry;
        let pte = unsafe { table.add(*idx) };
        if i == 2 { return Some(pte); }   // 第三级，返回叶子表项指针
        if unsafe { !(*pte).is_valid() } {
            if !alloc { return None; }    // 查找/取消映射时不创建
            let next = frame_alloc().expect("...");  // map 时按需创建下一级表
            unsafe { *pte = PageTableEntry::new_pointer(next); }
        }
        ppn = unsafe { (*pte).ppn() };   // 进入下一级
    }
    None
}
```

精髓：`alloc=true` 时按需分配中间表（多级页表省内存的关键）；`alloc=false` 时不创建，没映射就返回 None。

**satp 激活**

```rust
pub fn activate(token: usize) {
    unsafe {
        asm!("csrw satp, {}", in(reg) token);   // 写根页表
        asm!("sfence.vma");                     // 刷新 TLB
    }
}
// token = (8 << 60) | root_ppn，8 表示 Sv39 模式
```

### 1.3 映射区与地址空间（`os-vm/src/lib.rs`）

**MapArea：一段连续虚拟页的映射**

```rust
pub struct MapArea {
    vpn_start: VirtPageNum, vpn_end: VirtPageNum,
    perm: MapPermission,
    data: &'static [u8],  // 可选：映射时把这段数据拷进去
    data_offset: usize,
}
impl MapArea {
    pub fn map(&self, pt: &mut PageTable) {
        for vpn in vpn_start..vpn_end {
            let ppn = frame_alloc().expect("...");   // 每页分配一个新帧
            write_bytes(ppn.addr(), 0, PAGE_SIZE);   // 清零
            // 如果有 data，拷贝对应部分
            pt.map(vpn, ppn, self.perm);
        }
    }
}
```

**MemorySet：一个完整的地址空间**

```rust
pub struct MemorySet {
    page_table: PageTable,
    areas: [Option<MapArea>; 16],
}
impl MemorySet {
    pub fn map_area(&mut self, area: MapArea) { area.map(&mut self.page_table); self.push_area(area); }
    pub fn map_identical_region(&mut self, start: usize, end: usize, perm: MapPermission) {
        // 恒等映射：VPN = PPN，不分配新帧，直接指向同号物理页
        for vpn in vpn_start..vpn_end {
            self.page_table.map(vpn, PhysPageNum(vpn.0), perm);
        }
    }
    pub fn activate(&self) { activate(self.token()); }
}
```

### 1.4 内核内存管理（`kernel/src/mm.rs`）

```rust
pub fn init() {
    init_frame_allocator(FRAME_POOL_START, MEMORY_END);  // 初始化分配器
    let mut kernel_space = MemorySet::new_bare();
    let kperm = R.union(W).union(X);
    // 内核侧整段恒等映射，保证开分页后内核还能跑
    kernel_space.map_identical_region(stext, FRAME_POOL_START, kperm);
    KERNEL_SPACE = Some(kernel_space);
}
```

用户程序不走已删除的 `map_user_app`，而是由 `create_user_space`：先 `map_kernel_trap_regions_user`（恒等映射内核 trap 相关区，并**排除**用户槽 `0x80400000..0x80420000`），再 `map_elf_and_stack`（`elf_map_areas` 解析 ELF PT_LOAD + 映射用户栈，带 `U` 位）。

### 1.5 lab3 对 trap 的改动（`kernel/src/trap.rs`）

lab3 的 trap 入口多了 `activate_kernel` 和 `sscratch` 设置——确保分页开启后，trap 进内核时内核代码能被正确访问，返回用户态时再切回用户视角。这是分页时代 trap 必须多走的步骤。

## 二、任务二：阅读理解与思考题参考答案

### 第 1 题：Sv39 虚拟地址怎么拆？`0x1ff` 代表什么？

39 位虚拟地址 = `[VPN2(9) | VPN1(9) | VPN0(9) | Offset(12)]`：27 位页号 + 12 位页内偏移。三级页表每级用 9 位索引，共 512 项（2^9）。

`VirtPageNum::indexes()` 的实现：

```rust
[(vpn >> 18) & 0x1ff, (vpn >> 9) & 0x1ff, vpn & 0x1ff]
```

- `(vpn >> 18) & 0x1ff` 取 VPN2（最高 9 位）
- `(vpn >> 9) & 0x1ff` 取 VPN1
- `vpn & 0x1ff` 取 VPN0

`0x1ff = 511 = 0b111111111` 是 9 位掩码，保证只取 9 位索引。页内偏移不在 `indexes()` 里处理，而是用 `VirtAddr::page_offset()` 取低 12 位（`& 0xfff`）。

> 一句话：39 位 = 3 个 9 位 VPN + 12 位 offset；`0x1ff` 是每级索引的 9 位掩码。

### 第 2 题：PTE 里为什么物理帧号左移 10 位？

PTE 是 64 位，布局为 `[物理帧号(44) | 权限位(10)]`。低 10 位留给 V/R/W/X/U 等标志（V 在 0 位，R/W/X/U 在 1–4 位，其余保留），高 44 位放物理帧号。

`PageTableEntry::new_ppn` 里：

```rust
Self(ppn.0 << 10 | flags)
```

帧号必须 `<< 10` 才能腾出低 10 位给权限。提取时 `>> 10 & ((1<<44)-1)`。

**注意区分两个「左移」**：

- PTE 里帧号左移 **10**（低 10 位是权限标志）
- 拼物理地址时帧号左移 **12**（页大小 4096 = 2^12）

很多人第一次会把这两个混淆——PTE 存的是「帧号 + 权限」，而物理地址 = 帧号 × 页大小 + 偏移。

### 第 3 题：开分页后内核为什么还能跑？

写 `satp` 激活页表后，**每一次访存**都要经过页表翻译。若内核代码在物理 `0x80200000`，但虚拟 `0x80200000` 没有映射，CPU 一取指就触发页错误，内核立刻崩溃。

**恒等映射**让虚拟页号 = 物理帧号：VA `0x80200000` → PA `0x80200000`。开分页前后内核「看到」的地址不变，照常执行。

`mm::init` 里的做法：

```rust
kernel_space.map_identical_region(stext, FRAME_POOL_START, kperm);
```

把内核镜像、启动栈等从 `stext` 到 `FRAME_POOL_START` 整段恒等映射（RWX），保证开分页瞬间内核所需地址全部有效。用户程序的地址空间另建，经 ELF 段与用户栈映射，带 `U` 位与内核隔离。

> 没有恒等映射，开分页 = 内核自杀；有了它，内核无感过渡。

### 第 4 题：中间表项为空时怎么办？`alloc` 做什么？

`find_pte(vpn, alloc)` 从根表出发，用 VPN2/VPN1/VPN0 三级索引。到达第三级时直接返回叶子 PTE 指针。

中间级（第一、二级）表项为空（V 位 = 0）时：

- **`alloc = true`**（`map` 时）：自动 `frame_alloc()` 分配一页做下一级页表，清零后填入当前 PTE，继续往下走。保证能建出完整映射路径。
- **`alloc = false`**（`translate` / `unmap` 时）：直接返回 `None`，表示该虚拟页尚未映射。

这就是 Sv39 **按需分配** 的精髓——没用到的虚拟地址不占页表内存。一张 512³ 的扁平大表根本放不下；多级 + 按需才可行。

### 第 5 题：lab3 的 trap 入口比 lab2 多了什么？

lab2 无分页，物理地址直访，trap 进内核时不管 `satp`，内核代码始终可访问。

lab3 开分页后，用户程序运行在自己的页表里（含用户区映射）。trap 进内核时必须确保**内核代码和数据可访问**——否则 trap handler 自身就会页错误。

lab3 在 trap 入口增加了：

- **`activate_kernel`**：切回内核地址空间（写内核 `satp`），保证 trap handler 在内核映射下安全运行
- **`sscratch` 相关设置**：配合 lab2 已有的用户/内核栈切换，分页时代还需在返回用户态时恢复用户页表

完整链路：用户态运行（用户 satp）→ trap → 切内核 satp → 内核处理 → 恢复用户 satp → `sret` 回用户态。这是分页时代 trap 必经的额外步骤，lab2 不需要。

## 三、任务三动手修改的现象参考

- **修改 1（去掉 U 位）**：在 `elf_map_areas` / 用户栈映射处去掉 `U` 后，用户程序访问自己的代码/数据时触发页错误——因为不带 U 位，用户态访问被硬件拒绝。用户程序根本跑不起来，内核报错或陷入异常处理。这验证了 U 位是用户/内核隔离的核心。
- **修改 2（改 PAGE_SIZE=8192）**：不能简单改。Sv39 的偏移位是硬件固定的 12 位（RISC-V 规范），改 8192 要用 Sv48/Sv57 等别的模式；而且 `0x1ff` 等魔数、`>> 12` 等位运算全都基于 4KB 假设，会连锁出错。这是硬件约定，软件层不能随意改。
- **修改 3（追踪翻译）**：在 translate 加 println 能看到完整的"虚拟页号 → 3 级索引 → 物理帧号"链路，验证你对 Sv39 的理解。注意 println 本身可能改变时序，但 lab3 简单场景下能看到清晰输出。
