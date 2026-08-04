# Lab2 补救变式 · 教师验收勾选（成员 A · Day 6）

> 对照 `templates/TEACHER_REVIEW_CHECKLIST.md`  
> 变式：`lab2-remedial-yield`（`variants/remedial/`）  
> 验收人：成员 A（教学）· 日期：2026-07-31

## 教学正确性

- [x] 学习目标与基线 Lab2 知识点一致（强化 `os.sched.task-state` / round-robin）
- [x] 误区覆盖 ≥2：yield→Exited；只看退出码 0；与双栈问题混淆（提示阶梯 L2）
- [x] 提示阶梯不泄露完整答案；L3 转教师短辅导
- [x] 反思提示存在（对照表 + Yield 行数前后对比）

## 证据与评分

- [x] 成功标准绑定 `lab2.verify-trace.v1` + 命名断言
- [x] 负向测试写明：`still-exited-on-yield` → `yield-five-rounds` 必须失败
- [x] 量规可引用：R3/R4、P5/P6、T2；复核 H5
- [x] 强制复核：高提示依赖 / 变体自动分 → 见 `teacher-review-gates.md` H4/H5

## 工程可发放

- [x] manifest 字段齐全（见 `PACKAGE.md`）
- [x] 源文件路径存在（复用 debug scaffold）；不覆盖原则：按 scaffold 增量发放
- [x] 断言文本与 `lab.yaml` 一致
- [x] `manual_anchor` 指向手册变体节（发布前 B/C 点开确认一次）

## 难度与公平

- [x] 预估时间短于完整 debug（先填表再改一处状态）
- [x] 不依赖未交付可视化（只用输出断言 + 可选 Trace）
- [x] 建议按「debug 未过关或迁移题 T2 弱」的学生定向发放，不作全班默认

## 难度与答案一致性结论

| 项 | 结论 |
| --- | --- |
| 相对 debug | 同起点 bug，增加对照表脚手架 → **略易**，适合补救 |
| 相对 fill | 不要求写查找逻辑 → **不同技能点**，勿互相替代 |
| 参考答案一致性 | 正确修复仍为 suspended 路径 `Ready`；与 `labs/answers` 教学意图一致 |
| 假通过风险 | 已用 Yield×5 挡住「exit 0 假通过」 |

## 签字

| 角色 | 姓名 | 日期 | 结论 |
| --- | --- | --- | --- |
| 教学（A） | 成员 A | 2026-07-31 | **通过（内容包）**；B/C 发布领取验收已于 2026-08-04 补齐 |
| 工程（C） | B/C 联合验收 | 2026-08-04 | **通过**；`lab2@1.0.0/remedial` 隔离测试、审批、发布、access/scaffold 实领和源码一致性均通过 |
| 体验抽检（B） | B/C 联合验收 | 2026-08-04 | **通过**；教学安排预选 remedial 的页面路由已有抽检，本次按同一前端契约完成教师下发与学生实领 |

## B/C 联合验收证据（2026-08-04）

- 隔离环境：独立数据库、教师配置和学生目录；测试账号 `acceptstudent`，不写入正式学生数据。
- B 侧入口：`/learn/lab2?view=teaching&variant=remedial` 已在 Day6 无头浏览器抽检中确认会进入教学安排并预选 `remedial`；本次教师端按 `TeacherPublishPanel` 使用的同一 `/teacher/config` 契约写入 `openLab=lab2` 和 `assignments.lab2=remedial`。
- C 侧发布：`lab-packages/releases/lab2/1.0.0/release.json` 记录 `variant=remedial`、`test.status=passed`、`isolated=true`、`negativeMatched=true` 和教师审批。
- 学生实领：领取前为 `current=lab1`、`next=lab2`、`nextAllowed=true`；调用正常 `/scaffold/upgrade` 后为 `current=lab2`，状态文件记录 `variants.lab2=remedial`。
- 源码一致性：学生目录 `kernel/src/task.rs` 与发布目录指定的 remedial 源模板 SHA-256 均为 `e3fbf3c9ae8a901b1aa92fb9976f0ee72f1394499238197a6a1e3a973437b9b7`。
- 回归固化：`handbook/lab-factory.test.mjs` 增加“published Lab2 remedial 通过正常 scaffold 路径实领”的自动测试，核对 Lab、变式状态和源码内容。

说明：本次 in-app Browser 控制模块受宿主环境限制未能初始化，因此没有把本次 API 实领描述成新的鼠标点击记录；B 侧页面结论复用 2026-08-03 已完成的无头浏览器路由抽检，C 侧实领证据来自本次真实服务与文件状态。

**驳回条件（若 C 发现）**：scaffold 路径断裂、recipe 名漂移、提示 L3 贴出完整函数体。
