# Lab1 裸机启动与 SBI Prompt 意图评测

- 评测标签：`current-intent-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## concept · concept-boot-entry

**学生消息**：内核入口地址为什么必须和链接脚本一致？

**意图策略源**：`tutor/prompts/strategies/concept.md`

**意图策略正文**：

```text
# 本轮策略：概念理解

先用必要的最少解释回应学生所问的概念，明确关键边界或因果关系。若学生判断有误，直接指出具体错误及理由；随后只追问一个能暴露其理解依据的问题。
```

**服务端路由**：storedStage=run，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab1 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000006 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.2 处理器如何进入内核入口 | student-safe | lab1 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000004 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.1 内核映像如何装入内存 | student-safe | lab1 | 0.0229 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000082 | LearningOS 操作系统课程讲义源文件 | 第一章：rCore-Tutorial ch1 内核架构分析/学习要点 | student-safe | global,lab1 | 0.0228 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000005 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.2 处理器如何进入内核入口 | student-safe | lab1 | 0.0224 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000016 | rCore Tutorial Guide | 构建裸机执行环境/正确配置栈空间布局 | student-safe | global,lab1 | 0.0216 |

---
