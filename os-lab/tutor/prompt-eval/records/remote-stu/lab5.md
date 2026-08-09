# Lab5 文件系统与并发 Prompt 分阶段评测

- 评测标签：`eval-2026-08-09T09-01-40`
- 模式：`remote` / 模型：`gpt-5.6-luna`
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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

先给出你的初始判断：你认为最难的是“fd 和管道如何实现”，还是“同一套 `read/write/close` 如何根据 fd 找到不同对象并分发”？

请先回答一个具体问题：在进程的 fd 槽位里，你觉得需要记录什么，才能让同一套接口分别服务内嵌文件、管道读端和管道写端？

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已经抓到关键：`fd` 本身只是表下标，真正决定行为的是表项里的 `FdType`。请查看 `kernel/src/fs/mod.rs` 中 `sys_read` 的分发代码：

它如何根据同一个 `fd` 分别调用普通文件的 `read_at` 和管道的 `pipe_read`？请贴出这段 `match`（或等价代码），并说明两条分支各自推进的状态是什么。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

请贴出 QEMU 的完整末尾输出，至少包含：

`Hello from testfile!`、`fs_test pass`、`pipe says hi`、`pipe_test pass`、`All processes exited.`

并说明 QEMU 是否正常退出、终端是否回到命令提示符。我们先只根据实际输出与预期的差异定位问题。

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

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。

对 fill/debug 工作区：优先用「`fs_test` 是否仍过、`pipe_test` 是否失败」区分「内嵌文件路径」与「fork 后管道引用计数」；再引导到 `clone_fd_table` / `bump_inherited_pipe_refs`，不要先改用户测例关端顺序。
```

**服务端路由**：requested=debug → tutorState.stage=debug（gate=missing-debug-hypothesis）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你的判断目前指向“命名查找失败”，但还需区分它与 fd 分配/分发问题。请做一个最小检查：对照 `kernel/src/fs/embedded.rs` 的内嵌文件表，逐字核对 `user/src/bin/fs_test.rs` 传给 `open` 的路径。

观察什么：`open` 的返回值是否为负；若为非负，再立刻对该 fd 做一次最小 `read`，记录返回值。你的可证伪假设是：**若路径与表中键完全一致，open 应成功；否则 open 返回失败**。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：80/100

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已区分了“fd 是索引”和“对象由引用计数管理”，但 `pipe_test` 通过只能证明管道功能，不足以单独证明引用计数生命周期。

请补充一条证据链：结合 `fork` 继承 fd 表、`close` 路径和管道端计数代码，说明父子进程关闭各自 fd 后，何时仍可读写、何时管道对象才可释放；同时贴出对应运行输出或代码位置。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

“需要同步保护共享状态”这一判断仍成立；但“按字节流处理、连续推进 offset”未必成立，消息队列通常还要维护消息边界与整条消息的生命周期。

迁移问题：若写端发送两条消息，读端缓冲区小于第一条消息，你预测 `read` 应返回部分消息、失败，还是阻塞？请结合仓库中队列的读写接口说明预测，并指出实验时观察返回长度、消息边界和队列计数。

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
