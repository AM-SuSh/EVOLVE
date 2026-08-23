# 评分量规 v2 草案（可观察细项）

> 成员 A · M0 Day1。  
> 现行实现：`learning/rubric.mjs`（过程 45% / 结果 35% / 反思 20%，偏关键词与计数）。  
> **本文件只定教学细项与证据字段**，不在 Day1 替换线上 `rubric.mjs`（由 C 后续挂接 event-v2 / run-result）。  
>  
> **7 日计划 Day4 冻结版**：请改看 [`rubric-v2-frozen.md`](./rubric-v2-frozen.md)（含 evidenceRefs 约定与 H1–H6 机判触发）。本文保留为草案历史。

## 权重建议（与现网兼容）

| 维度 | 权重 | 说明 |
| --- | --- | --- |
| process | 0.45 | 阶段覆盖、提问质量、假设—证据链、验证次数与多样性 |
| result | 0.35 | **仅**受信 recipe + 断言通过；自定义命令退出码 0 不计满分 |
| reflection | 0.20 | 独立判断 / AI 角色 / 验证引用三者可检 |

## 可观察细项（12 项）

| ID | 维度 | 细项 | 如何观察（证据字段） | 满分条件（草案） | 「未观察到」 |
| --- | --- | --- | --- | --- | --- |
| P1 | process | 进入定界与阅读 | `stage_enter` ∈ {orient, read} | 两阶段都出现 | 缺阶段 |
| P2 | process | 非要答案首问 | 首条 `student_message.category` ≠ direct_answer | 首问为概念/现象/追因等 | 首问要完整答案 |
| P3 | process | 证据导向表述 | 消息含观察/假设/验证用语或引用输出 | ≥1 条 | 纯要结论 |
| P4 | process | 多阶段提问 | 不同 `stage` 上均有学生消息 | ≥2 个阶段 | 单阶段刷屏 |
| P5 | process | 验证尝试 | `verification_attempt` 或绑定 `runId` 的 run 事件 | ≥1 | 从未运行 |
| P6 | process | 失败后迭代 | 先有未通过断言/失败 run，后有通过 | 存在 fail→pass 序列 | 一次碰运气通过或从未失败也从未深挖 |
| R1 | result | Hello 断言 | run assertion `hello-output` | passed | 未跑或失败 |
| R2 | result | Power 断言 | `power-result` | passed | 同上 |
| R3 | result | Yield×5 断言 | `yield-five-rounds`（count≥5） | passed | **关键**：防止 debug 未修却「退出码通过」 |
| R4 | result | 全退出断言 | `all-exited` | passed | 同上 |
| F1 | reflection | 独立判断 | `reflection_submitted` 含自我理解表述 | 命中 | 空反思 |
| F2 | reflection | AI 与验证分工 | 反思同时提及 AI 帮助点 + 验证/输出/代码路径 | 两类都有 | 只夸 AI 或只贴输出 |
| T1 | reflection | 迁移对照 | 报告/反思含抢占、VM Exit 或协程等对照之一 | 命中且不自相矛盾 | 未写迁移 |
| T2 | reflection | 反例意识 | 能说明「仅退出码 0」为何不够 | 点名 Yield/断言 | 未提及 |

> 第 6–7 周起细项由 12 扩至 **14**（+T1/T2）。标注集见 `traces-lab2-mock.json`（20 条）。强制复核见 `teacher-review-gates.md`。

### 护栏

| ID | 说明 | 处理 |
| --- | --- | --- |
| G1 | `guardrail_triggered` | 每次扣分，设上限（与现网一致：5 分/次，帽 25） |

## 与 Lab2 知识点挂钩

| 细项 | 主要 concept |
| --- | --- |
| R1–R2, P5 | os.trap.syscall-abi |
| R3–R4, P6 | os.sched.* |
| P2–P4, F1–F2 | 元认知 / 全概念 |

## 人工校准说明

对 `traces-lab2-mock.json` 中 10 条轨迹按上表打分；标出「现启发式会高估/低估」的案例，供 C 实现 v2 时对照。
