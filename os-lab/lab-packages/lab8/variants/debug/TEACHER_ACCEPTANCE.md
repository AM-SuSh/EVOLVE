# Lab8 debug 变式验收

- [x] 目标绑定 unlock 唤醒路径的 `re_enque`
- [x] 变式植入 `kernel/src/sync_syscall.rs`，可编译；漏掉 `re_enque` 时 mutex/condvar 卡住或缺少 pass
- [x] 基线八条断言覆盖线程、同步、死锁和管道回归
- [x] 提示要求先沿 unlock 核对 handoff 与入队，不泄露完整补丁

| 角色 | 日期 | 结论 |
| --- | --- | --- |
| 教学（A） | 2026-08-10 | 通过（改到内核 sync_syscall） |
