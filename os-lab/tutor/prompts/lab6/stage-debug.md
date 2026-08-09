# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。

对 fill/debug 工作区：优先用「`file_test` 是否仍过、`Test link OK!` 是否缺失」区分「普通文件 CREATE 路径」与「`DiskFs::link` 的 nlink」；再引导到 `sys_linkat` → `DiskFs::link` / `attach_hard_link_alias`，不要先改用户测例断言。
