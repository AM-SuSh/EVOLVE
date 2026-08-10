# Lab8 线程与同步 Prompt 意图评测

- 评测标签：`current-intent-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## transfer · transfer-multicore

**学生消息**：如果改成多核，自旋锁的原结论还成立吗？

**意图策略源**：`tutor/prompts/strategies/transfer.md`

**意图策略正文**：

```text
# 本轮策略：迁移应用

先指出原问题中保持不变的机制与被改变的条件，再让学生预测结论是否仍成立，并选择一个可观察证据验证预测。不要把迁移题变成新的完整答案。
```

**服务端路由**：storedStage=read，intent=transfer（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先分开不变量与改变的条件：条件变化后，原机制未必整体失效。请先预测一个会变化的可观察结果，再说明如何验证。

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

**V3 综合分**：100/100

**RAG 检索**：

- 候选：lexical=11，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000219 | 操作系统导论 OSTEP 中文核心章节 | 28.8 评价自旋锁 | student-safe | global,lab5,lab8 | 0.0226 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000051 | LearningOS 操作系统课程讲义源文件 | 第十二讲 同步与互斥/第一节 概述 | student-safe | global,lab5,lab8 | 0.0225 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000007 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.3 和 Lab5 自旋锁并存，而不是互相取代 | student-safe | lab8 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000017 | OS Lab 本地实验手册 | 实验 8：线程与同步/五、AI 提问模板 | student-safe | lab8 | 0.0222 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000218 | 操作系统导论 OSTEP 中文核心章节 | 28.9 比较并交换 | student-safe | global,lab5,lab8 | 0.0221 |

---
