# Lab1 裸机启动与 SBI Prompt 分阶段评测

- 评测标签：`current-intent-legacy-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab1-orient

**学生消息**：lab1 我不会做，启动这段到底怎么回事，给我讲讲 _start 到 main 的过程吧

**阶段提示词源**：`tutor/prompts/lab1/stage-orient.md`

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“机器上电后，内核入口地址、启动栈和 BSS 初始化分别由谁负责”。不要进入具体 patch。
```

**服务端路由**：storedStage=orient，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab1 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000014 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务三：动手修改 | student-safe | lab1 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000005 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.2 处理器如何进入内核入口 | student-safe | lab1 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000015 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/四、验证命令 | student-safe | lab1 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000013 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务二：阅读理解 | student-safe | lab1 | 0.0224 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000008 | rCore Tutorial Guide | 构建用户态执行环境/用户态最小化执行环境/执行环境初始化 | student-safe | global,lab1 | 0.0219 |

---

## 阅读阶段 · lab1-read

**学生消息**：我认为启动链的关键在入口地址，但我还没想清楚是谁决定它

**阶段提示词源**：`tutor/prompts/lab1/stage-read.md`

**阶段提示词正文**：

```text
# 阅读阶段

沿 `_start -> rust_main -> clear_bss -> console -> SBI shutdown` 追踪启动链。优先让学生区分链接脚本决定的入口地址、汇编设置的启动栈和 Rust 初始化职责，并定位证据所在文件。
```

**服务端路由**：storedStage=read，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab1 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000082 | LearningOS 操作系统课程讲义源文件 | 第一章：rCore-Tutorial ch1 内核架构分析/学习要点 | student-safe | global,lab1 | 0.0220 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000086 | LearningOS 操作系统课程讲义源文件 | 第二讲 实践与实验介绍/第三节 硬件启动与软件启动/2. QEMU启动参数和流程 | student-safe | global,lab1 | 0.0218 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000014 | rCore Tutorial Guide | 构建裸机执行环境/实现关机功能 | student-safe | global,lab1 | 0.0197 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000007 | rCore Tutorial Guide | 移除标准库依赖/分析被移除标准库的程序 | student-safe | global,lab1 | 0.0195 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000039 | rCore Tutorial Guide | 实现特权级的切换/执行应用程序 | student-safe | global,lab2 | 0.0194 |

---

## 验证阶段 · lab1-run

**学生消息**：我把 cargo run -p kernel --features lab1 --release 跑完了，输出在这里

**阶段提示词源**：`tutor/prompts/lab1/stage-run.md`

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`Hello, OS!`、内核提示、正常退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于加载、链接地址、栈初始化还是 SBI 输出。
```

**服务端路由**：storedStage=run，intent=verification（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 cargo run -p kernel --features lab1 --release，只比较对应断言或 Trace。

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

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000015 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/四、验证命令 | student-safe | lab1 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000012 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务一：跑通内核 | student-safe | lab1 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000014 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务三：动手修改 | student-safe | lab1 | 0.0229 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000075 | LearningOS 操作系统课程讲义源文件 | 第一章：rCore-Tutorial ch1 内核架构分析 | student-safe | global,lab1 | 0.0220 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000012 | rCore Tutorial Guide | 构建用户态执行环境/有显示支持的用户态执行环境/实现输出字符串的相关函数 | student-safe | global,lab1 | 0.0205 |

---

## 排错阶段 · lab1-debug

**学生消息**：QEMU 起来后没有输出，我猜是链接地址的问题

**阶段提示词源**：`tutor/prompts/lab1/stage-debug.md`

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用改 `BASE_ADDRESS` 或栈大小等对照实验区分链接地址与启动栈问题。
```

**服务端路由**：storedStage=debug，intent=verification（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 cargo run -p kernel --features lab1 --release，只比较对应断言或 Trace。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：55/100

**RAG 检索**：

- 候选：lexical=34，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000011 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务 | student-safe | lab1 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000014 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务三：动手修改 | student-safe | lab1 | 0.0231 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000086 | LearningOS 操作系统课程讲义源文件 | 第二讲 实践与实验介绍/第三节 硬件启动与软件启动/2. QEMU启动参数和流程 | student-safe | global,lab1 | 0.0223 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000004 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.1 内核映像如何装入内存 | student-safe | lab1 | 0.0222 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000010 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.5 从上电到关机的完整执行链 | student-safe | lab1 | 0.0219 |

---

## 复盘阶段 · lab1-reflect

**学生消息**：我复盘一下：我理解的启动链是固件到内核，AI 提醒了 BSS，我用输出验证了

**阶段提示词源**：`tutor/prompts/lab1/stage-reflect.md`

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：storedStage=reflect，intent=reflection（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

复盘时要把结论和证据一一对应。先选 Lab1 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。

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

- 候选：lexical=40，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000013 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/三、实验任务/任务二：阅读理解 | student-safe | lab1 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000003 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识 | student-safe | lab1 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab1:000006 | OS Lab 本地实验手册 | 实验 1：裸机启动与最小内核/二、背景知识/2.2 处理器如何进入内核入口 | student-safe | lab1 | 0.0219 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000092 | LearningOS 操作系统课程讲义源文件 | 第二讲 实践与实验介绍/第四节 实践：裸机程序 -- LibOS/8. LibOS初始化/清空bss段 | student-safe | global,lab1 | 0.0218 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000017 | rCore Tutorial Guide | 构建裸机执行环境/清空 .bss 段 | student-safe | global,lab1 | 0.0212 |

---

## 迁移阶段 · lab1-transfer

**学生消息**：如果把入口地址改掉，之前判断还成立吗

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

- 候选：lexical=16，vector=0，eligible=1236，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000082 | LearningOS 操作系统课程讲义源文件 | 第一章：rCore-Tutorial ch1 内核架构分析/学习要点 | student-safe | global,lab1 | 0.0223 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000086 | LearningOS 操作系统课程讲义源文件 | 第二讲 实践与实验介绍/第三节 硬件启动与软件启动/2. QEMU启动参数和流程 | student-safe | global,lab1 | 0.0220 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000014 | rCore Tutorial Guide | 构建裸机执行环境/实现关机功能 | student-safe | global,lab1 | 0.0201 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000007 | rCore Tutorial Guide | 移除标准库依赖/分析被移除标准库的程序 | student-safe | global,lab1 | 0.0199 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000016 | rCore Tutorial Guide | 构建裸机执行环境/正确配置栈空间布局 | student-safe | global,lab1 | 0.0197 |

---
