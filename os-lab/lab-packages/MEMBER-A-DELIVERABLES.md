# 成员 A 交付总览

更新：2026-07-31

## 7 日计划交付（本轮主交付）

索引：[`MEMBER-A-7DAY/README.md`](./MEMBER-A-7DAY/README.md)

| Day | 落点 |
| --- | --- |
| 1 缺口表 | `MEMBER-A-7DAY/day1-gap-table.md` |
| 2 检查点 YAML | `lab2/checkpoints.yaml` |
| 3 金标准对话 | `../learning/tutor-golden-dialogues-lab2.json` |
| 4 量规冻结 | `../learning/rubric-v2-frozen.md` |
| 5 OPRE/补救装箱 | `visualization/opre-copy-final.md`、`lab2/variants/remedial/PACKAGE.md` |
| 6 变式验收 | `lab2/variants/remedial/TEACHER_ACCEPTANCE.md` |
| 7 可用性脚本 | `../learning/usability-script-5person.md` |

## 既往已完成（可验收文档/规格）

| 计划周次 | 任务 | 落点 |
| --- | --- | --- |
| 第 1 周 | Lab1–8 知识盘点；Lab2 `lab.yaml`+concepts；量规细项；10 条轨迹 | `lab-packages/README.md`、`lab2/**`、`learning/rubric-v2-draft.md`、`traces-lab2-mock.json` |
| 第 2–3 周 | Lab2 正文层次；fill/debug 阶梯；UI 文案审核 | `labs/lab2-*.md`、`variants/*`、`ui-copy-review.md`、`DAY2-3-DELIVERABLE.md` |
| 第 4–5 周 | Trap/调度/页表视图规格；OPRE 小任务 | `visualization/README.md`、`opre-tasks.md` |
| 第 6–7 周 | Lab2/3 检查点与迁移题；20 条标注；教师复核规则；量规 +T1/T2 | `lab2/checkpoints.md`、`lab3/checkpoints.md`、`traces-lab2-mock.json`、`teacher-review-gates.md`、`rubric-v2-draft.md` |
| 第 8–9 周 | 创建模板+审核清单；Lab2 补救变式；Lab3 debug 变式规格 | `templates/*`、`lab2/variants/remedial`、`lab3/variants/debug`、`scaffold/exercises/lab3/debug/...` 占位 |
| 样板扩展 | Lab3 `lab.yaml`+concepts+知识表 | `lab-packages/lab3/**` |
| 第 10–12 周 | 试用协议与测量设计 | `learning/trial-protocol-m5.md` |
| 评分研究 | AI 交互过程评分详解 | `learning/ai-interaction-scoring.md` |

## 明确未完成（需真人/跨成员）

| 项 | 原因 |
| --- | --- |
| 组织 5 人可用性并写修订记录 | 需真人；脚本已就绪 |
| 基于试用数据的一次真实修订 | 依赖上一行 |
| Lab3 debug 完整可编译植入 mm.rs | 仅规格+占位；需与参考同步并由 C 接入 |
| 门控/评分服务/OPRE UI/向导 | 成员 B/C 主责；A 规格已交 |
| remedial 班级正式发布 | 待 C lint/dry-run + 教师操作 |

## 使用方式

- **C**：先读 `checkpoints.yaml`、`tutor-golden-dialogues-lab2.json`、`rubric-v2-frozen.md`  
- **B**：先读 `opre-copy-final.md`
- **教师发布补救变式**：`variants/remedial/TEACHER_ACCEPTANCE.md` + `PACKAGE.md`
