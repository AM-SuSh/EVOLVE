# Lab6 磁盘文件系统 Prompt 分阶段评测

- 评测标签：`current-intent-legacy-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab6-orient

**学生消息**：lab6 的磁盘文件系统我不会，VirtIO 和 inode 到底怎么回事

**阶段提示词源**：`tutor/prompts/lab6/stage-orient.md`

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“open('filea') 从系统调用到磁盘扇区要经过哪些层，每层由谁负责”。不要进入具体 patch。
```

**服务端路由**：storedStage=orient，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab6 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：73/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1235，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000014 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/三、实验任务/提交清单（自查） | student-safe | lab6 | 0.0234 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000013 | OS Lab 结构化概念与检查点 | VirtIO 块设备与磁盘文件系统 | student-safe | lab6 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000011 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/三、实验任务/任务一：跑通 lab6 | student-safe | lab6 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000002 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/零、开始之前/环境准备（Lab6 特有） | student-safe | lab6 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000016 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/五、AI 提问模板 | student-safe | lab6 | 0.0224 |

---

## 阅读阶段 · lab6-read

**学生消息**：我认为目录项是关键，但没想清楚它和 inode 的关系

**阶段提示词源**：`tutor/prompts/lab6/stage-read.md`

**阶段提示词正文**：

```text
# 阅读阶段

沿 `EasyFileSystem::open -> root_inode.find -> read_at/write_at -> read_block/write_block` 与 `sys_linkat -> FileIndex.aliases -> nlink -> sys_fstat` 追踪磁盘文件路径。优先让学生区分超级块、inode、目录项与 fd 表项，并定位证据所在文件。
```

**服务端路由**：storedStage=read，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab6 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：73/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1235，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000331 | 操作系统导论 OSTEP 中文核心章节 | 39.10 创建目录 | student-safe | global,lab5,lab6 | 0.0214 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000345 | 操作系统导论 OSTEP 中文核心章节 | 40.3 文件组织：inode | student-safe | global,lab6 | 0.0207 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000157 | rCore Tutorial Guide | 在内核中使用 easy-fs/内核索引节点层 | student-safe | global,lab5,lab6 | 0.0203 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000196 | LearningOS 操作系统课程讲义源文件 | 第九讲 文件系统/第四节 支持文件的操作系统/4. 内核程序设计/4.2 文件管理机制/打开(查找)文件 | student-safe | global,lab5,lab6 | 0.0199 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000344 | 操作系统导论 OSTEP 中文核心章节 | 40.3 文件组织：inode | student-safe | global,lab6 | 0.0199 |

---

## 验证阶段 · lab6-run

**学生消息**：make test-lab6 我跑完了，输出如下

