# Lab5 debug 变式验收

- [x] 目标绑定 pipe + fork 两端关闭协议（与 fill 同知识点、不同题型）
- [x] 变式可编译；未修复时看不到 `pipe says hi` / `pipe_test pass`
- [x] 基线在修复后仍可通过文件与管道断言（含 `fs_test pass`）
- [x] 提示要求先分层定位，不泄露完整修复代码

| 角色 | 日期 | 结论 |
| --- | --- | --- |
| 教学（A） | 2026-08-07 | 通过：改为管道关错端排错，与 fill 对齐 |
| 体验（B） | 2026-08-04 | 通过：教学安排指定 debug，顺序实领状态与源码一致 |
| 工程（C） | 2026-08-07 | 通过：catalog / published / scaffold 均指向 `pipe_test.rs` |
