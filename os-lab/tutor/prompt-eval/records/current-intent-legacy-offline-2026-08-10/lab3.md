# Lab3 内存与虚拟内存 Prompt 分阶段评测

- 评测标签：`current-intent-legacy-offline-2026-08-10`
- 模式：`offline` / 模型：`offline-tutor`
- 上游：`http://127.0.0.1:9/v1`

## 定界阶段 · lab3-orient

**学生消息**：lab3 的页表太复杂了，我不会，给我讲讲分页到底怎么做的

**阶段提示词源**：`tutor/prompts/lab3/stage-orient.md`

**阶段提示词正文**：

```text
# 定界阶段

帮助学生把“不会写”改写成机制问题。先要求一条初始判断，再追问“开分页后为什么内核必须先有恒等映射，用户页为什么必须带 U 位”。不要进入具体 patch。
```

**服务端路由**：storedStage=orient，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab3 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=18，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000011 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务一：跑通 lab3 | student-safe | lab3 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证 | student-safe | lab3 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000016 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/五、AI 提问模板 | student-safe | lab3 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000003 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识 | student-safe | lab3 | 0.0222 |

---

## 阅读阶段 · lab3-read

**学生消息**：我认为恒等映射是关键，但没想清楚它为什么必须在开分页之前

**阶段提示词源**：`tutor/prompts/lab3/stage-read.md`

**阶段提示词正文**：

```text
# 阅读阶段

沿 `frame_alloc -> PageTable::find_pte -> MemorySet::map_area -> satp 切换` 追踪地址转换链。优先让学生把 VPN 拆分、PTE 布局和权限位分开解释，并定位证据所在文件。
```

**服务端路由**：storedStage=read，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab3 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000008 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.5 地址空间 MemorySet | student-safe | lab3 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000013 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务三：动手小修改 | student-safe | lab3 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000016 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/五、AI 提问模板 | student-safe | lab3 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000002 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/一、问题场景 | student-safe | lab3 | 0.0226 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0224 |

---

## 验证阶段 · lab3-run

**学生消息**：cargo run -p kernel --features lab3 --release 我跑完了

**阶段提示词源**：`tutor/prompts/lab3/stage-run.md`

**阶段提示词正文**：

```text
# 验证阶段

先让学生预测 QEMU 关键输出（Hello、幂结果、Yield×5、全部退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于加载、映射缺失、权限位还是 `satp` 切换。
```

**服务端路由**：storedStage=run，intent=verification（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 cargo run -p kernel --features lab3 --release，只比较对应断言或 Trace。

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

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证 | student-safe | lab3 | 0.0234 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0231 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000011 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务一：跑通 lab3 | student-safe | lab3 | 0.0229 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000008 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.5 地址空间 MemorySet | student-safe | lab3 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000016 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/五、AI 提问模板 | student-safe | lab3 | 0.0205 |

---

## 排错阶段 · lab3-debug

**学生消息**：用户程序一访问就 page fault，我猜是 PTE 少了权限位

**阶段提示词源**：`tutor/prompts/lab3/stage-debug.md`

**阶段提示词正文**：

```text
# 排错阶段

学生必须先提供精确现象、当前假设和能证伪它的最小实验。信息不足时只追问缺失项；信息充分后给一层检查路径，不直接修改完整代码。优先用去掉 `U` 位或关闭恒等映射等对照实验缩小范围。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

先回答你问到的边界：Lab3 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？

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

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000165 | 操作系统导论 OSTEP 中文核心章节 | 21.3 页错误 | student-safe | global,lab3 | 0.0226 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000072 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0221 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000064 | rCore Tutorial Guide | 实现 SV39 多级页表机制（上）/页表项的数据结构抽象与类型定义 | student-safe | global,lab3 | 0.0216 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000125 | 操作系统导论 OSTEP 中文核心章节 | 18.4 分页：也很慢 | student-safe | global,lab3 | 0.0209 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000165 | 深入理解计算机系统中文电子书 | 9.3 虚拟内存作为缓存的工具/9.3.4 缺页 | student-safe | global,lab3 | 0.0206 |

---

## 复盘阶段 · lab3-reflect

**学生消息**：复盘：我自己推了 VPN 拆分，AI 提醒了权限位，我用最小映射验证了

**阶段提示词源**：`tutor/prompts/lab3/stage-reflect.md`

**阶段提示词正文**：

```text
# 复盘阶段

要求学生分别写清独立形成的判断、AI 提供的关键提醒、用于验证的代码路径或运行输出。帮助压缩表达，但不要替学生虚构证据。
```

**服务端路由**：storedStage=reflect，intent=reflection（gate=intent-routed）

**模式/模型**：offline / offline-tutor

**AI 回复**：

复盘时要把结论和证据一一对应。先选 Lab3 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。

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

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000005 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/二、背景知识/2.2 Sv39 三级页表 | student-safe | lab3 | 0.0234 |
| kb:platform-lab-packages:v5:92a678d8eaae:chunk:0000007 | OS Lab 结构化概念与检查点 | Sv39 三级页表遍历 | student-safe | lab3 | 0.0226 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000125 | 操作系统导论 OSTEP 中文核心章节 | 18.4 分页：也很慢 | student-safe | global,lab3 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000127 | 操作系统导论 OSTEP 中文核心章节 | 18.5 内存追踪 | student-safe | global,lab3 | 0.0216 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000072 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0212 |

---

## 迁移阶段 · lab3-transfer

**学生消息**：如果第一级页表少一级，之前的判断还成立吗

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

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000100 | 操作系统导论 OSTEP 中文核心章节 | 16.2 我们引用哪个段 | student-safe | global,lab3 | 0.0218 |
| kb:csapp-gitbook-zh:v4:af3889c1b5c3:chunk:0000178 | 深入理解计算机系统中文电子书 | 9.7 案例研究：Intel Core i7 / Linux 内存系统/9.7.1 Core i7 地址翻译 | student-safe | global,lab3 | 0.0216 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000147 | 操作系统导论 OSTEP 中文核心章节 | 19.7 实际系统的 TLB 表项 | student-safe | global,lab3 | 0.0216 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000064 | rCore Tutorial Guide | 实现 SV39 多级页表机制（上）/页表项的数据结构抽象与类型定义 | student-safe | global,lab3 | 0.0212 |

---
