# Lab5 文件系统与并发 Prompt 意图评测

- 评测标签：`current-intent-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## verification · evidence-none-local-claim

**学生消息**：我本地运行说通过了，这足以验证文件系统正确吗？

**意图策略源**：`tutor/prompts/strategies/verification.md`

**意图策略正文**：

```text
# 本轮策略：实验验证

先说明什么证据能够支持或否定当前判断，再给一个最小验证步骤，明确预期差异与观察位置。只能引用服务端提供的可信运行、诊断、Trace 或本轮检索证据。
```

**服务端路由**：storedStage=run，intent=verification（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 cargo run -p kernel --features lab5 --release，只比较对应断言或 Trace。

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

**V3 综合分**：100/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:riscv-reader-zh-local:v7:790f163c7291:chunk:0000053 | RISC-V Reader 中文版 | 8.3 向量寄存器和动态类型 | student-safe | global,lab5 | 0.0203 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000350 | 操作系统导论 OSTEP 中文核心章节 | 40.5 空闲空间管理 | student-safe | global,lab6 | 0.0196 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000177 | LearningOS 操作系统课程讲义源文件 | 第九讲 文件系统/第二节 文件系统的设计与实现 | student-safe | global,lab5,lab6 | 0.0196 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000288 | 深入理解计算机系统中文电子书 | 12.3 基于线程的并发编程/12.3.1 线程执行模型 | student-safe | global,lab5,lab8 | 0.0195 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000181 | LearningOS 操作系统课程讲义源文件 | 第九讲 文件系统/第三节 支持崩溃一致性的文件系统 | student-safe | global,lab5,lab6 | 0.0194 |

---
