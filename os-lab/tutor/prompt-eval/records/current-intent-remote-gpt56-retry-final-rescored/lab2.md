# Lab2 Trap 与任务切换 Prompt 意图评测

- 评测标签：`eval-2026-08-10T08-18-11`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`http://127.0.0.1:9/v1`

## concept · concept-sepc-orient

**学生消息**：sepc 在 trap 返回中起什么作用？

**意图策略源**：`tutor/prompts/strategies/concept.md`

**意图策略正文**：

```text
# 本轮策略：概念理解

先用必要的最少解释回应学生所问的概念，明确关键边界或因果关系。若学生判断有误，直接指出具体错误及理由；随后只追问一个能暴露其理解依据的问题。
```

**服务端路由**：storedStage=orient，intent=concept（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

`sepc` 是硬件保存的“返回地址”：发生 Trap 时，RISC-V 将触发 Trap 的指令地址写入它；`sret` 会跳转到恢复后的 `sepc`，因此决定用户程序从哪里继续执行。对 `ecall`，内核必须把保存到 `TrapContext` 的 `sepc` 加 4，否则 `sret` 会再次执行同一条 `ecall`，形成循环。硬件负责写入/使用 CSR，内核负责修改并恢复它。citekb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000126 citekb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005

你可以检查 `kernel/src/trap.rs`：`advance_sepc()` 修改的是 CSR 本身，还是内核栈上的 `TrapContext.sepc`？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.2 上下文保存与恢复 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000003 | OS Lab 结构化概念与检查点 | Trap 上下文保存与恢复 | student-safe | lab2 | 0.0224 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000037 | rCore Tutorial Guide | 实现特权级的切换/Trap 管理/Trap 分发与处理 | student-safe | global,lab2 | 0.0221 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000126 | LearningOS 操作系统课程讲义源文件 | 第三讲 基于特权级的隔离与批处理/第三节 实践：批处理操作系统/6. 内核程序设计/6.2 特权级切换 | student-safe | global,lab2 | 0.0220 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000033 | rCore Tutorial Guide | 实现特权级的切换/用户栈与内核栈 | student-safe | global,lab2 | 0.0219 |

---

## concept · concept-sepc-debug

**学生消息**：sepc 在 trap 返回中起什么作用？

**意图策略源**：`tutor/prompts/strategies/concept.md`

**意图策略正文**：

```text
# 本轮策略：概念理解

先用必要的最少解释回应学生所问的概念，明确关键边界或因果关系。若学生判断有误，直接指出具体错误及理由；随后只追问一个能暴露其理解依据的问题。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

`sepc` 是硬件保存的“返回地址”：Trap 进入时记录触发 Trap 的指令地址，`sret` 时 CPU 从它恢复执行。对 `ecall` 而言，`sepc` 指向 `ecall` 本身，因此内核软件必须把保存于 `TrapContext` 的 `sepc` 加 4，否则返回后会再次执行同一条 `ecall`。citekb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000126 citekb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005

你可以检查 `trap_handler` 中 `advance_sepc()` 修改的是 CSR，还是内核栈上的 `TrapContext.sepc`？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.2 上下文保存与恢复 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000003 | OS Lab 结构化概念与检查点 | Trap 上下文保存与恢复 | student-safe | lab2 | 0.0224 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000037 | rCore Tutorial Guide | 实现特权级的切换/Trap 管理/Trap 分发与处理 | student-safe | global,lab2 | 0.0221 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000126 | LearningOS 操作系统课程讲义源文件 | 第三讲 基于特权级的隔离与批处理/第三节 实践：批处理操作系统/6. 内核程序设计/6.2 特权级切换 | student-safe | global,lab2 | 0.0220 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000033 | rCore Tutorial Guide | 实现特权级的切换/用户栈与内核栈 | student-safe | global,lab2 | 0.0219 |

---

## concept · concept-sepc-reflect

**学生消息**：sepc 在 trap 返回中起什么作用？

**意图策略源**：`tutor/prompts/strategies/concept.md`

**意图策略正文**：

```text
# 本轮策略：概念理解