**阶段提示词源**：`tutor/prompts/lab6/stage-run.md`

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`file_test pass`、`Test link OK!`、`mass open/unlink OK!`、`mmap_test pass`、`spawn_test pass`、`stride_test pass`、`fs_test pass`、`pipe_test pass`、全部进程退出），再运行 `make test-lab6`。只比较预测与实际差异，帮助判断问题属于设备层、easy-fs 布局、链接计数还是回归路径。
```

**服务端路由**：storedStage=run，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab6 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：64/100

**RAG 检索**：

- 候选：lexical=14，vector=0，eligible=1235，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000015 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/四、验证 | student-safe | lab6 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000014 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/三、实验任务/提交清单（自查） | student-safe | lab6 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000002 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/零、开始之前/环境准备（Lab6 特有） | student-safe | lab6 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000011 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/三、实验任务/任务一：跑通 lab6 | student-safe | lab6 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000005 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/二、背景知识/2.1 接到盘：VirtIO、MMIO 与 virtqueue | student-safe | lab6 | 0.0224 |

---

## 排错阶段 · lab6-debug

**学生消息**：link_test 报 nlink mismatch，我猜是硬链接计数的问题

**阶段提示词源**：`tutor/prompts/lab6/stage-debug.md`

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。

对 fill/debug 工作区：优先用「`file_test` 是否仍过、`Test link OK!` 是否缺失」区分「普通文件 CREATE 路径」与「`DiskFs::link` 的 nlink」；再引导到 `sys_linkat` → `DiskFs::link` / `attach_hard_link_alias`，不要先改用户测例断言。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab6 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：73/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1235，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000014 | OS Lab 结构化概念与检查点 | 硬链接与 inode 引用计数 | student-safe | lab6 | 0.0229 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000335 | 操作系统导论 OSTEP 中文核心章节 | 39.13 硬链接 | student-safe | global,lab5,lab6 | 0.0226 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000374 | 操作系统导论 OSTEP 中文核心章节 | 42.2 解决方案 1：文件系统检查程序 | student-safe | global,lab6 | 0.0223 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000330 | 操作系统导论 OSTEP 中文核心章节 | 39.9 删除文件 | student-safe | global,lab5,lab6 | 0.0218 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000180 | LearningOS 操作系统课程讲义源文件 | 第九讲 文件系统/第三节 支持崩溃一致性的文件系统 | student-safe | global,lab5,lab6 | 0.0218 |

---

## 复盘阶段 · lab6-reflect

**学生消息**：复盘：我独立判断了名字和内容分离，AI 提醒了 nlink，我用 fstat 验证了

**阶段提示词源**：`tutor/prompts/lab6/stage-reflect.md`

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出，并说明 unlink 一个名字后数据为何仍可由另一个名字访问。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：storedStage=reflect，intent=reflection（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

复盘时要把结论和证据一一对应。先选 Lab6 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：64/100

**RAG 检索**：

- 候选：lexical=16，vector=0，eligible=1235，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000014 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/三、实验任务/提交清单（自查） | student-safe | lab6 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000016 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/五、AI 提问模板 | student-safe | lab6 | 0.0231 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000014 | OS Lab 结构化概念与检查点 | 硬链接与 inode 引用计数 | student-safe | lab6 | 0.0224 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000328 | 操作系统导论 OSTEP 中文核心章节 | 39.8 获取文件信息 | student-safe | global,lab5,lab6 | 0.0218 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000330 | 操作系统导论 OSTEP 中文核心章节 | 39.9 删除文件 | student-safe | global,lab5,lab6 | 0.0214 |

---

## 迁移阶段 · lab6-transfer

**学生消息**：如果 unlink 后立刻回收 inode，之前的结论还成立吗

**阶段提示词源**：`tutor/prompts/stages/stage-transfer.md`

**阶段提示词正文**：

```text
# 迁移阶段

目标：改变一个关键条件，让学生重新解释机制，确认理解不是对原题答案的复述。

- 只提出一个迁移问题。
- 优先改变调度条件、特权边界、地址空间或失败模式。
- 要求学生先预测，再说明需要什么证据验证。
- 不把原实验通过直接等同于迁移能力。
```

**服务端路由**：storedStage=transfer，intent=transfer（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先分开不变量与改变的条件：条件变化后，原机制未必整体失效。请先预测一个会变化的可观察结果，再说明如何验证。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：64/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1235，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000014 | OS Lab 结构化概念与检查点 | 硬链接与 inode 引用计数 | student-safe | lab6 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab6:000014 | OS Lab 本地实验手册 | 实验 6：磁盘文件系统/三、实验任务/提交清单（自查） | student-safe | lab6 | 0.0229 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000335 | 操作系统导论 OSTEP 中文核心章节 | 39.13 硬链接 | student-safe | global,lab5,lab6 | 0.0223 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000330 | 操作系统导论 OSTEP 中文核心章节 | 39.9 删除文件 | student-safe | global,lab5,lab6 | 0.0218 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000349 | 操作系统导论 OSTEP 中文核心章节 | 40.4 目录组织 | student-safe | global,lab6 | 0.0216 |

---
