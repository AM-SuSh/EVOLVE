# Lab8 线程与同步 Prompt 分阶段评测

- 评测标签：`current-intent-legacy-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab8-orient

**学生消息**：lab8 的线程和锁我不会，阻塞和自旋到底差在哪，教教我

**阶段提示词源**：`tutor/prompts/lab8/stage-orient.md`

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“同一进程内线程共享什么、独占什么，exit 结束的是线程还是进程”。不要进入具体 patch。
```

**服务端路由**：storedStage=orient，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab8 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=10，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000001 | OS Lab 本地实验手册 | 实验 8：线程与同步/零、开始之前 | student-safe | lab8 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000002 | OS Lab 本地实验手册 | 实验 8：线程与同步/零、开始之前/环境准备（与 Lab6/7 相同） | student-safe | lab8 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000016 | OS Lab 本地实验手册 | 实验 8：线程与同步/四、验证 | student-safe | lab8 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000012 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/任务一：跑通 lab8（必做） | student-safe | lab8 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000015 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/提交清单（自查） | student-safe | lab8 | 0.0222 |

---

## 阅读阶段 · lab8-read

**学生消息**：我认为等待队列是关键，但没想清楚它和就绪队列的关系

**阶段提示词源**：`tutor/prompts/lab8/stage-read.md`

**阶段提示词正文**：

```text
# 阅读阶段

沿 `thread_create -> alloc_thread_user_stack -> add_thread -> enqueue_ready -> run_next_thread` 与 `mutex_lock -> MutexBlocking::lock -> Blocked -> unlock -> mark_mutex_handoff -> re_enque` 追踪线程与同步路径。优先让学生区分 TCB 状态、wait queue 阻塞唤醒与死锁检测短路，并定位证据所在文件。
```

**服务端路由**：storedStage=read，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab8 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=24，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000007 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.3 和 Lab5 自旋锁并存，而不是互相取代 | student-safe | lab8 | 0.0226 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000207 | rCore Tutorial Guide | 条件变量机制/实现条件变量/实现 condvar 系统调用 | student-safe | global,lab8 | 0.0224 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000055 | LearningOS 操作系统课程讲义源文件 | 第十二讲 同步与互斥/第三节 管程与条件变量 | student-safe | global,lab5,lab8 | 0.0223 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000017 | OS Lab 结构化概念与检查点 | 线程状态与阻塞唤醒 | student-safe | lab8 | 0.0222 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000201 | rCore Tutorial Guide | 信号量机制/实现信号量/实现 semaphore 系统调用 | student-safe | global,lab8 | 0.0221 |

---

## 验证阶段 · lab8-run

**学生消息**：make test-lab8 我跑完了，输出如下

**阶段提示词源**：`tutor/prompts/lab8/stage-run.md`

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`threads_test pass`、`threads_arg_test pass`、`mutex_test pass`、`condvar_test pass`、`pipetest passed!`、`deadlock test mutex 1 OK!`、`deadlock test semaphore 1 OK!`、`pipe_test pass`、全部进程退出），再运行 `make test-lab8`。只比较预测与实际差异，帮助判断问题属于线程调度、阻塞唤醒还是死锁检测。
```

**服务端路由**：storedStage=run，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab8 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=14，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000016 | OS Lab 本地实验手册 | 实验 8：线程与同步/四、验证 | student-safe | lab8 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000015 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/提交清单（自查） | student-safe | lab8 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000012 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/任务一：跑通 lab8（必做） | student-safe | lab8 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000002 | OS Lab 本地实验手册 | 实验 8：线程与同步/零、开始之前/环境准备（与 Lab6/7 相同） | student-safe | lab8 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000001 | OS Lab 本地实验手册 | 实验 8：线程与同步/零、开始之前 | student-safe | lab8 | 0.0224 |

---

## 排错阶段 · lab8-debug

**学生消息**：mutex_test 的计数不对，我猜是循环边界的问题

**阶段提示词源**：`tutor/prompts/lab8/stage-debug.md`

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用理论计数对照每线程循环边界，区分工作量错误与锁实现错误。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab8 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=3，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000010 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.6 测例在验证什么 | student-safe | lab8 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000012 | OS Lab 本地实验手册 | 实验 8：线程与同步/三、实验任务/任务一：跑通 lab8（必做） | student-safe | lab8 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab8:000009 | OS Lab 本地实验手册 | 实验 8：线程与同步/二、背景知识/2.5 死锁：发现它，而不是陪它挂着 | student-safe | lab8 | 0.0229 |

---

## 复盘阶段 · lab8-reflect

**学生消息**：复盘：我判断了锁保护临界区，AI 提醒了工作量边界，我用重复运行验证了

**阶段提示词源**：`tutor/prompts/lab8/stage-reflect.md`

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出，并说明为何计数错误不一定来自锁实现。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：storedStage=reflect，intent=reflection（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

复盘时要把结论和证据一一对应。先选 Lab8 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。

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

- 候选：lexical=5，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000018 | OS Lab 结构化概念与检查点 | 互斥锁与共享计数不变量 | student-safe | lab8 | 0.0234 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000211 | 操作系统导论 OSTEP 中文核心章节 | 28.2 Pthread 锁 | student-safe | global,lab5,lab8 | 0.0223 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000313 | 深入理解计算机系统中文电子书 | 12.6 使用线程提高并行性 | student-safe | global,lab5,lab8 | 0.0211 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000314 | 深入理解计算机系统中文电子书 | 12.6 使用线程提高并行性 | student-safe | global,lab5,lab8 | 0.0208 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000321 | 深入理解计算机系统中文电子书 | 12.7 其他并发问题/12.7.1 线程安全 | student-safe | global,lab5,lab8 | 0.0206 |

---

## 迁移阶段 · lab8-transfer

**学生消息**：如果锁改成非阻塞自旋，之前的结论还成立吗

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

- 候选：lexical=38，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000226 | 操作系统导论 OSTEP 中文核心章节 | 28.14 使用队列：休眠替代自旋 | student-safe | global,lab5,lab8 | 0.0226 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000055 | LearningOS 操作系统课程讲义源文件 | 第十二讲 同步与互斥/第三节 管程与条件变量 | student-safe | global,lab5,lab8 | 0.0225 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000204 | rCore Tutorial Guide | 条件变量机制/条件变量的基本思路 | student-safe | global,lab8 | 0.0212 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000205 | 操作系统导论 OSTEP 中文核心章节 | 27.4 条件变量 | student-safe | global,lab8 | 0.0209 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000223 | 操作系统导论 OSTEP 中文核心章节 | 28.11 获取并增加 | student-safe | global,lab5,lab8 | 0.0207 |

---
