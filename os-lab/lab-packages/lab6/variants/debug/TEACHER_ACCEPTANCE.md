# Lab6 debug 变式验收

- [x] 目标绑定硬链接 nlink（与 fill 同知识点、不同题型）
- [x] 变式可编译；未修复时看不到 `Test link OK!`（`file_test` 仍可能通过）
- [x] 基线在修复后仍可通过文件与硬链接断言
- [x] 提示要求先分层定位，不泄露完整修复代码
- [x] 学生任务文件为 `kernel/src/fs/disk.rs`（与 Lab2–Lab5 一样改内核）

| 角色 | 日期 | 结论 |
| --- | --- | --- |
| 教学（A） | 2026-08-09 | 通过：改为 DiskFs::link 漏 nlink 排错，与 fill 对齐 |
| 工程（C） | 2026-08-09 | 通过：catalog / published / scaffold 指向 `disk.rs` |
