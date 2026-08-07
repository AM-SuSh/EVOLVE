# Lab1 裸机启动与 SBI Prompt 分阶段评测

- 评测标签：`offline-baseline`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab1-orient

**学生消息**：lab1 我不会做，启动这段到底怎么回事，给我讲讲 _start 到 main 的过程吧

**阶段提示词源**：`tutor/prompts/lab1/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“机器上电后，内核入口地址、启动栈和 BSS 初始化分别由谁负责”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先不急着写实现。围绕 Lab1，写下你认为最关键的一个系统边界，以及这个判断的依据；我再帮你把它拆成可验证的小问题。

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

- 候选：lexical=16，vector=24，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000005 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.2 处理器如何进入内核入口 | student-safe | lab1 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000010 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.5 从上电到关机的完整执行链 | student-safe | lab1 | 0.0369 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000015 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/四、验证命令 | student-safe | lab1 | 0.0369 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000009 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.4 内核如何结束运行 | student-safe | lab1 | 0.0360 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000002 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/一、问题场景 | student-safe | lab1 | 0.0355 |

---

## 阅读阶段 · lab1-read

**学生消息**：我认为启动链的关键在入口地址，但我还没想清楚是谁决定它

**阶段提示词源**：`tutor/prompts/lab1/stage-read.md`（lab 定制）

**阶段提示词正文**：

```text
# 阅读阶段

沿 `_start -> rust_main -> clear_bss -> console -> SBI shutdown` 追踪启动链。优先让学生区分链接脚本决定的入口地址、汇编设置的启动栈和 Rust 初始化职责，并定位证据所在文件。
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

- 候选：lexical=4，vector=19，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000012 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务一：跑通内核 | student-safe | lab1 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000000 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核 | student-safe | lab1 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000003 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识 | student-safe | lab1 | 0.0219 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000005 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.2 处理器如何进入内核入口 | student-safe | lab1 | 0.0217 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000015 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/四、验证命令 | student-safe | lab1 | 0.0211 |

---

## 验证阶段 · lab1-run

**学生消息**：我把 cargo run -p kernel --features lab1 --release 跑完了，输出在这里

**阶段提示词源**：`tutor/prompts/lab1/stage-run.md`（lab 定制）

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`Hello, OS!`、内核提示、正常退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于加载、链接地址、栈初始化还是 SBI 输出。
```

**服务端路由**：requested=run → tutorState.stage=run（gate=missing-trusted-run）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先写下你预期会看到的三个关键输出，再运行 cargo run -p kernel --features lab1 --release。完成后只贴和预期不同的部分，我们用差异定位下一步。

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

- 候选：lexical=9，vector=37，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000015 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/四、验证命令 | student-safe | lab1 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000014 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务三：动手修改 | student-safe | lab1 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000012 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务一：跑通内核 | student-safe | lab1 | 0.0383 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000011 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务 | student-safe | lab1 | 0.0380 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000004 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.1 内核映像如何装入内存 | student-safe | lab1 | 0.0226 |

---

## 排错阶段 · lab1-debug

**学生消息**：QEMU 起来后没有输出，我猜是链接地址的问题

**阶段提示词源**：`tutor/prompts/lab1/stage-debug.md`（lab 定制）

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用改 `BASE_ADDRESS` 或栈大小等对照实验区分链接地址与启动栈问题。
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

- 候选：lexical=11，vector=40，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000014 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务三：动手修改 | student-safe | lab1 | 0.0335 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000012 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务一：跑通内核 | student-safe | lab1 | 0.0332 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000029 | RISC-V Reader 中文版 | 3.4 链接器 | student-safe | global,lab5 | 0.0294 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000011 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务 | student-safe | lab1 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000004 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.1 内核映像如何装入内存 | student-safe | lab1 | 0.0226 |

---

## 复盘阶段 · lab1-reflect

**学生消息**：我复盘一下：我理解的启动链是固件到内核，AI 提醒了 BSS，我用输出验证了

**阶段提示词源**：`tutor/prompts/lab1/stage-reflect.md`（lab 定制）

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：requested=reflect → tutorState.stage=reflect（gate=missing-reflection-evidence）

**模式/模型**：offline / offline-tutor

**AI 回复**：

用三句话收束 Lab1：你能独立解释什么？AI 提醒了哪一个关键点？你用哪条运行结果或代码路径验证了它？

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

- 候选：lexical=8，vector=17，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000013 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务二：阅读理解 | student-safe | lab1 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000006 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.2 处理器如何进入内核入口 | student-safe | lab1 | 0.0381 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000030 | RISC-V Reader 中文版 | 3.4 链接器 | student-safe | global | 0.0333 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000050 | RISC-V Reader 中文版 | 第八章 向量 | student-safe | global | 0.0313 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000003 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识 | student-safe | lab1 | 0.0229 |

---

## 迁移阶段 · lab1-transfer

**学生消息**：如果把入口地址改掉，之前判断还成立吗

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

改变一个关键条件后，Lab1 的原结论还成立吗？先写预测，再说明你会用什么代码路径或运行证据验证。

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

- 候选：lexical=2，vector=16，eligible=106，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000076 | RISC-V Reader 中文版 | 10.3 机器模式下的异常处理 | student-safe | global,lab2,lab5 | 0.0345 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000010 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.5 从上电到关机的完整执行链 | student-safe | lab1 | 0.0226 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000001 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/零、开始之前（还是最后check） | student-safe | lab1 | 0.0205 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab1:000013 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务二：阅读理解 | student-safe | lab1 | 0.0203 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000045 | RISC-V Reader 中文版 | 6.2 结束语 | student-safe | global | 0.0196 |

---
