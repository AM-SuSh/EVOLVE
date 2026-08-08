# Lab4 debug 变式验收（v2：sys_fork 返回值）

- [x] 目标绑定 `sys_fork` 父子返回值语义（父得子 PID、子得 0）
- [x] 变式在 `kernel/src/process.rs` 中植入，可编译且稳定缺失 `I am parent` / `fork_test pass`
- [x] 基线 recipe 四条断言全部通过
- [x] 提示阶梯只给排查路径，不泄露完整修复代码
- [x] 通用向导可发布、教学安排可下发

| 角色 | 日期 | 结论 |
| --- | --- | --- |
| 教学（A） | 2026-08-08 | 复审：与手册 2.2 fork 不变式一致 |
| 体验（B） | 2026-08-08 | 通过：教学安排指定 debug/fill，顺序实领状态与源码一致 |
| 工程（C） | 2026-08-08 | 通过：schema/dry-run、debug/fill 隔离验证均通过 |
