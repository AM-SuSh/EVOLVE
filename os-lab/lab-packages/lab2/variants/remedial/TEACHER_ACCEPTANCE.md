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
| 教学（A） | 成员 A | 2026-07-31 | **通过（内容包）**；发布仍须 C lint/dry-run + B 向导 |
| 工程（C） | | | 待 lint / dry-run |
| 体验抽检（B） | | | 待向导领取抽检 |

**驳回条件（若 C 发现）**：scaffold 路径断裂、recipe 名漂移、提示 L3 贴出完整函数体。
