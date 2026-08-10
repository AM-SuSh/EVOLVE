# Lab2 Trap 与任务切换 Prompt 意图评测

- 评测标签：`current-intent-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
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

**模式/模型**：offline / offline-tutor

**AI 回复**：

沿控制流想：trap 发生后 sepc 指向哪条指令？如果 sret 回到同一地址，CPU 下一步又会做什么？先回答这两个问题，再定位 advance_sepc 的调用位置。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ❌ |
| lengthOk | ✅ |
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

**模式/模型**：offline / offline-tutor

**AI 回复**：

沿控制流想：trap 发生后 sepc 指向哪条指令？如果 sret 回到同一地址，CPU 下一步又会做什么？先回答这两个问题，再定位 advance_sepc 的调用位置。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ❌ |
| lengthOk | ✅ |
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

**模式/模型**：offline / offline-tutor

**AI 回复**：

沿控制流想：trap 发生后 sepc 指向哪条指令？如果 sret 回到同一地址，CPU 下一步又会做什么？先回答这两个问题，再定位 advance_sepc 的调用位置。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ❌ |
| lengthOk | ✅ |
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

## verification · verification-trace-orient

**学生消息**：怎样验证 task_switch 的 trace 确实说明发生了任务切换？

**意图策略源**：`tutor/prompts/strategies/verification.md`

**意图策略正文**：

```text
# 本轮策略：实验验证

先说明什么证据能够支持或否定当前判断，再给一个最小验证步骤，明确预期差异与观察位置。只能引用服务端提供的可信运行、诊断、Trace 或本轮检索证据。
```

**服务端路由**：storedStage=orient，intent=verification（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 cargo run -p kernel --features lab2 --release，只比较对应断言或 Trace。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
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

## verification · verification-trace-run

**学生消息**：怎样验证 task_switch 的 trace 确实说明发生了任务切换？

**意图策略源**：`tutor/prompts/strategies/verification.md`

**意图策略正文**：

```text
# 本轮策略：实验验证

先说明什么证据能够支持或否定当前判断，再给一个最小验证步骤，明确预期差异与观察位置。只能引用服务端提供的可信运行、诊断、Trace 或本轮检索证据。
```

**服务端路由**：storedStage=run，intent=verification（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 cargo run -p kernel --features lab2 --release，只比较对应断言或 Trace。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
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

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 cargo run -p kernel --features lab2 --release，只比较对应断言或 Trace。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
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

**模式/模型**：offline / offline-tutor

**AI 回复**：

沿控制流想：trap 发生后 sepc 指向哪条指令？如果 sret 回到同一地址，CPU 下一步又会做什么？先回答这两个问题，再定位 advance_sepc 的调用位置。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ❌ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
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

**模式/模型**：offline / offline-tutor

**AI 回复**：

设想不用 sscratch：trap 刚发生时 sp 仍属于谁？在保存任何通用寄存器前，哪一个寄存器还能临时借用而不破坏用户现场？先用这两个问题检查栈交换的必要性。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ❌ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：83/100

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
