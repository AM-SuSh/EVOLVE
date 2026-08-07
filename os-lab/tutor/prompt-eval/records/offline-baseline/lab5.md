# Lab5 文件系统与并发 Prompt 分阶段评测

- 评测标签：`offline-baseline`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab5-orient

**学生消息**：lab5 的文件系统我不会，fd 和管道到底怎么实现，教教我

**阶段提示词源**：`tutor/prompts/lab5/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“fd 槽位里记下什么，才能让同一套 open/read/write/close 分别服务内嵌文件和管道两端”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先不急着写实现。围绕 Lab5，写下你认为最关键的一个系统边界，以及这个判断的依据；我再帮你把它拆成可验证的小问题。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：90/100

**RAG 检索**：

- 候选：lexical=7，vector=25，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000006 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.1 从「读一份数据」到文件描述符 | student-safe | lab5 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000016 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/四、验证命令 | student-safe | lab5 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000002 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/一、问题场景 | student-safe | lab5 | 0.0381 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000001 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/零、开始之前 | student-safe | lab5 | 0.0376 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000013 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务一：跑通内核 | student-safe | lab5 | 0.0372 |

---

## 阅读阶段 · lab5-read

**学生消息**：我认为 fd 表是关键，但没想清楚普通文件和管道为什么能共用一套读写接口

**阶段提示词源**：`tutor/prompts/lab5/stage-read.md`（lab 定制）

**阶段提示词正文**：

```text
# 阅读阶段

沿 `sys_openat -> EmbeddedFs::open -> FdTable::alloc -> sys_read -> FdType 分发 -> read_at -> offset 推进` 与 `sys_pipe -> alloc_pipe_fds -> pipe_add_refs -> fork 继承 -> pipe_read/pipe_write -> 引用计数` 追踪对象生命周期。优先让学生区分表项类型、文件偏移和管道环形缓冲，并定位证据所在文件。
```

**服务端路由**：requested=read → tutorState.stage=read（gate=missing-source-evidence）

**模式/模型**：offline / offline-tutor

**AI 回复**：

从当前阅读位置选一个入口，沿调用链或数据流追到核心实现。每经过一层，分别写下输入、状态变化和输出，我们再检查哪一环最薄弱。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：90/100

**RAG 检索**：

- 候选：lexical=13，vector=23，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000006 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.1 从「读一份数据」到文件描述符 | student-safe | lab5 | 0.0377 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000015 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务三：动手修改 | student-safe | lab5 | 0.0376 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000003 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/一、问题场景 | student-safe | lab5 | 0.0370 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000005 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.1 从「读一份数据」到文件描述符 | student-safe | lab5 | 0.0360 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000026 | RISC-V Reader 中文版 | 3.2 函数调用规范（Calling convention） | student-safe | global | 0.0322 |

---

## 验证阶段 · lab5-run

**学生消息**：cargo run -p kernel --features lab5 --release 我跑完了，输出贴出来

**阶段提示词源**：`tutor/prompts/lab5/stage-run.md`（lab 定制）

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`Hello from testfile!`、`fs_test pass`、`pipe says hi`、`pipe_test pass`、全部进程退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于名字查找、fd 分配、offset 推进还是管道同步。
```

**服务端路由**：requested=run → tutorState.stage=run（gate=missing-trusted-run）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先写下你预期会看到的三个关键输出，再运行 cargo run -p kernel --features lab5 --release。完成后只贴和预期不同的部分，我们用差异定位下一步。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：90/100

**RAG 检索**：

- 候选：lexical=9，vector=36，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000016 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/四、验证命令 | student-safe | lab5 | 0.0395 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000013 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务一：跑通内核 | student-safe | lab5 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000015 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务三：动手修改 | student-safe | lab5 | 0.0390 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000071 | RISC-V Reader 中文版 | 第十章 RV32/64 特权架构 | student-safe | global | 0.0294 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000011 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.5 自旋锁：最短路上的互斥 | student-safe | lab5 | 0.0226 |

