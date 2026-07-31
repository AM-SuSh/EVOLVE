# Lab2 补救变式内容包（装箱说明）

> 成员 A · Day 5  
> 变式 ID：`lab2-remedial-yield`  
> 目标：已接触 debug/fill 但仍混淆「让出 vs 退出」的学生，短路径重建状态机心智。

## 包内清单

| 路径 | 角色 |
| --- | --- |
| `manifest.yaml` | 学习目标、提示阶梯、成功/负向标准 |
| `PACKAGE.md`（本文件） | 装箱与 lint 预期 |
| `TEACHER_ACCEPTANCE.md` | Day6 教学验收勾选 |
| 源码起点 | `scaffold/exercises/lab2/debug/kernel/src/task.rs`（与 debug 同起点） |
| 手册锚点 | `labs/lab2-trap-and-task.md` 变体任务节 |

## 学习设计摘要

1. **强制对照表**（报告必填）：yield→Ready（错：Exited）；exit→Exited（错：Ready）。  
2. **提示更短**：L0 先填表；L3 转教师（触发 H5 复核意识）。  
3. **唯一不可妥协证据**：`yield-five-rounds`（≥5）；禁止只认退出码 0。  
4. **负向**：未修时 `still-exited-on-yield` 必须让 `yield-five-rounds` 失败。

## 预期能过的 lint（供 C）

- [x] manifest 含 `id/lab/variant/learning_goal/success_criteria/hint_ladder/negative_tests`  
- [x] `success_criteria.recipe` = `lab2.verify-trace.v1`  
- [x] assertions 与 `lab.yaml` 四条命名一致  
- [x] `source_template` 相对路径指向已有 scaffold 文件  
- [x] 提示阶梯 L0–L3 均不粘贴完整正确实现  

## 版本

- manifest `version`：建议发布时由 C 升为 `1.0.0`；当前草稿 `0.1.0-draft`。  
- 本装箱不修改内核源码；只固化教学规格与验收。

## 不在本包

- 自动生成新 bug 代码  
- 无教师审批的班级群发  
- 依赖 Sv39 可视化
