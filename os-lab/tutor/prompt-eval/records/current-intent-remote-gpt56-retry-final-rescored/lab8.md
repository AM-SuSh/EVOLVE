# Lab8 线程与同步 Prompt 意图评测

- 评测标签：`eval-2026-08-10T08-18-11`
- 模式：`remote` / 模型：`gpt-5.6-luna`
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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

不完全成立：**互斥正确性和“不保证公平、可能饥饿”仍成立**；改变的是性能条件。单核上自旋会浪费唯一 CPU，多核上等待线程可在另一核运行，若临界区很短，自旋可能更划算；但临界区长或竞争激烈时仍会浪费 CPU。[kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000219]

迁移预测：把 Lab5 自旋锁竞争测试改为多核运行，你预计总耗时和 CPU 空转现象会如何变化？可先查 QEMU 的核数配置，再重复运行测试比较结果。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
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
