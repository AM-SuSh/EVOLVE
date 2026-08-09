# Lab8 线程与同步 Prompt 分阶段评测

- 评测标签：`eval-2026-08-09T09-01-40`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab8-orient

**学生消息**：lab8 的线程和锁我不会，阻塞和自旋到底差在哪，教教我

**阶段提示词源**：`tutor/prompts/lab8/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“同一进程内线程共享什么、独占什么，exit 结束的是线程还是进程”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已经抓住 Lab8 的核心疑问：阻塞与自旋的差别，取决于线程等待锁时是否继续占用 CPU。先做一个初始判断：

同一进程内的线程通常共享哪些资源、各自独占哪些资源？另外，某个线程调用 `exit` 时，结束的是这个线程，还是整个进程？

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

- 候选：lexical=8，vector=21，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000001 | OS Lab 本地实验手册 | 实验 8：线程与同步/零、开始之前 | student-safe | lab8 | 0.0395 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000002 | OS Lab 本地实验手册 | 实验 8：线程与同步/零、开始之前/环境准备（与 Lab6/7 相同） | student-safe | lab8 | 0.0395 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000016 | OS Lab 本地实验手册 | 实验 8：线程与同步/四、验证 | student-safe | lab8 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000012 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/任务一：跑通 lab8（必做） | student-safe | lab8 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000005 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.1 进程之下再挂一层线程 | student-safe | lab8 | 0.0360 |

---

## 阅读阶段 · lab8-read

**学生消息**：我认为等待队列是关键，但没想清楚它和就绪队列的关系

**阶段提示词源**：`tutor/prompts/lab8/stage-read.md`（lab 定制）

**阶段提示词正文**：

```text
# 阅读阶段

沿 `thread_create -> alloc_thread_user_stack -> add_thread -> enqueue_ready -> run_next_thread` 与 `mutex_lock -> MutexBlocking::lock -> Blocked -> unlock -> mark_mutex_handoff -> re_enque` 追踪线程与同步路径。优先让学生区分 TCB 状态、wait queue 阻塞唤醒与死锁检测短路，并定位证据所在文件。
```

**服务端路由**：requested=read → tutorState.stage=read（gate=missing-source-evidence）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你的判断抓住了关键：等待队列保存“暂时不能继续”的线程，就绪队列保存“可以被调度”的线程；关键在于阻塞和唤醒时如何在两者间迁移。

请贴出 `os-sync/src/mutex.rs` 中 `MutexBlocking::lock`、`unlock`，以及内核里处理 `Blocked`、`mark_mutex_handoff`、`re_enque` 的局部代码。重点观察：线程进入等待队列后，是否立即从就绪队列移除；唤醒时由谁把它重新加入就绪队列？

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

- 候选：lexical=4，vector=21，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000005 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.1 进程之下再挂一层线程 | student-safe | lab8 | 0.0364 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000007 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.3 和 Lab5 自旋锁并存，而不是互相取代 | student-safe | lab8 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000000 | OS Lab 本地实验手册 | 实验 8：线程与同步 | student-safe | lab8 | 0.0234 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000017 | OS Lab 结构化概念与检查点 | 线程状态与阻塞唤醒 | student-safe | lab8 | 0.0231 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000018 | OS Lab 结构化概念与检查点 | 互斥锁与共享计数不变量 | student-safe | lab8 | 0.0231 |

---

## 验证阶段 · lab8-run

**学生消息**：make test-lab8 我跑完了，输出如下

**阶段提示词源**：`tutor/prompts/lab8/stage-run.md`（lab 定制）

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`threads_test pass`、`threads_arg_test pass`、`mutex_test pass`、`condvar_test pass`、`pipetest passed!`、`deadlock test mutex 1 OK!`、`deadlock test semaphore 1 OK!`、`pipe_test pass`、全部进程退出），再运行 `make test-lab8`。只比较预测与实际差异，帮助判断问题属于线程调度、阻塞唤醒还是死锁检测。
```

**服务端路由**：requested=run → tutorState.stage=run（gate=missing-trusted-run）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已经执行了 `make test-lab8`，但当前消息还没有包含可核对的运行证据；我不能仅凭“跑完了”判断通过。

请贴出完整输出中这 9 行，并说明 QEMU 是否正常退出：`threads_test pass`、`threads_arg_test pass`、`mutex_test pass`、`condvar_test pass`、`pipetest passed!`、两行 `deadlock ... OK!`、`pipe_test pass`、`All processes exited.`

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