先用必要的最少解释回应学生所问的概念，明确关键边界或因果关系。若学生判断有误，直接指出具体错误及理由；随后只追问一个能暴露其理解依据的问题。
```

**服务端路由**：storedStage=reflect，intent=concept（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

`sepc` 是硬件在进入 Trap 时写入的“异常发生指令地址”；执行 `sret` 时，硬件把 PC 恢复为 `sepc`，因此它决定返回后从哪里继续执行。对 `ecall` 而言，`sepc` 指向 `ecall` 本身，内核必须在保存的 `TrapContext.sepc` 上加 4，否则 `sret` 会再次执行同一条 `ecall`，形成循环。citekb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：75/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.2 上下文保存与恢复 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000003 | OS Lab 结构化概念与检查点 | Trap 上下文保存与恢复 | student-safe | lab2 | 0.0224 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000037 | rCore Tutorial Guide | 实现特权级的切换/Trap 管理/Trap 分发与处理 | student-safe | global,lab2 | 0.0221 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000126 | LearningOS 操作系统课程讲义源文件 | 第三讲 基于特权级的隔离与批处理/第三节 实践：批处理操作系统/6. 内核程序设计/6.2 特权级切换 | student-safe | global,lab2 | 0.0220 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000033 | rCore Tutorial Guide | 实现特权级的切换/用户栈与内核栈 | student-safe | global,lab2 | 0.0219 |

---

## verification · verification-trace-orient

**学生消息**：怎样验证 task_switch 的 trace 确实说明发生了任务切换？

**意图策略源**：`tutor/prompts/strategies/verification.md`

**意图策略正文**：

```text
# 本轮策略：实验验证

先说明什么证据能够支持或否定当前判断，再给一个最小验证步骤，明确预期差异与观察位置。只能引用服务端提供的可信运行、诊断、Trace 或本轮检索证据。
```

**服务端路由**：storedStage=orient，intent=verification（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

仅有一条 `task_switch` 日志不足以证明切换；可验证的证据是：日志中的 `current` 与 `next` 任务不同，并且切换后能看到 `next` 的用户输出继续执行，随后再次切回。任务切换本质上是在内核 Trap 控制流之间保存/恢复上下文【kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000045】。

最小验证：运行 `cargo run -p kernel --features lab2 --release`，观察 `task_switch` 前后的任务编号及 `Yield round` 输出；预期是不同任务交替、恰好出现 5 次 Yield，且最终出现全部退出。当前可信运行的 `traceCount` 为 0，因此尚无 trace 可据此下结论。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：100/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000044 | rCore Tutorial Guide | 任务切换 | student-safe | global,lab2 | 0.0224 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000041 | rCore Tutorial Guide | 引言/本章导读 | student-safe | global,lab2 | 0.0221 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000045 | rCore Tutorial Guide | 任务切换/任务切换的设计与实现 | student-safe | global,lab2 | 0.0209 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000002 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/一、问题场景 | student-safe | lab2 | 0.0205 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000157 | LearningOS 操作系统课程讲义源文件 | 第七讲 进程管理与单处理器调度/第一节 进程管理 | student-safe | global,lab2 | 0.0196 |

---

## verification · verification-trace-run

**学生消息**：怎样验证 task_switch 的 trace 确实说明发生了任务切换？

**意图策略源**：`tutor/prompts/strategies/verification.md`

**意图策略正文**：

```text
# 本轮策略：实验验证

先说明什么证据能够支持或否定当前判断，再给一个最小验证步骤，明确预期差异与观察位置。只能引用服务端提供的可信运行、诊断、Trace 或本轮检索证据。
```

**服务端路由**：storedStage=run，intent=verification（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

仅凭出现 `task_switch` 一行不能证明切换；有力证据是：切换前后 `current/next task` 不同，随后输出从另一任务继续，并最终满足 `Yield round` 恰好 5 次。任务切换发生在内核 Trap 流之间，恢复后从保存的 `__switch` 返回点继续执行。citekb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000045

最小验证：运行 `cargo run -p kernel --features lab2 --release`，观察每条 `task_switch` 的前后任务 ID及其后的用户输出；本轮可信运行的 `traceCount=0`，因此目前没有可引用的 trace 证据。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：100/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000044 | rCore Tutorial Guide | 任务切换 | student-safe | global,lab2 | 0.0224 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000041 | rCore Tutorial Guide | 引言/本章导读 | student-safe | global,lab2 | 0.0221 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000045 | rCore Tutorial Guide | 任务切换/任务切换的设计与实现 | student-safe | global,lab2 | 0.0209 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000002 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/一、问题场景 | student-safe | lab2 | 0.0205 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000157 | LearningOS 操作系统课程讲义源文件 | 第七讲 进程管理与单处理器调度/第一节 进程管理 | student-safe | global,lab2 | 0.0196 |

---

## verification · verification-trace-reflect

**学生消息**：怎样验证 task_switch 的 trace 确实说明发生了任务切换？

**意图策略源**：`tutor/prompts/strategies/verification.md`

**意图策略正文**：

```text
# 本轮策略：实验验证

