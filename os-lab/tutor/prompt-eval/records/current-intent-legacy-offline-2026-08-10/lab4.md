# Lab4 进程管理 Prompt 分阶段评测

- 评测标签：`current-intent-legacy-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab4-orient

**学生消息**：lab4 的 fork 我完全不会写，给我讲讲进程怎么创建

**阶段提示词源**：`tutor/prompts/lab4/stage-orient.md`

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“fork 与 exec 各改变进程的哪些身份，哪些身份保持不变”。不要进入具体 patch。
```

**服务端路由**：storedStage=orient，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab4 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000011 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/任务一：跑通 lab4 | student-safe | lab4 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000015 | OS Lab 本地实验手册 | 实验 4：进程管理/四、验证 | student-safe | lab4 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000004 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.1 任务 vs 进程 | student-safe | lab4 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000014 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/提交清单（自查） | student-safe | lab4 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000003 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识 | student-safe | lab4 | 0.0224 |

---

## 阅读阶段 · lab4-read

**学生消息**：我认为 fork 的关键是复制上下文，但没想清楚子进程怎么返回 0

**阶段提示词源**：`tutor/prompts/lab4/stage-read.md`

**阶段提示词正文**：

```text
# 阅读阶段

沿 `sys_fork -> fork_user_space -> spawn -> sys_execve -> replace_user_space -> sys_wait4` 追踪进程生命周期。优先让学生区分 PCB、地址空间、TrapContext 与调度状态，并定位证据所在文件。
```

**服务端路由**：storedStage=read，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab4 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000120 | rCore Tutorial Guide | 进程管理机制的设计实现/进程的生成机制/fork 系统调用的实现 | student-safe | global,lab4 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000008 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.5 进程控制块 PCB | student-safe | lab4 | 0.0217 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000114 | 深入理解计算机系统中文电子书 | 8.4 进程控制/8.4.5 加载并运行程序/旁注 - 程序与进程 | student-safe | global,lab4 | 0.0208 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000095 | 深入理解计算机系统中文电子书 | 8.2 进程 | student-safe | global,lab2,lab4,lab7 | 0.0206 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000096 | 深入理解计算机系统中文电子书 | 8.2 进程/8.2.1 逻辑控制流 | student-safe | global,lab2,lab4,lab7 | 0.0197 |

---

## 验证阶段 · lab4-run

**学生消息**：lab4 的验证我跑完了，输出如下

**阶段提示词源**：`tutor/prompts/lab4/stage-run.md`

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 `fork_test` 关键输出（parent / child / wait / `fork_test pass` / 全部退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于 fork 返回值、exec 替换还是 wait 回收。
```

**服务端路由**：storedStage=run，intent=verification（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 cargo run -p kernel --features lab4 --release，只比较对应断言或 Trace。

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

- 候选：lexical=8，vector=0，eligible=1237，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000015 | OS Lab 本地实验手册 | 实验 4：进程管理/四、验证 | student-safe | lab4 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000011 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/任务一：跑通 lab4 | student-safe | lab4 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000003 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识 | student-safe | lab4 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000004 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.1 任务 vs 进程 | student-safe | lab4 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000014 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/提交清单（自查） | student-safe | lab4 | 0.0224 |

---

## 排错阶段 · lab4-debug

**学生消息**：子进程输出错了，我猜是返回值设置的问题

**阶段提示词源**：`tutor/prompts/lab4/stage-debug.md`

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用最小 fork/wait 测试区分返回值、退出码与资源回收。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab4 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000111 | 深入理解计算机系统中文电子书 | 8.4 进程控制/8.4.4 让进程休眠 | student-safe | global,lab2,lab4,lab7 | 0.0213 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000104 | 深入理解计算机系统中文电子书 | 8.4 进程控制/8.4.2 创建和终止进程 | student-safe | global,lab4 | 0.0204 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000125 | 深入理解计算机系统中文电子书 | 8.5 信号/8.5.3 接收信号 | student-safe | global,lab2,lab4,lab7 | 0.0195 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000080 | rCore Tutorial Guide | 内核与应用的地址空间/内核地址空间 | student-safe | global,lab3 | 0.0189 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000226 | 操作系统导论 OSTEP 中文核心章节 | 28.14 使用队列：休眠替代自旋 | student-safe | global,lab5,lab8 | 0.0188 |

---

## 复盘阶段 · lab4-reflect

**学生消息**：复盘：我判断了 fork 复制什么，AI 提醒了返回两次，我用 fork_test 验证了

**阶段提示词源**：`tutor/prompts/lab4/stage-reflect.md`

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：storedStage=reflect，intent=reflection（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

复盘时要把结论和证据一一对应。先选 Lab4 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。

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
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000011 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/任务一：跑通 lab4 | student-safe | lab4 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000014 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/提交清单（自查） | student-safe | lab4 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000015 | OS Lab 本地实验手册 | 实验 4：进程管理/四、验证 | student-safe | lab4 | 0.0229 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000009 | OS Lab 结构化概念与检查点 | fork 与 waitpid 生命周期 | student-safe | lab4 | 0.0222 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000158 | LearningOS 操作系统课程讲义源文件 | 第七讲 进程管理与单处理器调度/第一节 进程管理/3. 关于Fork()的思考/Fork()的开销？/重新思考fork | student-safe | global,lab2,lab4 | 0.0220 |

---

## 迁移阶段 · lab4-transfer

**学生消息**：如果 exec 后不替换地址空间，之前的结论还成立吗

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
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000015 | 操作系统导论 OSTEP 中文核心章节 | 5.4 为什么这样设计 API | student-safe | global,lab4 | 0.0226 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000010 | OS Lab 结构化概念与检查点 | exec 地址空间替换 | student-safe | lab4 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab4:000006 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.3 exec | student-safe | lab4 | 0.0219 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000014 | 操作系统导论 OSTEP 中文核心章节 | 5.3 最后是 exec()系统调用 | student-safe | global,lab4 | 0.0205 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000101 | rCore Tutorial Guide | 与进程有关的重要系统调用/重要系统调用/exec 系统调用 | student-safe | global,lab4 | 0.0199 |

---