---

## 排错阶段 · lab5-debug

**学生消息**：fs_test 打印 open testfile failed，我猜是名字查找的问题

**阶段提示词源**：`tutor/prompts/lab5/stage-debug.md`（lab 定制）

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用最小 open/read 测试区分命名查找与 fd 分发，用去掉锁或缩短消息的对照实验定位管道缓冲问题。
```

**服务端路由**：requested=debug → tutorState.stage=debug（gate=missing-debug-hypothesis）

**模式/模型**：offline / offline-tutor

**AI 回复**：

把排错拆成证据链：精确现象、当前假设、能证伪它的最小实验。先补齐这三项，我再给下一层提示。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：90/100

**RAG 检索**：

- 候选：lexical=9，vector=23，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000016 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/四、验证命令 | student-safe | lab5 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000013 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务一：跑通内核 | student-safe | lab5 | 0.0377 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000015 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务三：动手修改 | student-safe | lab5 | 0.0373 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000007 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.2 本实验的「文件」从哪里来 | student-safe | lab5 | 0.0229 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000003 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/一、问题场景 | student-safe | lab5 | 0.0226 |

---

## 复盘阶段 · lab5-reflect

**学生消息**：复盘：我判断了 fd 只是索引，AI 提醒了引用计数，我用 pipe_test 验证了

**阶段提示词源**：`tutor/prompts/lab5/stage-reflect.md`（lab 定制）

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出，并说明 fd 生命周期与管道引用计数如何由证据支撑。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：requested=reflect → tutorState.stage=reflect（gate=missing-reflection-evidence）

**模式/模型**：offline / offline-tutor

**AI 回复**：

用三句话收束 Lab5：你能独立解释什么？AI 提醒了哪一个关键点？你用哪条运行结果或代码路径验证了它？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ❌ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：90/100

**RAG 检索**：

- 候选：lexical=4，vector=17，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000003 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/一、问题场景 | student-safe | lab5 | 0.0378 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000015 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务三：动手修改 | student-safe | lab5 | 0.0374 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000013 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务一：跑通内核 | student-safe | lab5 | 0.0367 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000011 | OS Lab 结构化概念与检查点 | 文件描述符与命名查找 | student-safe | lab5 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000016 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/四、验证命令 | student-safe | lab5 | 0.0226 |

---

## 迁移阶段 · lab5-transfer

**学生消息**：如果把管道换成消息队列，之前的判断还成立吗

**阶段提示词源**：`tutor/prompts/stages/stage-transfer.md`（通用兜底）

**阶段提示词正文**：

```text
# 迁移阶段

目标：改变一个关键条件，让学生重新解释机制，确认理解不是对原题答案的复述。

- 只提出一个迁移问题。
- 优先改变调度条件、特权边界、地址空间或失败模式。
- 要求学生先预测，再说明需要什么证据验证。
- 不把原实验通过直接等同于迁移能力。
```

**服务端路由**：requested=transfer → tutorState.stage=transfer（gate=transfer-check）

**模式/模型**：offline / offline-tutor

**AI 回复**：

改变一个关键条件后，Lab5 的原结论还成立吗？先写预测，再说明你会用什么代码路径或运行证据验证。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：100/100

**RAG 检索**：

- 候选：lexical=5，vector=24，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab5:000010 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.4 共享缓冲区上的交错：为何需要同步 | student-safe | lab5 | 0.0229 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000078 | RISC-V Reader 中文版 | 10.5 现代操作系统的监管者模式 | student-safe | global,lab5 | 0.0226 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000070 | RISC-V Reader 中文版 | 9.4 结束语 | student-safe | global,lab5 | 0.0223 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000079 | RISC-V Reader 中文版 | 10.5 现代操作系统的监管者模式 | student-safe | global,lab2,lab5 | 0.0218 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000072 | RISC-V Reader 中文版 | 10.2 简单嵌入式系统的机器模式 | student-safe | global,lab2,lab5 | 0.0216 |

---
