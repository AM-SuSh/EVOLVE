# Lab7 IPC 与信号 Prompt 分阶段评测

- 评测标签：`remote-stu`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`https://you.loveme.space/v1`

## 定界阶段 · lab7-orient

**学生消息**：lab7 的信号我不会，kill 到 handler 到底怎么走，教教我

**阶段提示词源**：`tutor/prompts/lab7/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“kill 返回后目标 handler 是否已经执行，信号从 pending 到投递由谁、在什么时机完成”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

先给出你的初始判断：你认为 `kill` 返回时，目标进程的 `handler` 已经执行了吗？请明确回答“是/否”，并说明信号此时更可能处于 `pending` 还是已经 `delivery`。

接着请沿代码查一个点：在 `kernel/src/signal.rs` 中，`kill` 主要修改目标进程的哪个状态字段？再看 `kernel/src/trap.rs`，内核在哪个时机检查这个状态？

先不要改代码；只需贴出你的判断和相关函数名。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ❌ |
| lengthOk | ❌ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：80/100

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已抓住关键：`pending` 表示“信号是否已到达但尚未处理”，`mask` 表示“当前允许哪些信号投递”。被屏蔽的信号通常仍会留在 `pending`，因此二者不是同一个状态。

请先沿 `kernel/src/signal.rs` 找到 `receive`、`take_deliverable`，回答一个问题：`take_deliverable` 的筛选条件如何同时使用 `pending` 和 `mask`？观察它取出信号前，是否先排除被 mask 的位。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：80/100

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

请贴出完整输出，至少包含以下行，并说明 QEMU 是否正常退出：

\`\`\`text
dup_test pass
signal_test pass
signal_mask_test pass
pipe says hi
pipe_test pass
All processes exited.
\`\`\`

我会只根据实际输出与预期差异，判断是 `dup`、信号投递时机还是屏蔽字语义问题。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你的假设可证伪：若 `mask` 值确实写错，首先应表现为 `sigprocmask` 入参没有包含实际的 `SIGUSR1` 位；若入参正确，则应检查 pending 与 delivery 的边界。

请做一个最小实验：在 `sigprocmask` 系统调用入口记录“入参 mask”和“使用的 SIGUSR1 编号”，并观察屏蔽后 `kill` 是否只设置 pending、handler 是否在下一次返回用户态前执行；把这三项输出贴出来。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已区分了 `kill` 的登记动作与后续投递，但“用 `signal_mask_test` 验证”还缺少可核对证据；尤其要说明 **pending 不等于 handler 已运行**。请只补充一条完整链路：你自己的判断、AI 的关键提醒，以及 `kernel/src/signal.rs`/`kernel/src/trap.rs` 中对应代码或测试输出分别是什么？

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

不完全成立：若内核在系统调用入口就投递，handler 可能先于该 syscall 的实际处理执行；这与“处理完 syscall、返回用户态前投递”不同，尤其会影响 `read`、返回值和被保存的 `sepc`。

迁移问题：若进程调用阻塞式 `read` 前信号已 pending，你预测 handler 会在 `read` 阻塞前执行，还是等 `read` 返回后执行？请指出 `kernel/src/trap.rs` 中应观察的上下文或输出证据。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：90/100

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
