# Lab6 磁盘文件系统 Prompt 意图评测

- 评测标签：`current-intent-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## reflection · reflection-evidence-gap

**学生消息**：帮我复盘这次实验，我的结论还缺哪条证据？

**意图策略源**：`tutor/prompts/strategies/reflection.md`

**意图策略正文**：

```text
# 本轮策略：复盘反思

帮助学生把结论拆成“自己的判断、AI 提醒、实际证据、仍有限制”四部分。先回应其复盘中的具体缺口，再追问一条结论与证据之间的联系。
```

**服务端路由**：storedStage=orient，intent=reflection（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

复盘时要把结论和证据一一对应。先选 Lab6 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。

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

- 候选：lexical=0，vector=0，eligible=1235，fallback=无

**返回知识 chunk**：

（无检索 chunk）

---

## verification · evidence-verified-run

**学生消息**：怎样用这次运行结果验证 inode 链接计数？

**意图策略源**：`tutor/prompts/strategies/verification.md`

**意图策略正文**：

```text
# 本轮策略：实验验证

先说明什么证据能够支持或否定当前判断，再给一个最小验证步骤，明确预期差异与观察位置。只能引用服务端提供的可信运行、诊断、Trace 或本轮检索证据。
```

**服务端路由**：storedStage=orient，intent=verification（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 make test-lab6，只比较对应断言或 Trace。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1235，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000180 | LearningOS 操作系统课程讲义源文件 | 第九讲 文件系统/第三节 支持崩溃一致性的文件系统 | student-safe | global,lab5,lab6 | 0.0228 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000374 | 操作系统导论 OSTEP 中文核心章节 | 42.2 解决方案 1：文件系统检查程序 | student-safe | global,lab6 | 0.0223 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000336 | 操作系统导论 OSTEP 中文核心章节 | 39.13 硬链接 | student-safe | global,lab5,lab6 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000335 | 操作系统导论 OSTEP 中文核心章节 | 39.13 硬链接 | student-safe | global,lab5,lab6 | 0.0218 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000274 | 操作系统导论 OSTEP 中文核心章节 | 36.7 纳入操作系统：设备驱动程序 | student-safe | global,lab6 | 0.0209 |

---
