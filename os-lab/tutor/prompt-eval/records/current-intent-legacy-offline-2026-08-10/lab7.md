# Lab7 IPC 与信号 Prompt 分阶段评测

- 评测标签：`current-intent-legacy-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab7-orient

**学生消息**：lab7 的信号我不会，kill 到 handler 到底怎么走，教教我

**阶段提示词源**：`tutor/prompts/lab7/stage-orient.md`

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“kill 返回后目标 handler 是否已经执行，信号从 pending 到投递由谁、在什么时机完成”。不要进入具体 patch。
```

**服务端路由**：storedStage=orient，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab7 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：73/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0234 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000016 | OS Lab 结构化概念与检查点 | 信号 pending、mask 与投递 | student-safe | lab7 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000009 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000002 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/零、开始之前/环境准备（与 Lab6 相同） | student-safe | lab7 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000016 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/五、AI 提问模板 | student-safe | lab7 | 0.0222 |

---

## 阅读阶段 · lab7-read

**学生消息**：我认为 pending 是关键，但没想清楚它和 mask 的区别

**阶段提示词源**：`tutor/prompts/lab7/stage-read.md`

**阶段提示词正文**：

```text
# 阅读阶段

沿 `sys_kill -> SignalState::receive -> trap 返回前 try_deliver_signals -> handle_pending -> take_deliverable -> saved_trap_cx -> sepc=handler -> sys_sigreturn` 追踪信号生命周期，另沿 `sys_dup -> FdType 复制 -> pipe_add_refs` 追踪 fd 共享。优先让学生区分 pending、mask 与 handler 帧三个状态，并定位证据所在文件。
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
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：55/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000016 | OS Lab 结构化概念与检查点 | 信号 pending、mask 与投递 | student-safe | lab7 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000008 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000009 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000016 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/五、AI 提问模板 | student-safe | lab7 | 0.0222 |

---

## 验证阶段 · lab7-run

**学生消息**：make test-lab7 我跑完了，输出贴出来

**阶段提示词源**：`tutor/prompts/lab7/stage-run.md`

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`dup_test pass`、`signal_test pass`、`signal_mask_test pass`、`pipe says hi`、`pipe_test pass`、全部进程退出），再运行 `make test-lab7`。只比较预测与实际差异，帮助判断问题属于 dup 引用、信号投递时机还是 mask 语义。
```

**服务端路由**：storedStage=run，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab7 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：64/100

**RAG 检索**：

- 候选：lexical=14，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000015 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/四、验证 | student-safe | lab7 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000011 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/任务一：跑通 lab7 | student-safe | lab7 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000002 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/零、开始之前/环境准备（与 Lab6 相同） | student-safe | lab7 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000001 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/零、开始之前 | student-safe | lab7 | 0.0224 |

---

## 排错阶段 · lab7-debug

**学生消息**：屏蔽期间 handler 还是执行了，我猜是 mask 值写错

**阶段提示词源**：`tutor/prompts/lab7/stage-debug.md`

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用「注册 handler + kill + 返回用户态」的最小场景区分 pending、投递与信号帧（saved_trap_cx / a0 / sepc）。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab7 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：73/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000016 | OS Lab 结构化概念与检查点 | 信号 pending、mask 与投递 | student-safe | lab7 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000016 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/五、AI 提问模板 | student-safe | lab7 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000008 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000009 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0224 |

---

## 复盘阶段 · lab7-reflect

**学生消息**：复盘：我判断了 kill 只登记，AI 提醒了投递时机，我用 signal_mask_test 验证了

**阶段提示词源**：`tutor/prompts/lab7/stage-reflect.md`

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出，并说明“pending 不等于 handler 已运行”。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：storedStage=reflect，intent=reflection（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

复盘时要把结论和证据一一对应。先选 Lab7 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：64/100

**RAG 检索**：

- 候选：lexical=20，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000016 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/五、AI 提问模板 | student-safe | lab7 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000011 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/任务一：跑通 lab7 | student-safe | lab7 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000009 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0222 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000016 | OS Lab 结构化概念与检查点 | 信号 pending、mask 与投递 | student-safe | lab7 | 0.0217 |

---

## 迁移阶段 · lab7-transfer

**学生消息**：如果信号在系统调用入口就投递，之前的判断还成立吗

**阶段提示词源**：`tutor/prompts/stages/stage-transfer.md`

**阶段提示词正文**：

```text
# 迁移阶段

目标：改变一个关键条件，让学生重新解释机制，确认理解不是对原题答案的复述。

- 只提出一个迁移问题。
- 优先改变调度条件、特权边界、地址空间或失败模式。
- 要求学生先预测，再说明需要什么证据验证。
- 不把原实验通过直接等同于迁移能力。
```

**服务端路由**：storedStage=transfer，intent=transfer（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先分开不变量与改变的条件：条件变化后，原机制未必整体失效。请先预测一个会变化的可观察结果，再说明如何验证。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：64/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000009 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0222 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000197 | rCore Tutorial Guide | 信号量机制/信号量的起源和基本思路 | student-safe | global,lab8 | 0.0194 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000100 | 操作系统导论 OSTEP 中文核心章节 | 16.2 我们引用哪个段 | student-safe | global,lab3 | 0.0193 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab7:000008 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0190 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000011 | LearningOS 操作系统课程讲义源文件 | 第十讲 进程间通信/第一节 进程间通信(IPC)概述/3. 消息队列(Message Queue)/消息队列控制：查询队列状态、修改权限、删除队列等 | student-safe | global,lab7 | 0.0189 |

---
