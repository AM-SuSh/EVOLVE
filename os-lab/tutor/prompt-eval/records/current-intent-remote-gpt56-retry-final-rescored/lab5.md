# Lab5 文件系统与并发 Prompt 意图评测

- 评测标签：`eval-2026-08-10T08-18-11`
- 模式：`remote` / 模型：`gpt-5.6-luna`
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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

不够。命令返回成功只能说明一次运行没有暴露错误，不能证明并发、fork 后描述符继承和管道引用计数都正确。

最小验证：贴出完整 QEMU 输出，确认包含 `Hello from testfile!`、`fs_test pass`、`pipe says hi`、`pipe_test pass`、`All processes exited.`，并确认 QEMU 正常退出；再重复运行几次，观察 `pipe_test` 是否稳定通过。

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
