# Lab3 内存与虚拟内存 Prompt 意图评测

- 评测标签：`current-intent-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## debug · debug-panic-orient

**学生消息**：cargo run 后出现 page fault panic，我该怎么定位？

**意图策略源**：`tutor/prompts/strategies/debug.md`

**意图策略正文**：

```text
# 本轮策略：调试分析

先回应现象最可能涉及的机制范围，并区分已知事实与待验证假设。把下一步收敛为一个可证伪假设和一个最小观察点，不凭空猜测修复结果。
```

**服务端路由**：storedStage=orient，intent=debug（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

这个现象说明当前实现与预期至少在一个可观察状态上分叉。先写出最早出现差异的一行输出，以及一个能被它证伪的原因假设。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证 | student-safe | lab3 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0222 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000165 | 操作系统导论 OSTEP 中文核心章节 | 21.3 页错误 | student-safe | global,lab3 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000170 | 操作系统导论 OSTEP 中文核心章节 | 21.6 交换何时真正发生 | student-safe | global,lab3 | 0.0205 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0201 |

---

## debug · debug-panic-read

**学生消息**：cargo run 后出现 page fault panic，我该怎么定位？

**意图策略源**：`tutor/prompts/strategies/debug.md`

**意图策略正文**：

```text
# 本轮策略：调试分析

先回应现象最可能涉及的机制范围，并区分已知事实与待验证假设。把下一步收敛为一个可证伪假设和一个最小观察点，不凭空猜测修复结果。
```

**服务端路由**：storedStage=read，intent=debug（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

这个现象说明当前实现与预期至少在一个可观察状态上分叉。先写出最早出现差异的一行输出，以及一个能被它证伪的原因假设。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证 | student-safe | lab3 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0222 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000165 | 操作系统导论 OSTEP 中文核心章节 | 21.3 页错误 | student-safe | global,lab3 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000170 | 操作系统导论 OSTEP 中文核心章节 | 21.6 交换何时真正发生 | student-safe | global,lab3 | 0.0205 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0201 |

---

## debug · debug-panic-transfer

**学生消息**：cargo run 后出现 page fault panic，我该怎么定位？

**意图策略源**：`tutor/prompts/strategies/debug.md`

**意图策略正文**：

```text
# 本轮策略：调试分析

先回应现象最可能涉及的机制范围，并区分已知事实与待验证假设。把下一步收敛为一个可证伪假设和一个最小观察点，不凭空猜测修复结果。
```

**服务端路由**：storedStage=transfer，intent=debug（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

这个现象说明当前实现与预期至少在一个可观察状态上分叉。先写出最早出现差异的一行输出，以及一个能被它证伪的原因假设。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证 | student-safe | lab3 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0222 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000165 | 操作系统导论 OSTEP 中文核心章节 | 21.3 页错误 | student-safe | global,lab3 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000170 | 操作系统导论 OSTEP 中文核心章节 | 21.6 交换何时真正发生 | student-safe | global,lab3 | 0.0205 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0201 |

---

## concept · topic-switch-page-table

**学生消息**：另一个问题：页表为什么要分三级？

**意图策略源**：`tutor/prompts/strategies/concept.md`

**意图策略正文**：

```text
# 本轮策略：概念理解

先用必要的最少解释回应学生所问的概念，明确关键边界或因果关系。若学生判断有误，直接指出具体错误及理由；随后只追问一个能暴露其理解依据的问题。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab3 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000070 | 操作系统导论 OSTEP 中文核心章节 | 13.2 多道程序和时分共享 | student-safe | global,lab3 | 0.0209 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000013 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务三：动手小修改 | student-safe | lab3 | 0.0207 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000016 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/五、AI 提问模板 | student-safe | lab3 | 0.0198 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000361 | 操作系统导论 OSTEP 中文核心章节 | 41.3 组织结构：柱面组 | student-safe | global,lab6 | 0.0196 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000006 | LearningOS 操作系统课程讲义源文件 | 第一讲 操作系统概述 | student-safe | global,lab5 | 0.0193 |

---
