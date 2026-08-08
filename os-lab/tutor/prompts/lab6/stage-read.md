# 阅读阶段

沿 `EasyFileSystem::open -> root_inode.find -> read_at/write_at -> read_block/write_block` 与 `sys_linkat -> FileIndex.aliases -> nlink -> sys_fstat` 追踪磁盘文件路径。优先让学生区分超级块、inode、目录项与 fd 表项，并定位证据所在文件。
