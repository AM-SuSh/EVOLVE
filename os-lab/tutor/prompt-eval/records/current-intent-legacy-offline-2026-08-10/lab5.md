# Lab5 文件系统与并发 Prompt 分阶段评测

- 评测标签：`current-intent-legacy-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab5-orient

**学生消息**：lab5 的文件系统我不会，fd 和管道到底怎么实现，教教我

**阶段提示词源**：`tutor/prompts/lab5/stage-orient.md`

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“fd 槽位里记下什么，才能让同一套 open/read/write/close 分别服务内嵌文件和管道两端”。不要进入具体 patch。
```

**服务端路由**：storedStage=orient，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab5 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=4，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000011 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务一：跑通 lab5 | student-safe | lab5 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000015 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/四、验证 | student-safe | lab5 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000014 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/提交清单（自查） | student-safe | lab5 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000000 | OS Lab 本地实验手册 | 实验 5：文件系统与并发 | student-safe | lab5 | 0.0226 |

---

## 阅读阶段 · lab5-read

**学生消息**：我认为 fd 表是关键，但没想清楚普通文件和管道为什么能共用一套读写接口

**阶段提示词源**：`tutor/prompts/lab5/stage-read.md`

**阶段提示词正文**：

```text
# 阅读阶段

沿 `sys_openat -> EmbeddedFs::open -> FdTable::alloc -> sys_read -> FdType 分发 -> read_at -> offset 推进` 与 `sys_pipe -> alloc_pipe_fds -> pipe_add_refs -> fork 继承 -> pipe_read/pipe_write -> 引用计数` 追踪对象生命周期。优先让学生区分表项类型、文件偏移和管道环形缓冲，并定位证据所在文件。
```

**服务端路由**：storedStage=read，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab5 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=40，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000014 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/提交清单（自查） | student-safe | lab5 | 0.0234 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000006 | LearningOS 操作系统课程讲义源文件 | 第一讲 操作系统概述 | student-safe | global,lab5 | 0.0213 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000006 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.3 进程之间怎样传一句话：管道 | student-safe | lab5 | 0.0213 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000167 | rCore Tutorial Guide | 管道/基于文件的管道/管道读写 | student-safe | global,lab5,lab7 | 0.0212 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000208 | 操作系统导论 OSTEP 中文核心章节 | 27.5 编译和运行 | student-safe | global,lab5,lab8 | 0.0209 |

---

## 验证阶段 · lab5-run

**学生消息**：cargo run -p kernel --features lab5 --release 我跑完了，输出贴出来

**阶段提示词源**：`tutor/prompts/lab5/stage-run.md`

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`Hello from testfile!`、`fs_test pass`、`pipe says hi`、`pipe_test pass`、全部进程退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于名字查找、fd 分配、offset 推进还是管道同步。
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
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：64/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000015 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/四、验证 | student-safe | lab5 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000014 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/提交清单（自查） | student-safe | lab5 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000011 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务一：跑通 lab5 | student-safe | lab5 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000008 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.5 自旋锁：最短路上的互斥 | student-safe | lab5 | 0.0205 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000075 | LearningOS 操作系统课程讲义源文件 | 第一章：rCore-Tutorial ch1 内核架构分析 | student-safe | global,lab1 | 0.0190 |

---

## 排错阶段 · lab5-debug

**学生消息**：fs_test 打印 open testfile failed，我猜是名字查找的问题

**阶段提示词源**：`tutor/prompts/lab5/stage-debug.md`

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。

对 fill/debug 工作区：优先用「`fs_test` 是否仍过、`pipe_test` 是否失败」区分「内嵌文件路径」与「fork 后管道引用计数」；再引导到 `clone_fd_table` / `bump_inherited_pipe_refs`，不要先改用户测例关端顺序。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab5 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=40，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000011 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务一：跑通 lab5 | student-safe | lab5 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000005 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.2 本实验的「文件」从哪里来 | student-safe | lab5 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000015 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/四、验证 | student-safe | lab5 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000014 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/提交清单（自查） | student-safe | lab5 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000004 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/二、背景知识/2.1 从「读一份数据」到文件描述符 | student-safe | lab5 | 0.0224 |

---

## 复盘阶段 · lab5-reflect

**学生消息**：复盘：我判断了 fd 只是索引，AI 提醒了引用计数，我用 pipe_test 验证了

**阶段提示词源**：`tutor/prompts/lab5/stage-reflect.md`

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出，并说明 fd 生命周期与管道引用计数如何由证据支撑。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：storedStage=reflect，intent=reflection（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

复盘时要把结论和证据一一对应。先选 Lab5 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。

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

- 候选：lexical=4，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000011 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/任务一：跑通 lab5 | student-safe | lab5 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000015 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/四、验证 | student-safe | lab5 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000014 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/三、实验任务/提交清单（自查） | student-safe | lab5 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab5:000016 | OS Lab 本地实验手册 | 实验 5：文件系统与并发/五、AI 提问模板 | student-safe | lab5 | 0.0226 |

---

## 迁移阶段 · lab5-transfer

**学生消息**：如果把管道换成消息队列，之前的判断还成立吗

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

- 候选：lexical=40，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:riscv-reader-zh-local:v7:790f163c7291:chunk:0000078 | RISC-V Reader 中文版 | 10.5 现代操作系统的监管者模式 | student-safe | global,lab5 | 0.0214 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000201 | LearningOS 操作系统课程讲义源文件 | 操作系统知识点 | student-safe | global,lab2,lab5,lab8 | 0.0205 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000011 | LearningOS 操作系统课程讲义源文件 | 第十讲 进程间通信/第一节 进程间通信(IPC)概述/3. 消息队列(Message Queue)/消息队列控制：查询队列状态、修改权限、删除队列等 | student-safe | global,lab7 | 0.0198 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000008 | LearningOS 操作系统课程讲义源文件 | 第十讲 进程间通信/第一节 进程间通信(IPC)概述 | student-safe | global,lab7 | 0.0193 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000223 | 操作系统导论 OSTEP 中文核心章节 | 28.11 获取并增加 | student-safe | global,lab5,lab8 | 0.0190 |

---
