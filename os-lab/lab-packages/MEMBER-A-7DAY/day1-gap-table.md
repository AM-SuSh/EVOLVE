# 成员 A · 7 日缺口表（Day 1）

> 日期：2026-07-31  
> 范围：规格**已写在仓库**、但**尚未进入产品 UI/API** 的项  
> 用途：供 B/C 按责任认领；共同演示脚本见文末

## 1. 缺口一览

| ID | 规格已有落点 | 产品缺口 | 挂到 | 主责 | 7 日计划 |
| --- | --- | --- | --- | --- | --- |
| G1 | `lab2/checkpoints.md` | 导师无阶段检查点/证据门控；不可机读 | 导师 harness | C 实现 / A 已交 YAML（Day2） | Day 2–3 |
| G2 | `variants/*/manifest.yaml` 的 `hint_ladder` | 导师界面不显示「已用/下一提示层级」 | 导师 UI | B | Day 2–3 |
| G3 | —（本轮补）金标准对话 | 无「应拒/应放行」回归集 | 导师回归 | C 挂测 / A 已交 JSON（Day3） | Day 3 |
| G4 | `learning/rubric-v2-draft.md` | 线上仍为启发式 `rubric.mjs`；细项无 `evidenceRefs` | 评分 v2 | C + B | Day 4 |
| G5 | `learning/teacher-review-gates.md` | 教师端只有报告验收，无**评分复核队列** | 复核 | B + C | Day 5 |
| G6 | `learning/ai-interaction-scoring.md` | 未实现 `aiInteraction` 子分 | 评分扩展 | C（可选本周） | 可延后 |
| G7 | `visualization/opre-tasks.md` | Trace/手册旁无 OPRE「插入报告」入口 | 教学增强 | B / A 文案定稿（Day5） | Day 5 |
| G10 | `templates/TEACHER_REVIEW_CHECKLIST.md` | 变式发布前无强制勾选入库 | Lab 工厂 | A 填好随包（Day6） | Day 6 |
| G11 | `learning/trial-protocol-m5.md` | 无「5 人可用性」可当场执行的最短脚本 | 收口 | A（Day7） | Day 7 |

## 2. 已在产品中的规格（勿重复开票）

| 能力 | 证据 |
| --- | --- |
| Lab2 手册层次与变体说明 | `labs/lab2-trap-and-task.md` |
| 可信 recipe / 断言 / Trace 证据 | smoke + 测试结果；Trace Viewer 已从学生端移除 |
| 文件状态 A/M/T/G/!、Problems | `/fs/status`、诊断 API |
| 教师开放 Lab、报告反馈 | `TeacherPublish` / `TeacherReview` |
| Lab2/3 包与量规草案文件 | `lab-packages/`、`learning/rubric-v2-draft.md` |

## 3. 共同 5 步演示脚本（Lab2 debug）

1. 测试学生登录 → 领取 Lab2 **debug** 变体 → 打开 `kernel/src/task.rs`。  
2. 故意保留错误或引入编译错误 → Problems 跳行 → 修复。  
3. 跑 `lab2.verify-trace.v1`（或工作台等价可信命令）→ 断言通过。  
4. 在测试结果中查看由真实 Trace 统计形成的断言，并将证据写入报告。  
5. 向 AI 基于现象提问（非要完整代码）→ 提交含「我/AI/验证」的反思 → 教师打开报告。

**本周收口后应多 2 步（依赖 B/C）**：导师证据条显示缺什么；教师按细项点回 `runId`。

## 4. Top3 教学侧摩擦（供 B 修 UX）

1. 学生易只追退出码，界面未强调 `Yield round×5`。  
2. 提示阶梯写在 manifest，对话里不可见，易直接要答案。  
3. OPRE/知识路径只在 md，工作台无入口，证据进不了报告习惯。
