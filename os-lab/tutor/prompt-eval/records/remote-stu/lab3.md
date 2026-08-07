# Lab3 内存与虚拟内存 Prompt 分阶段评测

- 评测标签：`remote-stu`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`https://you.loveme.space/v1`

## 定界阶段 · lab3-orient

**学生消息**：lab3 的页表太复杂了，我不会，给我讲讲分页到底怎么做的

**阶段提示词源**：`tutor/prompts/lab3/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“开分页后为什么内核必须先有恒等映射，用户页为什么必须带 U 位”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

先给出一个初始判断：你认为“分页”主要解决什么问题？是把物理内存切成固定大小的页，还是让每个进程拥有独立的虚拟地址空间？

请结合代码路径猜一下：开启分页后，为什么内核需要先建立恒等映射？用户程序的页表项为什么还必须带 `U` 位？

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你抓到了关键：恒等映射保证“虚拟地址数值仍等于物理地址”，但“开分页前建立”是内核软件时序要求，`satp` 生效后则由硬件按页表翻译。

请在 `kernel/src/mm.rs` 和 `kernel/src/riscv.rs` 中定位：哪段代码先建立内核映射，哪一行随后写入 `satp`？贴出这两处附近代码，并说明若顺序反过来，CPU 接下来要翻译的第一条内核指令地址是什么。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已经运行了验证命令，但目前还没有可引用的运行证据。请贴出 QEMU 中从用户程序开始到结束的关键输出，尤其观察是否出现：

`Hello from user app!`、`409684505`、5 行 `Yield round`、`All user apps exited.`

同时告诉我实际输出与预期相比缺少了哪一项。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

“PTE 少权限位”方向合理，但还不够可证伪：用户执行、读、写分别依赖 `X`、`R`、`W`，用户态访问还依赖 `U`。

请只补充一个具体判断：你认为缺的是哪一位？同时说明应查看 [kernel/src/mm.rs](/workspace/kernel/src/mm.rs) 中哪类映射，以及运行时出现什么现象会证伪该判断。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已区分了“独立判断”和“AI 提醒”，但“最小映射验证了”还缺少可核对的证据。请把这次验证关联到具体代码路径或输出：你观察了哪个文件中的哪段逻辑，以及运行中看到了什么现象？可引用证据：`run:eval-lab3-reflect-22686cc8-ff4f-4861-8aab-94da2723ded6`。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你的判断不能直接沿用：它依赖“页表级数、`satp.MODE` 与 VPN 切分”一致；少一级后，硬件不会自动跳过该级。

若仍启用 Sv39，你预测访问用户代码时会发生什么？请沿 `kernel/src/riscv.rs` 的 `satp` 设置和 `os-vm/src/lib.rs` 的查表路径检查，并说明需要观察哪类输出或异常来验证。

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
