# Lab2 Trap 与任务切换 Prompt 分阶段评测

- 评测标签：`current-intent-legacy-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab2-orient

**学生消息**：lab2 的 trap 到底怎么写，ecall 之后发生了什么，给我讲一下流程吧

**阶段提示词源**：`tutor/prompts/lab2/stage-orient.md`

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问用户态为何不能直接调用内核普通函数。不要进入具体 patch。
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
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：55/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000004 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.1 特权级与 trap | student-safe | lab2 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000003 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识 | student-safe | lab2 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000017 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/提交清单（自查） | student-safe | lab2 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000002 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/一、问题场景 | student-safe | lab2 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000019 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/五、AI 提问模板 | student-safe | lab2 | 0.0224 |

---

## 阅读阶段 · lab2-read

**学生消息**：我认为关键是 sscratch 的交换，但我没想清楚它和内核栈的关系

**阶段提示词源**：`tutor/prompts/lab2/stage-read.md`

**阶段提示词正文**：

```text
# 阅读阶段

沿 `ecall`、`TrapContext`、`sret` 追踪控制流。优先让学生把“硬件自动完成”和“内核必须完成”分成两列，并定位证据所在文件。
```

**服务端路由**：storedStage=read，intent=concept（gate=intent-routed）

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
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：55/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000006 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 用户栈与内核栈：`sscratch` | student-safe | lab2 | 0.0231 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000130 | LearningOS 操作系统课程讲义源文件 | 第三讲 基于特权级的隔离与批处理 | student-safe | global,lab2 | 0.0223 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000036 | rCore Tutorial Guide | 实现特权级的切换/Trap 管理/Trap 上下文的保存与恢复 | student-safe | global,lab2 | 0.0216 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000134 | LearningOS 操作系统课程讲义源文件 | 第三讲 基于特权级的隔离与批处理/``Trap上下文存在哪？`` | student-safe | global,lab2 | 0.0216 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000034 | rCore Tutorial Guide | 实现特权级的切换/Trap 管理/Trap 上下文的保存与恢复 | student-safe | global,lab2 | 0.0214 |

---

## 验证阶段 · lab2-run

**学生消息**：我刚跑完 lab2 的验证命令，下面是输出

**阶段提示词源**：`tutor/prompts/lab2/stage-run.md`

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测三个关键输出，再运行 QEMU。只比较预测与实际的差异，帮助判断问题属于加载、trap 返回、系统调用还是调度。
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
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：64/100

**RAG 检索**：

- 候选：lexical=11，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000018 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/四、验证 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000000 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务 | student-safe | lab2 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000004 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.1 特权级与 trap | student-safe | lab2 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000014 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务四：教师发放的变体（若有） | student-safe | lab2 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000011 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务一：跑通 lab2 | student-safe | lab2 | 0.0224 |

---

## 排错阶段 · lab2-debug

**学生消息**：Yield round 只有 0 次，我猜是调度器没把任务标成 Ready

**阶段提示词源**：`tutor/prompts/lab2/stage-debug.md`

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab2 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000008 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.5 任务调度 | student-safe | lab2 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000016 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务四：教师发放的变体（若有）/B. debug：yield 只打一轮就关机 | student-safe | lab2 | 0.0231 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000001 | OS Lab 结构化概念与检查点 | 协作式轮转调度 | student-safe | lab2 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000015 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务四：教师发放的变体（若有）/A. fill：补全调度器 | student-safe | lab2 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000011 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务一：跑通 lab2 | student-safe | lab2 | 0.0224 |

---

## 复盘阶段 · lab2-reflect

**学生消息**：复盘：我独立判断了 sepc 推进，AI 提醒了栈切换，我用 trace 验证了

**阶段提示词源**：`tutor/prompts/lab2/stage-reflect.md`

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：storedStage=reflect，intent=reflection（gate=intent-routed）

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
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：55/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000005 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.2 上下文保存与恢复 | student-safe | lab2 | 0.0226 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000033 | rCore Tutorial Guide | 实现特权级的切换/用户栈与内核栈 | student-safe | global,lab2 | 0.0209 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000128 | LearningOS 操作系统课程讲义源文件 | 第三讲 基于特权级的隔离与批处理/第三节 实践：批处理操作系统/6. 内核程序设计 | student-safe | global,lab2 | 0.0209 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000037 | rCore Tutorial Guide | 实现特权级的切换/Trap 管理/Trap 分发与处理 | student-safe | global,lab2 | 0.0207 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000003 | OS Lab 结构化概念与检查点 | Trap 上下文保存与恢复 | student-safe | lab2 | 0.0205 |

---

## 迁移阶段 · lab2-transfer

**学生消息**：如果 sscratch 不换栈，任务切换还成立吗

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

设想不用 sscratch：trap 刚发生时 sp 仍属于谁？在保存任何通用寄存器前，哪一个寄存器还能临时借用而不破坏用户现场？先用这两个问题检查栈交换的必要性。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ❌ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ❌ |
| promptUsed | ❌ |

**综合分**：55/100

**RAG 检索**：

- 候选：lexical=18，vector=0，eligible=1243，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000006 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/二、背景知识/2.3 用户栈与内核栈：`sscratch` | student-safe | lab2 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab2:000013 | OS Lab 本地实验手册 | 实验 2：中断处理与多任务/三、实验任务/任务三：动手小修改 | student-safe | lab2 | 0.0224 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000130 | LearningOS 操作系统课程讲义源文件 | 第三讲 基于特权级的隔离与批处理 | student-safe | global,lab2 | 0.0223 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000036 | rCore Tutorial Guide | 实现特权级的切换/Trap 管理/Trap 上下文的保存与恢复 | student-safe | global,lab2 | 0.0221 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000134 | LearningOS 操作系统课程讲义源文件 | 第三讲 基于特权级的隔离与批处理/``Trap上下文存在哪？`` | student-safe | global,lab2 | 0.0220 |

---
