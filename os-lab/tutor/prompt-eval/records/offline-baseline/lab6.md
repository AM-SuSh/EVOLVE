# Lab6 磁盘文件系统 Prompt 分阶段评测

- 评测标签：`offline-baseline`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab6-orient

**学生消息**：lab6 的磁盘文件系统我不会，VirtIO 和 inode 到底怎么回事

**阶段提示词源**：`tutor/prompts/lab6/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“open('filea') 从系统调用到磁盘扇区要经过哪些层，每层由谁负责”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先不急着写实现。围绕 Lab6，写下你认为最关键的一个系统边界，以及这个判断的依据；我再帮你把它拆成可验证的小问题。

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

- 候选：lexical=15，vector=29，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000013 | OS Lab 结构化概念与检查点 | VirtIO 块设备与磁盘文件系统 | student-safe | lab6 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000009 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/二、背景知识/2.3 可写文件与打开标志 | student-safe | lab6 | 0.0381 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000002 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/零、开始之前 | student-safe | lab6 | 0.0378 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000004 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/一、问题场景 | student-safe | lab6 | 0.0378 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000008 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/二、背景知识/2.2 在块之上：easy-fs 如何组织文件 | student-safe | lab6 | 0.0375 |

---

## 阅读阶段 · lab6-read

**学生消息**：我认为目录项是关键，但没想清楚它和 inode 的关系

**阶段提示词源**：`tutor/prompts/lab6/stage-read.md`（lab 定制）

**阶段提示词正文**：

```text
# 阅读阶段

沿 `EasyFileSystem::open -> root_inode.find -> read_at/write_at -> read_block/write_block` 与 `sys_linkat -> FileIndex.aliases -> nlink -> sys_fstat` 追踪磁盘文件路径。优先让学生区分超级块、inode、目录项与 fd 表项，并定位证据所在文件。
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

- 候选：lexical=9，vector=22，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000014 | OS Lab 结构化概念与检查点 | 硬链接与 inode 引用计数 | student-safe | lab6 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000008 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/二、背景知识/2.2 在块之上：easy-fs 如何组织文件 | student-safe | lab6 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000004 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/一、问题场景 | student-safe | lab6 | 0.0390 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000013 | OS Lab 结构化概念与检查点 | VirtIO 块设备与磁盘文件系统 | student-safe | lab6 | 0.0361 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000005 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/二、背景知识 | student-safe | lab6 | 0.0358 |

---

## 验证阶段 · lab6-run

**学生消息**：make test-lab6 我跑完了，输出如下

**阶段提示词源**：`tutor/prompts/lab6/stage-run.md`（lab 定制）

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`file_test pass`、`Test link OK!`、`mass open/unlink OK!`、`mmap_test pass`、`spawn_test pass`、`stride_test pass`、`fs_test pass`、`pipe_test pass`、全部进程退出），再运行 `make test-lab6`。只比较预测与实际差异，帮助判断问题属于设备层、easy-fs 布局、链接计数还是回归路径。
```

**服务端路由**：requested=run → tutorState.stage=run（gate=missing-trusted-run）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先写下你预期会看到的三个关键输出，再运行 make test-lab6。完成后只贴和预期不同的部分，我们用差异定位下一步。

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

- 候选：lexical=4，vector=9，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000016 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/四、验证命令 | student-safe | lab6 | 0.0398 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000013 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/三、实验任务/任务一：跑通内核 | student-safe | lab6 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000006 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/二、背景知识/2.1 接到盘：VirtIO、MMIO 与 virtqueue | student-safe | lab6 | 0.0229 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000002 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/零、开始之前 | student-safe | lab6 | 0.0226 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000001 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/零、开始之前 | student-safe | lab6 | 0.0217 |

---

## 排错阶段 · lab6-debug

**学生消息**：link_test 报 nlink mismatch，我猜是硬链接计数的问题

**阶段提示词源**：`tutor/prompts/lab6/stage-debug.md`（lab 定制）

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用 fstat 对照 link/unlink 前后的 ino 与 nlink，区分目录项名字与 inode 身份问题。
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

- 候选：lexical=8，vector=18，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000014 | OS Lab 结构化概念与检查点 | 硬链接与 inode 引用计数 | student-safe | lab6 | 0.0398 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000024 | RISC-V Reader 中文版 | 第三章 RISC-V 汇编语言 | student-safe | global | 0.0331 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000078 | RISC-V Reader 中文版 | 10.5 现代操作系统的监管者模式 | student-safe | global,lab5 | 0.0321 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000004 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/一、问题场景 | student-safe | lab6 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000003 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/一、问题场景 | student-safe | lab6 | 0.0229 |

---

## 复盘阶段 · lab6-reflect

**学生消息**：复盘：我独立判断了名字和内容分离，AI 提醒了 nlink，我用 fstat 验证了

**阶段提示词源**：`tutor/prompts/lab6/stage-reflect.md`（lab 定制）

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出，并说明 unlink 一个名字后数据为何仍可由另一个名字访问。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：requested=reflect → tutorState.stage=reflect（gate=missing-reflection-evidence）

**模式/模型**：offline / offline-tutor

**AI 回复**：

用三句话收束 Lab6：你能独立解释什么？AI 提醒了哪一个关键点？你用哪条运行结果或代码路径验证了它？

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

- 候选：lexical=5，vector=13，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000014 | OS Lab 结构化概念与检查点 | 硬链接与 inode 引用计数 | student-safe | lab6 | 0.0393 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000003 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/一、问题场景 | student-safe | lab6 | 0.0388 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000004 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/一、问题场景 | student-safe | lab6 | 0.0234 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000009 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/二、背景知识/2.3 可写文件与打开标志 | student-safe | lab6 | 0.0231 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000000 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统 | student-safe | lab6 | 0.0229 |

---

## 迁移阶段 · lab6-transfer

**学生消息**：如果 unlink 后立刻回收 inode，之前的结论还成立吗

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

改变一个关键条件后，Lab6 的原结论还成立吗？先写预测，再说明你会用什么代码路径或运行证据验证。

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

- 候选：lexical=12，vector=17，eligible=105，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000008 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/二、背景知识/2.2 在块之上：easy-fs 如何组织文件 | student-safe | lab6 | 0.0390 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000003 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/一、问题场景 | student-safe | lab6 | 0.0387 |
| kb:platform-lab-packages:v1:98d66f3ef7d9:chunk:0000014 | OS Lab 结构化概念与检查点 | 硬链接与 inode 引用计数 | student-safe | lab6 | 0.0383 |
| kb:platform-lab-manuals:v2:7bf4c507b7f4:chunk:lab6:000004 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/一、问题场景 | student-safe | lab6 | 0.0383 |
| kb:riscv-reader-zh-local:v1:790f163c7291:chunk:0000078 | RISC-V Reader 中文版 | 10.5 现代操作系统的监管者模式 | student-safe | global,lab5 | 0.0316 |

---
