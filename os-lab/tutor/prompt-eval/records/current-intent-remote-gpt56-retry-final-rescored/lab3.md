# Lab3 内存与虚拟内存 Prompt 意图评测

- 评测标签：`eval-2026-08-10T08-18-11`
- 模式：`remote` / 模型：`gpt-5.6-luna`
- 上游：`http://127.0.0.1:9/v1`

## debug · debug-panic-orient

**学生消息**：cargo run 后出现 page fault panic，我该怎么定位？

**意图策略源**：`tutor/prompts/strategies/debug.md`

**意图策略正文**：

```text
# 本轮策略：调试分析

先回应现象最可能涉及的机制范围，并区分已知事实与待验证假设。把下一步收敛为一个可证伪假设和一个最小观察点，不凭空猜测修复结果。
```

**服务端路由**：storedStage=orient，intent=debug（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

`page fault panic` 只能说明硬件在地址转换或权限检查时异常，具体是映射缺失、权限不符，还是 trap 期间 `satp` 不对，当前证据尚不能区分；本次运行没有可用 Trace/诊断。先贴出 panic 附近的 `scause`、`stval`、`sepc` 和当前 `satp`，重点观察 `stval` 是否落在用户代码/栈/数据段；再对照 `loader.rs` 的映射范围与 `PTE_U/R/W/X`。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证 | student-safe | lab3 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0222 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000165 | 操作系统导论 OSTEP 中文核心章节 | 21.3 页错误 | student-safe | global,lab3 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000170 | 操作系统导论 OSTEP 中文核心章节 | 21.6 交换何时真正发生 | student-safe | global,lab3 | 0.0205 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0201 |

---

## debug · debug-panic-read

**学生消息**：cargo run 后出现 page fault panic，我该怎么定位？

**意图策略源**：`tutor/prompts/strategies/debug.md`

**意图策略正文**：

```text
# 本轮策略：调试分析

先回应现象最可能涉及的机制范围，并区分已知事实与待验证假设。把下一步收敛为一个可证伪假设和一个最小观察点，不凭空猜测修复结果。
```

**服务端路由**：storedStage=read，intent=debug（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

现在只能确认运行未通过，现有记录没有 panic 诊断或 Trace，不能直接断定是缺页、权限错误还是 `satp` 切换问题。先记录 trap 的 `scause`、`stval`、`sepc`，再用 `stval` 的虚拟页号检查当前 `satp` 页表是否有映射及 `PTE_V/R/W/X/U` 权限；页表查找遇到空项会返回 `None`。【kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073】

请贴出 panic 附近的这三个寄存器值和访问地址。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证 | student-safe | lab3 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0222 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000165 | 操作系统导论 OSTEP 中文核心章节 | 21.3 页错误 | student-safe | global,lab3 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000170 | 操作系统导论 OSTEP 中文核心章节 | 21.6 交换何时真正发生 | student-safe | global,lab3 | 0.0205 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0201 |

---

## debug · debug-panic-transfer

**学生消息**：cargo run 后出现 page fault panic，我该怎么定位？

**意图策略源**：`tutor/prompts/strategies/debug.md`

**意图策略正文**：

```text
# 本轮策略：调试分析

先回应现象最可能涉及的机制范围，并区分已知事实与待验证假设。把下一步收敛为一个可证伪假设和一个最小观察点，不凭空猜测修复结果。
```

**服务端路由**：storedStage=transfer，intent=debug（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

先把它当作“用户态访问时，硬件按当前 `satp` 查表失败或权限不符”的待验证假设；现有运行证据只有失败且无诊断/Trace，不能据此断定是缺映射还是 `U` 位错误。页表查找遇到空项会得到 `None`，而权限错误同样会触发异常。citekb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073

请只做一个最小观察：在 trap 入口打印 `scause`、`stval`、`sepc` 和当前 `satp`，并确认 fault 发生在切换到用户 `satp` 之后；根据 `scause` 区分 instruction/load/store page fault，再用 `stval` 对照用户地址映射。

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ❌ |
| singleQuestion | ✅ |
| lengthOk | ❌ |
| stageAdherence | ✅ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：100/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000015 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/四、验证 | student-safe | lab3 | 0.0224 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000014 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/提交清单（自查） | student-safe | lab3 | 0.0222 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000165 | 操作系统导论 OSTEP 中文核心章节 | 21.3 页错误 | student-safe | global,lab3 | 0.0221 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000170 | 操作系统导论 OSTEP 中文核心章节 | 21.6 交换何时真正发生 | student-safe | global,lab3 | 0.0205 |
| kb:rcore-tutorial-guide-web:v4:28461e2bf5cf:chunk:0000073 | rCore Tutorial Guide | 实现 SV39 多级页表机制（下）/多级页表实现/建立和拆除虚实地址映射关系 | student-safe | global,lab3 | 0.0201 |

---

## concept · topic-switch-page-table

**学生消息**：另一个问题：页表为什么要分三级？

**意图策略源**：`tutor/prompts/strategies/concept.md`

**意图策略正文**：

```text
# 本轮策略：概念理解

先用必要的最少解释回应学生所问的概念，明确关键边界或因果关系。若学生判断有误，直接指出具体错误及理由；随后只追问一个能暴露其理解依据的问题。
```

**服务端路由**：storedStage=debug，intent=concept（gate=intent-routed）

**模式/模型**：remote / gpt-5.6-luna

**AI 回复**：

三级页表主要是为了在“大虚拟地址空间”和“低内存开销”之间折中：每级只为实际用到的虚拟地址范围分配下一级页表，未使用的大段地址无需建立完整映射。Sv39 把虚拟页号拆成三级索引，硬件逐级查找；三级不是绝对要求，而是该 RISC-V 地址格式的设计选择。

思考：若改成单级页表，映射一个很小的用户程序，大约需要为多少个虚拟页预留表项？

**回复评分**：

| 检查项 | 结果 |
| --- | --- |
| hasQuestion | ✅ |
| singleQuestion | ✅ |
| lengthOk | ✅ |
| stageAdherence | ❌ |
| noLeak | ✅ |
| intentRoute | ✅ |
| promptUsed | ✅ |

**V3 综合分**：92/100

**RAG 检索**：

- 候选：lexical=40，vector=0，eligible=1239，fallback=无

**返回知识 chunk**：

| 引用 | 来源 | 章节 | 类别 | 覆盖 Lab | 检索分 |
| --- | --- | --- | --- | --- | --- |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000070 | 操作系统导论 OSTEP 中文核心章节 | 13.2 多道程序和时分共享 | student-safe | global,lab3 | 0.0209 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000013 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/三、实验任务/任务三：动手小修改 | student-safe | lab3 | 0.0207 |
| kb:platform-lab-manuals:v1:09d14ae6e45c:chunk:lab3:000016 | OS Lab 本地实验手册 | 实验 3：内存管理与虚存/五、AI 提问模板 | student-safe | lab3 | 0.0198 |
| kb:ostep-zh-local-complete:v7:705439d9075b:chunk:0000361 | 操作系统导论 OSTEP 中文核心章节 | 41.3 组织结构：柱面组 | student-safe | global,lab6 | 0.0196 |
| kb:learningos-os-lectures-source:v4:44f1d8b480ad:chunk:0000006 | LearningOS 操作系统课程讲义源文件 | 第一讲 操作系统概述 | student-safe | global,lab5 | 0.0193 |

---
