# Lab2 Trap 与任务切换 Prompt 分阶段评测

- 评测标签：`eval-2026-08-09T09-01-40`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab2-orient

**学生消息**：lab2 的 trap 到底怎么写，ecall 之后发生了什么，给我讲一下流程吧

**阶段提示词源**：`tutor/prompts/lab2/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问用户态为何不能直接调用内核普通函数。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已经抓住入口是 `ecall`，但先不要急着写 `trap_handler`。请先判断：

用户态代码为什么不能直接调用内核里的普通 Rust 函数，而必须通过 `ecall`？

请结合“用户态/内核态”和特权级说明你的初步理解；下一步我们再沿 `user/src/syscall.rs -> __alltraps` 追踪。

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

- 候选：lexical=32，vector=40，eligible=118，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000005 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.1 从 SBI 调用到系统调用 | student-safe | lab2 | 0.0395 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000003 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/一、问题场景 | student-safe | lab2 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000013 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.4 内核如何按 ABI 分发系统调用 | student-safe | lab2 | 0.0383 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000011 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 trap 如何保存和恢复用户上下文 | student-safe | lab2 | 0.0367 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000006 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.1 从 SBI 调用到系统调用 | student-safe | lab2 | 0.0364 |

---

## 阅读阶段 · lab2-read

**学生消息**：我认为关键是 sscratch 的交换，但我没想清楚它和内核栈的关系

**阶段提示词源**：`tutor/prompts/lab2/stage-read.md`（lab 定制）

**阶段提示词正文**：

```text
# 阅读阶段

沿 `ecall`、`TrapContext`、`sret` 追踪控制流。优先让学生把“硬件自动完成”和“内核必须完成”分成两列，并定位证据所在文件。
```

**服务端路由**：requested=read → tutorState.stage=read（gate=missing-source-evidence）

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
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：80/100

**RAG 检索**：

- 候选：lexical=11，vector=15，eligible=118，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000008 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.2 用户程序如何首次进入 U-mode | student-safe | lab2 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000010 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 trap 如何保存和恢复用户上下文 | student-safe | lab2 | 0.0380 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000009 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 trap 如何保存和恢复用户上下文 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000007 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.2 用户程序如何首次进入 U-mode | student-safe | lab2 | 0.0234 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000003 | OS Lab 结构化概念与检查点 | Trap 上下文保存与恢复 | student-safe | lab2 | 0.0231 |

---

## 验证阶段 · lab2-run

**学生消息**：我刚跑完 lab2 的验证命令，下面是输出

**阶段提示词源**：`tutor/prompts/lab2/stage-run.md`（lab 定制）

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测三个关键输出，再运行 QEMU。只比较预测与实际的差异，帮助判断问题属于加载、trap 返回、系统调用还是调度。
```

**服务端路由**：requested=run → tutorState.stage=run（gate=missing-trusted-run）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先写下你预期会看到的三个关键输出，再运行 cargo run -p kernel --features lab2 --release。完成后只贴和预期不同的部分，我们用差异定位下一步。

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

- 候选：lexical=12，vector=22，eligible=118，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000022 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/四、验证命令 | student-safe | lab2 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000003 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/一、问题场景 | student-safe | lab2 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000001 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/零、开始之前 | student-safe | lab2 | 0.0372 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000006 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.1 从 SBI 调用到系统调用 | student-safe | lab2 | 0.0356 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000013 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.4 内核如何按 ABI 分发系统调用 | student-safe | lab2 | 0.0347 |

---

## 排错阶段 · lab2-debug

**学生消息**：Yield round 只有 0 次，我猜是调度器没把任务标成 Ready

**阶段提示词源**：`tutor/prompts/lab2/stage-debug.md`（lab 定制）

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。
```

**服务端路由**：requested=debug → tutorState.stage=debug（gate=missing-debug-hypothesis）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

“调度器没把任务标成 `Ready`”是可检验的假设，但 `Yield round` 为 0 也可能表示程序尚未执行到 `SYS_YIELD`。

请检查 QEMU 输出：是否出现 `Yield test start`？只回答“出现/未出现”，并贴出它附近的几行输出。

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

- 候选：lexical=14，vector=21，eligible=118，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000018 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务一：先完成教师下发的 fill/debug 变体，再跑通内核 | student-safe | lab2 | 0.0393 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000001 | OS Lab 结构化概念与检查点 | 协作式轮转调度 | student-safe | lab2 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000019 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务一：先完成教师下发的 fill/debug 变体，再跑通内核 | student-safe | lab2 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000014 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.5 任务状态与 CPU 调度 | student-safe | lab2 | 0.0378 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000022 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/四、验证命令 | student-safe | lab2 | 0.0371 |

---

## 复盘阶段 · lab2-reflect

**学生消息**：复盘：我独立判断了 sepc 推进，AI 提醒了栈切换，我用 trace 验证了

**阶段提示词源**：`tutor/prompts/lab2/stage-reflect.md`（lab 定制）

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：requested=reflect → tutorState.stage=reflect（gate=missing-reflection-evidence）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你的复盘已区分了“独立判断”和“AI 提醒”，但“用 trace 验证”与当前证据不一致：记录显示该运行 `traceCount=0`。请基于可核对证据补充一句：你在哪个代码路径或哪几行 QEMU 输出中验证了 `sepc` 推进和 `sscratch` 栈切换？

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

- 候选：lexical=10，vector=11，eligible=118，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000010 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 trap 如何保存和恢复用户上下文 | student-safe | lab2 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000009 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 trap 如何保存和恢复用户上下文 | student-safe | lab2 | 0.0378 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000011 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 trap 如何保存和恢复用户上下文 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000003 | OS Lab 结构化概念与检查点 | Trap 上下文保存与恢复 | student-safe | lab2 | 0.0229 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000000 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务 | student-safe | lab2 | 0.0226 |

---

## 迁移阶段 · lab2-transfer

**学生消息**：如果 sscratch 不换栈，任务切换还成立吗

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

任务切换本身可能仍能切换 `TrapContext`，但陷阱入口的栈位置会改变：硬件不会自动替你换到内核栈。

迁移问题：若保留 `sscratch` 不交换，且 `__alltraps` 仍直接在当前 `sp` 下分配上下文，你预测用户程序执行 `ecall` 后会把现场保存到哪里、最终 `sret` 能否正确恢复？请结合 `os-context/src/trap.asm` 指出观察位置。

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

- 候选：lexical=8，vector=18，eligible=118，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000003 | OS Lab 结构化概念与检查点 | Trap 上下文保存与恢复 | student-safe | lab2 | 0.0383 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000017 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务 | student-safe | lab2 | 0.0355 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000010 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 trap 如何保存和恢复用户上下文 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000009 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 trap 如何保存和恢复用户上下文 | student-safe | lab2 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab2:000022 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/四、验证命令 | student-safe | lab2 | 0.0229 |

---
