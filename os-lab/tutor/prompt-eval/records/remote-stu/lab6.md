# Lab6 磁盘文件系统 Prompt 分阶段评测

- 评测标签：`remote-stu`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`https://you.loveme.space/v1`

## 定界阶段 · lab6-orient

**学生消息**：lab6 的磁盘文件系统我不会，VirtIO 和 inode 到底怎么回事

**阶段提示词源**：`tutor/prompts/lab6/stage-orient.md`（lab 定制）

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“open('filea') 从系统调用到磁盘扇区要经过哪些层，每层由谁负责”。不要进入具体 patch。
```

**服务端路由**：requested=orient → tutorState.stage=orient（gate=missing-initial-judgment）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

先给出你的初始判断：你目前把“不会实现”概括成了“不了解 VirtIO 和 inode”。请先判断一个具体链路：

`open("filea")` 从用户态系统调用到读取磁盘内容，你认为会经过哪些层？请按“用户程序 → 内核文件接口 → easy-fs → 块缓存/块设备 → VirtIO → 磁盘扇区”补充每层由谁负责什么。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

目录项负责“名字到 inode 编号”的映射，inode 则保存文件大小、数据块索引和 `nlink`；目录项本身不保存文件内容。

请先从仓库找证据：在 `os-fs/src/disk.rs` 或相关目录项定义中，定位目录项结构及其读写代码，并贴出结构体字段和 `find` 返回值。观察它返回的是 inode 编号、inode 对象，还是文件内容？

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

请贴出 `make test-lab6` 的完整末尾输出，至少包含：

`file_test pass`、`Test link OK!`、`mass open/unlink OK!`、`mmap_test pass`、`spawn_test pass`、`stride_test pass`、`fs_test pass`、`pipe_test pass`、`All processes exited.`

同时说明 QEMU 是否正常退出。我们只根据这些实际输出判断是哪一层出现差异。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| stageRoute | ✅ |
| promptUsed | ✅ |

**综合分**：80/100

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

“硬链接计数的问题”还不能区分是 `link` 未递增、`unlink` 未递减，还是测试对 `nlink` 的预期不对。请先给出一个可证伪假设：

执行最小序列：创建文件 → `fstat` 原路径 → `link` → 分别对两个路径 `fstat`，并贴出 `ino` 与 `nlink`；再 `unlink` 一个路径重复 `fstat`。你预期每一步的 `ino/nlink` 是什么？观察重点是：两个名字的 `ino` 是否相同，以及 `nlink` 是否随目录项数量变化。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你已抓住核心：不同名字可以指向同一个 inode，`nlink` 反映目录项数量。请把复盘绑定到证据：贴出 `fstat` 在 `link` 前后及 `unlink` 一个名字后的 `ino/nlink` 输出，并注明对应的 `link_test.rs` 或内核代码路径；然后用一句话说明为何另一个名字仍能访问内容。

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

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

你的判断抓住了关键：若 `unlink` 后无条件立即回收 inode，结论只在“没有任何打开文件引用”时成立；若仍有 fd，读写该 fd 可能失效，违反 Unix 语义。

迁移问题：假设文件有两个硬链接，且进程已 `open` 它；随后删除两个目录项，但 fd 仍未关闭。你预测此时 `fstat(fd)`、读取内容和 inode/data block 回收分别应发生什么？请指出需要观察的 `ino`、`nlink` 与 fd 行为。

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
