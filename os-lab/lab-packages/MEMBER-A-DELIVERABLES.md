# 成员 A 交付总览（对照《三人小组后续实验发展实施计划》）

更新：2026-07-29

## 已完成（可验收文档/规格）

| 计划周次 | 任务 | 落点 |
| --- | --- | --- |
| 第 1 周 | Lab1–8 知识盘点；Lab2 `lab.yaml`+concepts；量规细项；10 条轨迹 | `lab-packages/README.md`、`lab2/**`、`learning/rubric-v2-draft.md`、`traces-lab2-mock.json` |
| 第 2–3 周 | Lab2 正文层次；fill/debug 阶梯；UI 文案审核 | `labs/lab2-*.md`、`variants/*`、`ui-copy-review.md`、`DAY2-3-DELIVERABLE.md` |
| 第 4–5 周 | Trap/调度/页表视图规格；OPRE 小任务 | `visualization/README.md`、`opre-tasks.md` |
| 第 6–7 周 | Lab2/3 检查点与迁移题；20 条标注；教师复核规则；量规 +T1/T2 | `lab2/checkpoints.md`、`lab3/checkpoints.md`、`traces-lab2-mock.json`、`teacher-review-gates.md`、`rubric-v2-draft.md` |
| 第 8–9 周 | 创建模板+审核清单；Lab2 补救变式；Lab3 debug 变式规格 | `templates/*`、`lab2/variants/remedial`、`lab3/variants/debug`、`scaffold/exercises/lab3/debug/...` 占位 |
| 样板扩展 | Lab3 `lab.yaml`+concepts+知识表 | `lab-packages/lab3/**` |
| 第 10–12 周 | 试用协议与测量设计 | `learning/trial-protocol-m5.md` |

## 明确未完成（需真人/跨成员）

| 项 | 原因 |
| --- | --- |
| 组织 5–30 人试用并分析 | 需真实学生与课程安排 |
| 基于试用数据的一次真实修订 | 依赖上一行 |
| Lab3 debug 完整可编译植入 mm.rs | 仅规格+占位；完整植入需与参考 `mm.rs` 同步并由 C 接入发放 |
| 可视化交互实现 / 评分服务挂接 | 成员 B/C 主责；A 已交规格供验收 |
| 周末共同「完整链演示」勾选 | 共同里程碑，非 A 单人可关闭 |

## 使用方式

教师备课：从 `lab2/`、`lab3/` 与 `templates/` 出发。  
成员 B：按 `visualization/` 实现视图与 OPRE。  
成员 C：按量规字段、复核门控与 recipe 对齐实现。
