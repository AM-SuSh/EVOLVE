# 成员 A · 第 1 天交付说明

完成日期：2026-07-28（对照《三人小组后续实验发展实施计划》M0 / §十四）

## 做了什么

1. **新建 Lab 包样板目录** `os-lab/lab-packages/`，选定 **Lab2** 为样板。
2. **Lab1–8 知识盘点表**（第一层索引）写在 `lab-packages/README.md`。
3. **Lab2 `lab.yaml`**：元数据、知识点、阶段任务、文件、验证断言、误区、变体引用。
4. **两个 concept spec**：`concepts/trap.yaml`、`concepts/scheduler.yaml`（六层次 + 关系边）。
5. **知识点细表**：`lab2/knowledge-table.md`。
6. **fill / debug 变体说明**：`variants/*/manifest.yaml`（目标、负向测试、反「仅退出码 0」）。
7. **量规 v2 草案**：`learning/rubric-v2-draft.md`（12 个可观察细项）。
8. **10 条模拟轨迹人工打分**：`learning/traces-lab2-mock.json`（含与现网启发式的校准备注）。

## 刻意未做（属后续天）

- 未改 `lab2-trap-and-task.md` 正文（第 2–3 天）
- 未改 `rubric.mjs` 线上逻辑（交 C 按草案挂接）
- 未改 Monaco / tutor-server / schema（B/C 职责）

## 请 B/C 对齐的命名

- Trace：`trap_enter` / `task_switch`（当前 PoC 已真实采集）
- 断言 id：`hello-output` / `power-result` / `yield-five-rounds` / `all-exited`
- Recipe：`lab2.verify-trace.v1`
