# Lab5 debug 变式验收

- [x] 目标绑定 fork 后管道引用计数（与 fill 同知识点、不同题型）
- [x] 变式可编译；未修复时看不到 `pipe says hi` / `pipe_test pass`（`fs_test` 仍可能通过）
- [x] 基线在修复后仍可通过文件与管道断言
- [x] 提示要求先分层定位，不泄露完整修复代码
- [x] 学生任务文件为 `kernel/src/fs/embedded.rs`（与 Lab2/Lab3 一样改内核）

| 角色 | 日期 | 结论 |
| --- | --- | --- |
| 教学（A） | 2026-08-08 | 通过：改为 clone_fd_table 漏 refs 排错，与 fill 对齐 |
| 工程（C） | 2026-08-08 | 通过：catalog / published / scaffold 指向 `embedded.rs` |
