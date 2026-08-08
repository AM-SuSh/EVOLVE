# Lab4 进程管理 Prompt 分阶段评测

- 评测标签：`offline-baseline`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab4-orient

**学生消息**：lab4 的 fork 我完全不会写，给我讲讲进程怎么创建

**阶段提示词源**：`tutor/prompts/lab4/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“fork 与 exec 各改变进程的哪些身份，哪些身份保持不变”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先不急着写实现。围绕 Lab4，写下你认为最关键的一个系统边界，以及这个判断的依据；我再帮你把它拆成可验证的小问题。

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

- 候选：lexical=11，vector=36，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000014 | OS Lab 本地实验手册 | 实验 4：进程管理/四、验证命令 | student-safe | lab4 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000004 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.1 任务 vs 进程 | student-safe | lab4 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000003 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识 | student-safe | lab4 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000013 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/任务三：动手修改 | student-safe | lab4 | 0.0373 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000011 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/任务一：跑通内核 | student-safe | lab4 | 0.0371 |

---

## 阅读阶段 · lab4-read

**学生消息**：我认为 fork 的关键是复制上下文，但没想清楚子进程怎么返回 0

**阶段提示词源**：`tutor/prompts/lab4/stage-read.md`（lab 定制）

**阶段提示词正文**：

```text
# 阅读阶段

沿 `sys_fork -> fork_user_space -> spawn -> sys_execve -> replace_user_space -> sys_wait4` 追踪进程生命周期。优先让学生区分 PCB、地址空间、TrapContext 与调度状态，并定位证据所在文件。
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

- 候选：lexical=18，vector=26，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000007 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.4 进程控制块 PCB | student-safe | lab4 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000005 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.2 fork | student-safe | lab4 | 0.0390 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000009 | OS Lab 结构化概念与检查点 | fork 与 waitpid 生命周期 | student-safe | lab4 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000004 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.1 任务 vs 进程 | student-safe | lab4 | 0.0381 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000002 | OS Lab 本地实验手册 | 实验 4：进程管理/一、问题场景 | student-safe | lab4 | 0.0369 |

---

## 验证阶段 · lab4-run

**学生消息**：lab4 的验证我跑完了，输出如下

**阶段提示词源**：`tutor/prompts/lab4/stage-run.md`（lab 定制）

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 `fork_test` 关键输出（parent / child / wait / `fork_test pass` / 全部退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于 fork 返回值、exec 替换还是 wait 回收。
```

**服务端路由**：requested=run → tutorState.stage=run（gate=missing-trusted-run）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先写下你预期会看到的三个关键输出，再运行 cargo run -p kernel --features lab4 --release。完成后只贴和预期不同的部分，我们用差异定位下一步。

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

- 候选：lexical=7，vector=13，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000011 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/任务一：跑通内核 | student-safe | lab4 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000001 | OS Lab 本地实验手册 | 实验 4：进程管理/零、开始之前 | student-safe | lab4 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000002 | OS Lab 本地实验手册 | 实验 4：进程管理/一、问题场景 | student-safe | lab4 | 0.0358 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000014 | OS Lab 本地实验手册 | 实验 4：进程管理/四、验证命令 | student-safe | lab4 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000013 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/任务三：动手修改 | student-safe | lab4 | 0.0231 |

---

## 排错阶段 · lab4-debug

**学生消息**：子进程输出错了，我猜是返回值设置的问题

**阶段提示词源**：`tutor/prompts/lab4/stage-debug.md`（lab 定制）

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用最小 fork/wait 测试区分返回值、退出码与资源回收。
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

- 候选：lexical=6，vector=34，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000011 | RISC-V Reader 中文版 | 1.5 结束语 | student-safe | global | 0.0307 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000003 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识 | student-safe | lab4 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000014 | OS Lab 本地实验手册 | 实验 4：进程管理/四、验证命令 | student-safe | lab4 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000004 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.1 任务 vs 进程 | student-safe | lab4 | 0.0229 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000005 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.2 fork | student-safe | lab4 | 0.0226 |

---

## 复盘阶段 · lab4-reflect

**学生消息**：复盘：我判断了 fork 复制什么，AI 提醒了返回两次，我用 fork_test 验证了

**阶段提示词源**：`tutor/prompts/lab4/stage-reflect.md`（lab 定制）

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：requested=reflect → tutorState.stage=reflect（gate=missing-reflection-evidence）

**模式/模型**：offline / offline-tutor

**AI 回复**：

用三句话收束 Lab4：你能独立解释什么？AI 提醒了哪一个关键点？你用哪条运行结果或代码路径验证了它？

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

- 候选：lexical=10，vector=10，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000002 | OS Lab 本地实验手册 | 实验 4：进程管理/一、问题场景 | student-safe | lab4 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000013 | OS Lab 本地实验手册 | 实验 4：进程管理/三、实验任务/任务三：动手修改 | student-safe | lab4 | 0.0383 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000014 | OS Lab 本地实验手册 | 实验 4：进程管理/四、验证命令 | student-safe | lab4 | 0.0381 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000004 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.1 任务 vs 进程 | student-safe | lab4 | 0.0378 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000009 | OS Lab 结构化概念与检查点 | fork 与 waitpid 生命周期 | student-safe | lab4 | 0.0378 |

---

## 迁移阶段 · lab4-transfer

**学生消息**：如果 exec 后不替换地址空间，之前的结论还成立吗

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

改变一个关键条件后，Lab4 的原结论还成立吗？先写预测，再说明你会用什么代码路径或运行证据验证。

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

- 候选：lexical=12，vector=20，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000010 | OS Lab 结构化概念与检查点 | exec 地址空间替换 | student-safe | lab4 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000006 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.3 exec | student-safe | lab4 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000009 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.6 把 fork、exec、exit、wait 连成进程生命周期 | student-safe | lab4 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000002 | OS Lab 本地实验手册 | 实验 4：进程管理/一、问题场景 | student-safe | lab4 | 0.0378 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab4:000007 | OS Lab 本地实验手册 | 实验 4：进程管理/二、背景知识/2.4 进程控制块 PCB | student-safe | lab4 | 0.0373 |

---
