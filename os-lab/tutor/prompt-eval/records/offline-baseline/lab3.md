# Lab3 内存与虚拟内存 Prompt 分阶段评测

- 评测标签：`offline-baseline`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab3-orient

**学生消息**：lab3 的页表太复杂了，我不会，给我讲讲分页到底怎么做的

**阶段提示词源**：`tutor/prompts/lab3/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“开分页后为什么内核必须先有恒等映射，用户页为什么必须带 U 位”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先不急着写实现。围绕 Lab3，写下你认为最关键的一个系统边界，以及这个判断的依据；我再帮你把它拆成可验证的小问题。

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

- 候选：lexical=10，vector=29，eligible=108，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000008 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.5 地址空间 MemorySet | student-safe | lab3 | 0.0381 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000003 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识 | student-safe | lab3 | 0.0380 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证命令 | student-safe | lab3 | 0.0378 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务三：动手修改 | student-safe | lab3 | 0.0374 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000011 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务一：跑通内核 | student-safe | lab3 | 0.0361 |

---

## 阅读阶段 · lab3-read

**学生消息**：我认为恒等映射是关键，但没想清楚它为什么必须在开分页之前

**阶段提示词源**：`tutor/prompts/lab3/stage-read.md`（lab 定制）

**阶段提示词正文**：

```text
# 阅读阶段

沿 `frame_alloc -> PageTable::find_pte -> MemorySet::map_area -> satp 切换` 追踪地址转换链。优先让学生把 VPN 拆分、PTE 布局和权限位分开解释，并定位证据所在文件。
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

- 候选：lexical=12，vector=19，eligible=108，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000008 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.5 地址空间 MemorySet | student-safe | lab3 | 0.0395 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000026 | RISC-V Reader 中文版 | 3.2 函数调用规范（Calling convention） | student-safe | global | 0.0342 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000000 | RISC-V Reader 中文版 | 第一章 为什么要有 RISC-V？ | student-safe | global | 0.0325 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000002 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/一、问题场景 | student-safe | lab3 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000013 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务三：动手修改 | student-safe | lab3 | 0.0229 |

---

## 验证阶段 · lab3-run

**学生消息**：cargo run -p kernel --features lab3 --release 我跑完了

**阶段提示词源**：`tutor/prompts/lab3/stage-run.md`（lab 定制）

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 关键输出（Hello、幂结果、Yield×5、全部退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于加载、映射缺失、权限位还是 `satp` 切换。
```

**服务端路由**：requested=run → tutorState.stage=run（gate=missing-trusted-run）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先写下你预期会看到的三个关键输出，再运行 cargo run -p kernel --features lab3 --release。完成后只贴和预期不同的部分，我们用差异定位下一步。

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

- 候选：lexical=11，vector=35，eligible=108，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证命令 | student-safe | lab3 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务三：动手修改 | student-safe | lab3 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000011 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务一：跑通内核 | student-safe | lab3 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000013 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务三：动手修改 | student-safe | lab3 | 0.0385 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000008 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.5 地址空间 MemorySet | student-safe | lab3 | 0.0369 |

---

## 排错阶段 · lab3-debug

**学生消息**：用户程序一访问就 page fault，我猜是 PTE 少了权限位

**阶段提示词源**：`tutor/prompts/lab3/stage-debug.md`（lab 定制）

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用去掉 `U` 位或关闭恒等映射等对照实验缩小范围。
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

- 候选：lexical=13，vector=21，eligible=108，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000008 | OS Lab 结构化概念与检查点 | PTE 权限与 U 位 | student-safe | lab3 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000000 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存 | student-safe | lab3 | 0.0383 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000013 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务三：动手修改 | student-safe | lab3 | 0.0374 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000005 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.2 Sv39 三级页表 | student-safe | lab3 | 0.0369 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000003 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识 | student-safe | lab3 | 0.0366 |

---

## 复盘阶段 · lab3-reflect

**学生消息**：复盘：我自己推了 VPN 拆分，AI 提醒了权限位，我用最小映射验证了

**阶段提示词源**：`tutor/prompts/lab3/stage-reflect.md`（lab 定制）

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：requested=reflect → tutorState.stage=reflect（gate=missing-reflection-evidence）

**模式/模型**：offline / offline-tutor

**AI 回复**：

用三句话收束 Lab3：你能独立解释什么？AI 提醒了哪一个关键点？你用哪条运行结果或代码路径验证了它？

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

- 候选：lexical=6，vector=8，eligible=108，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000004 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.1 分页与地址空间 | student-safe | lab3 | 0.0383 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000005 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.2 Sv39 三级页表 | student-safe | lab3 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000000 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存 | student-safe | lab3 | 0.0234 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000007 | OS Lab 结构化概念与检查点 | Sv39 三级页表遍历 | student-safe | lab3 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000009 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.6 从一个虚拟地址走到物理内存 | student-safe | lab3 | 0.0229 |

---

## 迁移阶段 · lab3-transfer

**学生消息**：如果第一级页表少一级，之前的判断还成立吗

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

改变一个关键条件后，Lab3 的原结论还成立吗？先写预测，再说明你会用什么代码路径或运行证据验证。

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

- 候选：lexical=12，vector=23，eligible=108，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000007 | OS Lab 结构化概念与检查点 | Sv39 三级页表遍历 | student-safe | lab3 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000005 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.2 Sv39 三级页表 | student-safe | lab3 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000006 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.3 页表项 PTE | student-safe | lab3 | 0.0378 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000080 | RISC-V Reader 中文版 | 10.6 基于页面的虚拟内存 | student-safe | global,lab3 | 0.0375 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab3:000002 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/一、问题场景 | student-safe | lab3 | 0.0362 |

---
