# Lab1 裸机启动与 SBI Prompt 分阶段评测

- 评测标签：`remote-stu`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`https://you.loveme.space/v1`

## 定界阶段 · lab1-orient

**学生消息**：lab1 我不会做，启动这段到底怎么回事，给我讲讲 _start 到 main 的过程吧

**阶段提示词源**：`tutor/prompts/lab1/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“机器上电后，内核入口地址、启动栈和 BSS 初始化分别由谁负责”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已经抓住了核心：`_start` 是内核真正的入口，Rust 的 `main` 并不会被硬件直接调用。先做一个判断：

**CPU 复位后，OpenSBI 跳到 `_start` 时，`sp`（栈指针）和 BSS 是否已经由 Rust 运行时自动准备好了？请说明你认为 `_start` 接下来必须先做哪件事。**

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

入口地址确实是启动链的关键，但要区分“谁规定入口”和“谁执行入口”。请先查看 `kernel/linker.ld`，找出 `ENTRY(...)` 以及内核起始地址相关的定义：它们分别指定了什么？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

请把终端输出完整贴出，至少包含：

- `Hello, OS!`
- `os-lab kernel lab1 is running on QEMU virt.`
- QEMU 是否正常退出，是否有报错或卡住

当前还没有可验证的运行证据；不要只贴 cargo 返回码。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

链接地址确实可能导致 OpenSBI 跳转到错误位置，但“无输出”也可能发生在入口栈或 QEMU 配置阶段。请明确你的可证伪假设：`kernel/linker.ld` 的 `BASE_ADDRESS` 是否已偏离 `0x80200000`？做一次最小对照实验：确认该值，并贴出 `cargo run -p kernel --features lab1 --release` 的完整终端输出；观察是否出现 OpenSBI 日志、`Hello, OS!`，以及 QEMU 是否退出。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已经区分出“启动链”和“BSS”两个要点，但“用输出验证了”还缺少可核对的证据。请补充一个具体证据：运行输出中是否同时出现 `Hello, OS!`、内核自身输出，并显示 QEMU 正常退出？另外指出它验证了启动链中的哪一步。

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