- 候选：lexical=5，vector=12，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000016 | OS Lab 本地实验手册 | 实验 8：线程与同步/四、验证 | student-safe | lab8 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000015 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/提交清单（自查） | student-safe | lab8 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000012 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/任务一：跑通 lab8（必做） | student-safe | lab8 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000002 | OS Lab 本地实验手册 | 实验 8：线程与同步/零、开始之前/环境准备（与 Lab6/7 相同） | student-safe | lab8 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000001 | OS Lab 本地实验手册 | 实验 8：线程与同步/零、开始之前 | student-safe | lab8 | 0.0224 |

---

## 排错阶段 · lab8-debug

**学生消息**：mutex_test 的计数不对，我猜是循环边界的问题

**阶段提示词源**：`tutor/prompts/lab8/stage-debug.md`（lab 定制）

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用理论计数对照每线程循环边界，区分工作量错误与锁实现错误。
```

**服务端路由**：requested=debug → tutorState.stage=debug（gate=missing-debug-hypothesis）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你的判断是可检验的：若每线程循环次数为 `N`、线程数为 `T`，无丢失更新时最终计数应为 `T×N`，这与锁实现错误的现象不同。

请贴出 `mutex_test` 中线程数、循环上界，以及实际输出的最终计数；并说明你的可证伪假设：例如“理论值与实际值相差固定倍数，因为某个循环边界少执行”。观察什么：每个线程实际完成次数和最终共享计数。

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

- 候选：lexical=3，vector=24，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000009 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.5 死锁：发现它，而不是陪它挂着 | student-safe | lab8 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000012 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/任务一：跑通 lab8（必做） | student-safe | lab8 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000010 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.6 测例在验证什么 | student-safe | lab8 | 0.0234 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000018 | OS Lab 结构化概念与检查点 | 互斥锁与共享计数不变量 | student-safe | lab8 | 0.0226 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000015 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/提交清单（自查） | student-safe | lab8 | 0.0219 |

---

## 复盘阶段 · lab8-reflect

**学生消息**：复盘：我判断了锁保护临界区，AI 提醒了工作量边界，我用重复运行验证了

**阶段提示词源**：`tutor/prompts/lab8/stage-reflect.md`（lab 定制）

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出，并说明为何计数错误不一定来自锁实现。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：requested=reflect → tutorState.stage=reflect（gate=missing-reflection-evidence）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已区分“锁保护临界区”和“工作量边界”，但还缺少可核对的证据链接。请补充一次具体证据：重复运行的输出片段（至少最终计数及相关 pass）或对应代码路径，并说明它如何支持“计数错误不一定来自锁实现”这一判断？

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

- 候选：lexical=1，vector=21，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000018 | OS Lab 结构化概念与检查点 | 互斥锁与共享计数不变量 | student-safe | lab8 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000010 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.6 测例在验证什么 | student-safe | lab8 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000007 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.3 和 Lab5 自旋锁并存，而不是互相取代 | student-safe | lab8 | 0.0229 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000000 | OS Lab 本地实验手册 | 实验 8：线程与同步 | student-safe | lab8 | 0.0222 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000076 | RISC-V Reader 中文版 | 10.3 机器模式下的异常处理 | student-safe | global,lab2,lab5 | 0.0188 |

---

## 迁移阶段 · lab8-transfer

**学生消息**：如果锁改成非阻塞自旋，之前的结论还成立吗

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

部分成立：互斥性仍应成立，但“拿不到锁就进入 `Blocked`、让出 CPU、由唤醒队列恢复”的结论不再成立；等待代价也从阻塞切换变成持续占用 CPU。

迁移问题：若持锁线程被调度器暂停，而另一个线程在自旋，单核 RISC-V 下你预测系统会发生什么？请先指出 `processor.rs` 中的调度路径，并说明需要观察哪些 QEMU 输出或线程状态来验证。

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

- 候选：lexical=4，vector=17，eligible=107，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000072 | RISC-V Reader 中文版 | 10.2 简单嵌入式系统的机器模式 | student-safe | global,lab2,lab5 | 0.0342 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000078 | RISC-V Reader 中文版 | 10.5 现代操作系统的监管者模式 | student-safe | global,lab5 | 0.0340 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000010 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.6 测例在验证什么 | student-safe | lab8 | 0.0229 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab8:000006 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.2 阻塞：拿不到就让出 CPU | student-safe | lab8 | 0.0211 |

---
