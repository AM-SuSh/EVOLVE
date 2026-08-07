# Lab7 IPC 与信号 Prompt 分阶段评测

- 评测标签：`offline-baseline`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab7-orient

**学生消息**：lab7 的信号我不会，kill 到 handler 到底怎么走，教教我

**阶段提示词源**：`tutor/prompts/lab7/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“kill 返回后目标 handler 是否已经执行，信号从 pending 到投递由谁、在什么时机完成”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先不急着写实现。围绕 Lab7，写下你认为最关键的一个系统边界，以及这个判断的依据；我再帮你把它拆成可验证的小问题。

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

- 候选：lexical=10，vector=17，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000016 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/五、AI 提问模板 | student-safe | lab7 | 0.0390 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000016 | OS Lab 结构化概念与检查点 | 信号 pending、mask 与投递 | student-safe | lab7 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000002 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/零、开始之前/环境准备（与 Lab6 相同） | student-safe | lab7 | 0.0383 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000011 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/任务一：跑通 lab7 | student-safe | lab7 | 0.0376 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000015 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/四、验证 | student-safe | lab7 | 0.0374 |

---

## 阅读阶段 · lab7-read

**学生消息**：我认为 pending 是关键，但没想清楚它和 mask 的区别

**阶段提示词源**：`tutor/prompts/lab7/stage-read.md`（lab 定制）

**阶段提示词正文**：

```text
# 阅读阶段

沿 `sys_kill -> SignalState::receive -> trap 返回前 try_deliver_signals -> handle_pending -> take_deliverable -> saved_trap_cx -> sepc=handler -> sys_sigreturn` 追踪信号生命周期，另沿 `sys_dup -> FdType 复制 -> pipe_add_refs` 追踪 fd 共享。优先让学生区分 pending、mask 与 handler 帧三个状态，并定位证据所在文件。
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

- 候选：lexical=10，vector=18，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000016 | OS Lab 结构化概念与检查点 | 信号 pending、mask 与投递 | student-safe | lab7 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000008 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000000 | OS Lab 本地实验手册 | 实验 7：IPC 与信号 | student-safe | lab7 | 0.0352 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000002 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/零、开始之前/环境准备（与 Lab6 相同） | student-safe | lab7 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0229 |

---

## 验证阶段 · lab7-run

**学生消息**：make test-lab7 我跑完了，输出贴出来

**阶段提示词源**：`tutor/prompts/lab7/stage-run.md`（lab 定制）

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`dup_test pass`、`signal_test pass`、`signal_mask_test pass`、`pipe says hi`、`pipe_test pass`、全部进程退出），再运行 `make test-lab7`。只比较预测与实际差异，帮助判断问题属于 dup 引用、信号投递时机还是 mask 语义。
```

**服务端路由**：requested=run → tutorState.stage=run（gate=missing-trusted-run）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先写下你预期会看到的三个关键输出，再运行 make test-lab7。完成后只贴和预期不同的部分，我们用差异定位下一步。

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

- 候选：lexical=5，vector=23，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000015 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/四、验证 | student-safe | lab7 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000011 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/任务一：跑通 lab7 | student-safe | lab7 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0387 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000002 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/零、开始之前/环境准备（与 Lab6 相同） | student-safe | lab7 | 0.0378 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000001 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/零、开始之前 | student-safe | lab7 | 0.0224 |

---

## 排错阶段 · lab7-debug

**学生消息**：屏蔽期间 handler 还是执行了，我猜是 mask 值写错

**阶段提示词源**：`tutor/prompts/lab7/stage-debug.md`（lab 定制）

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用无 mask 与有 mask 的最小信号场景区分 pending、投递与 handler 执行。
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

- 候选：lexical=7，vector=18，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000016 | OS Lab 结构化概念与检查点 | 信号 pending、mask 与投递 | student-safe | lab7 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000016 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/五、AI 提问模板 | student-safe | lab7 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000008 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0387 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000000 | OS Lab 本地实验手册 | 实验 7：IPC 与信号 | student-safe | lab7 | 0.0347 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0226 |

---

## 复盘阶段 · lab7-reflect

**学生消息**：复盘：我判断了 kill 只登记，AI 提醒了投递时机，我用 signal_mask_test 验证了

**阶段提示词源**：`tutor/prompts/lab7/stage-reflect.md`（lab 定制）

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出，并说明“pending 不等于 handler 已运行”。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：requested=reflect → tutorState.stage=reflect（gate=missing-reflection-evidence）

**模式/模型**：offline / offline-tutor

**AI 回复**：

用三句话收束 Lab7：你能独立解释什么？AI 提醒了哪一个关键点？你用哪条运行结果或代码路径验证了它？

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

- 候选：lexical=7，vector=15，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000014 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/提交清单（自查） | student-safe | lab7 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000016 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/五、AI 提问模板 | student-safe | lab7 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000011 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/三、实验任务/任务一：跑通 lab7 | student-safe | lab7 | 0.0380 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000009 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0368 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000000 | OS Lab 本地实验手册 | 实验 7：IPC 与信号 | student-safe | lab7 | 0.0357 |

---

## 迁移阶段 · lab7-transfer

**学生消息**：如果信号在系统调用入口就投递，之前的判断还成立吗

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

改变一个关键条件后，Lab7 的原结论还成立吗？先写预测，再说明你会用什么代码路径或运行证据验证。

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

- 候选：lexical=8，vector=20，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000008 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000009 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/二、背景知识/2.4 信号：异步递事件 | student-safe | lab7 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000003 | OS Lab 本地实验手册 | 实验 7：IPC 与信号/一、问题场景 | student-safe | lab7 | 0.0219 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab7:000000 | OS Lab 本地实验手册 | 实验 7：IPC 与信号 | student-safe | lab7 | 0.0217 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000016 | OS Lab 结构化概念与检查点 | 信号 pending、mask 与投递 | student-safe | lab7 | 0.0205 |

---
