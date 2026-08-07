# Lab4 进程管理 Prompt 分阶段评测

- 评测标签：`remote-stu`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`https://you.loveme.space/v1`

## 定界阶段 · lab4-orient

**学生消息**：lab4 的 fork 我完全不会写，给我讲讲进程怎么创建

**阶段提示词源**：`tutor/prompts/lab4/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“fork 与 exec 各改变进程的哪些身份，哪些身份保持不变”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

“不会写”先改成一个机制问题：`fork` 创建的是新进程，但父子进程不一定所有资源都独立。

先给出你的初始判断：**`fork` 与 `exec` 各自改变进程的哪些身份，哪些身份保持不变？**可从 PID、地址空间、寄存器上下文、程序代码四项考虑。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已经抓到关键：复制上下文后，父子会从同一条返回路径继续。现在请查看 `kernel/src/process.rs` 的 `sys_fork`，以及 `kernel/src/trap.rs` 中系统调用返回前对 `TrapContext` 的处理。

问题：子进程的 `fork()` 返回值最终对应哪个寄存器字段？请贴出设置该字段的代码行，并说明父进程的该字段在哪里设置或返回。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

请贴出本次 `cargo run -p kernel --features lab4 --release` 的完整关键输出，至少包括：

`I am parent`、`I am child`、`waited pid done`、`fork_test pass`、`All processes exited.`

另外先预测一下它们的出现顺序；我们只比较预测与实际差异。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

“返回值设置”是可检验的方向，但要区分 `fork` 返回值与 `wait`/退出码。请给出一次运行的精确输出，并补充：你的假设是“子进程 `TrapContext.a0` 没被设为 0”吗？最小实验是在 `fork_test` 中分别打印父子分支拿到的 `fork()` 返回值；观察子分支是否为 `0`，以及对应的 PID 和退出码。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已区分了“独立判断”和“AI 提醒”，但“用 `fork_test` 验证”还缺少可核查证据。请补充一条完整复盘记录：你的判断是什么；AI 的关键提醒是什么；对应查看了哪个代码路径或运行输出（如 `fork_test` 中父子分支及实际出现的 `I am parent`、`I am child`）？

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你的判断应拆开：`PID 不变` 可能仍成立，但“旧程序不会继续执行、旧用户页不再被引用”未必成立；这取决于内核软件是否仍重建映射与 `TrapContext`，硬件不会自动替换地址空间。

迁移问题：若 `exec` 只重置 `sepc`/栈，却保留旧地址空间，预测 `exec_test` 中哪些输出会出现？请沿 `process.rs` 的 exec 路径检查，并说明需要观察 QEMU 的哪些输出或页表变化来验证。

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
