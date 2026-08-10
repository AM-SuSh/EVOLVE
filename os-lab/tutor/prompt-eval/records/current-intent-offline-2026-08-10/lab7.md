# Lab7 IPC 与信号 Prompt 意图评测

- 评测标签：`current-intent-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## debug · evidence-conflict-failed-run

**学生消息**：我认为信号测试通过了，但服务端运行失败了，应该怎么定位？

**意图策略源**：`tutor/prompts/strategies/debug.md`

**意图策略正文**：

```text
# 本轮策略：调试分析

先回应现象最可能涉及的机制范围，并区分已知事实与待验证假设。把下一步收敛为一个可证伪假设和一个最小观察点，不凭空猜测修复结果。
```

**服务端路由**：storedStage=reflect，intent=debug（gate=intent-routed）

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

- 候选：lexical=10，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000125 | 深入理解计算机系统中文电子书 | 8.5 信号/8.5.3 接收信号 | student-safe | global,lab2,lab4,lab7 | 0.0208 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000119 | 深入理解计算机系统中文电子书 | 8.5 信号 | student-safe | global,lab2,lab4,lab7 | 0.0204 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000248 | 操作系统导论 OSTEP 中文核心章节 | - | student-safe | global,lab8 | 0.0196 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000221 | 操作系统导论 OSTEP 中文核心章节 | 28.10 链接的加载和条件式存储指令 | student-safe | global,lab5,lab8 | 0.0193 |

---