先说明什么证据能够支持或否定当前判断，再给一个最小验证步骤，明确预期差异与观察位置。只能引用服务端提供的可信运行、诊断、Trace 或本轮检索证据。
```

**服务端路由**：storedStage=reflect，intent=verification（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

仅有一条 `task_switch` 日志不足以证明切换完成；有力证据是同一次记录中 `current != next`，并且后续输出显示 `next` 的控制流继续执行，之后旧任务还能从保存位置恢复。任务切换应保持各任务寄存器、栈等上下文一致。citekb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000044

最小验证：运行 `cargo run -p kernel --features lab2 --release`，观察每条 `task_switch` 的前后任务 ID，并核对 `Yield round` 是否恰好 5 次；当前可信运行 `traceCount=0`，所以目前没有可引用的 trace 结论。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：100/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000044 | rCore Tutorial Guide | 任务切换 | student-safe | global,lab2 | 0.0224 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000041 | rCore Tutorial Guide | 引言/本章导读 | student-safe | global,lab2 | 0.0221 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000045 | rCore Tutorial Guide | 任务切换/任务切换的设计与实现 | student-safe | global,lab2 | 0.0209 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000002 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/一、问题场景 | student-safe | lab2 | 0.0205 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000157 | LearningOS 操作系统课程讲义源文件 | 第七讲 进程管理与单处理器调度/第一节 进程管理 | student-safe | global,lab2 | 0.0196 |

---

## concept · wrong-hypothesis-sepc

**学生消息**：我认为 ecall 后不需要推进 sepc，sret 会自动跳到下一条。

**意图策略源**：`tutor/prompts/strategies/concept.md`

**意图策略正文**：

```text
# 本轮策略：概念理解

先用必要的最少解释回应学生所问的概念，明确关键边界或因果关系。若学生判断有误，直接指出具体错误及理由；随后只追问一个能暴露其理解依据的问题。
```

**服务端路由**：storedStage=read，intent=concept（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

这个判断不对：硬件在 `ecall` 陷入时把 `sepc` 写成 `ecall` 本身的地址，`sret` 只会跳到当前 `sepc`，不会自动加 4；因此内核必须在保存的 `TrapContext.sepc` 上执行 `advance_sepc()`，否则会再次执行同一条 `ecall`。 [kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005]

你可以检查 `kernel/src/trap.rs`：`advance_sepc()` 修改的是 CSR 还是 `TrapContext` 中保存的字段？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：100/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.2 上下文保存与恢复 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000019 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/五、AI 提问模板 | student-safe | lab2 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000003 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识 | student-safe | lab2 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000009 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.6 把 trap 与调度放进同一条时间线 | student-safe | lab2 | 0.0222 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000037 | rCore Tutorial Guide | 实现特权级的切换/Trap 管理/Trap 分发与处理 | student-safe | global,lab2 | 0.0221 |

---

## code-reading · code-reading-task

**学生消息**：task.rs 里的 suspend_current_and_run_next 调用链应该怎么读？

**意图策略源**：`tutor/prompts/strategies/code-reading.md`

**意图策略正文**：

```text
# 本轮策略：代码阅读

围绕学生提到的文件、符号或控制流回答。优先说明“输入状态 -> 关键变化 -> 输出状态”的阅读框架，再让学生定位一个具体定义、调用点或不变量；不要代替学生完成整段实现。
```

**服务端路由**：storedStage=transfer，intent=code-reading（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

从输入到输出读：

`sys_yield -> suspend_current_and_run_next`：先把当前任务状态从 `Running` 改为 `Ready`，再调用 `run_next_task` 找到下一个 `Ready` 任务并切换；因此“暂停”本身不是保存全部寄存器，而是状态更新加上下文切换。该接口的典型实现正是先 `mark_current_suspended()`，再 `run_next_task()`。citekb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000049

请在 `kernel/src/task.rs` 定位 `suspend_current_and_run_next` 的两个调用点，并说明：谁负责改状态，谁负责选择任务，谁负责真正保存/恢复 `TaskContext`？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：100/100

**RAG 检索**：

- 候选：lexical=13，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000049 | rCore Tutorial Guide | 管理多道程序/实现 sys_yield 和 sys_exit | student-safe | global,lab2 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000014 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务四：教师发放的变体（若有） | student-safe | lab2 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000008 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.5 任务调度 | student-safe | lab2 | 0.0217 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000047 | rCore Tutorial Guide | 管理多道程序/任务控制块与任务运行状态 | student-safe | global,lab2 | 0.0216 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000057 | rCore Tutorial Guide | 分时多任务系统/抢占式调度 | student-safe | global,lab2 | 0.0212 |

---
