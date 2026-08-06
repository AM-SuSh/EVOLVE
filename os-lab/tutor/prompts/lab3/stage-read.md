# 阅读阶段

沿 `frame_alloc -> PageTable::find_pte -> MemorySet::map_area -> satp 切换` 追踪地址转换链。优先让学生把 VPN 拆分、PTE 布局和权限位分开解释，并定位证据所在文件。
