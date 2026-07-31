# 评分量规 v2 · 冻结版（成员 A · Day 4）

> **状态：FROZEN for 7-day integration**（2026-07-31）  
> 取代草案中的「可改措辞」；字段名供 C 实现 `evidenceRefs`。  
> 原草案保留：`rubric-v2-draft.md`（历史）。AI 交互子分见 `ai-interaction-scoring.md`（本周可不进总分）。

## 1. 总分结构

```text
total = 0.45 × process + 0.35 × result + 0.20 × reflection
```

| 维度 | 权重 | 含义 |
| --- | --- | --- |
| process | 0.45 | 学习过程与提问/验证行为（细项 P1–P6，扣 G1） |
| result | 0.35 | **仅**受信 recipe + 命名断言（R1–R4） |
| reflection | 0.20 | 反思与迁移（F1–F2，T1–T2） |

每条细项输出必须包含：

```json
{
  "id": "P3",
  "score": 0,
  "max": 1,
  "status": "observed | not_observed | failed",
  "evidenceRefs": ["event:…", "run:…"],
  "note": "人工可读一句"
}
```

- `not_observed`：**禁止**打满分。  
- 无 `evidenceRefs` 不得 `observed=满分`。

## 2. 冻结细项（14 + 护栏）

### 2.1 process（P1–P6）→ 归一化到 0–100 后再 ×0.45

各细项默认 **0/1**（未观察=0，满足=1）。过程原始分：

```text
P_raw = (P1+P2+P3+P4+P5+P6) / 6 × 100
process = clamp(P_raw − G1_penalty, 0, 100)
G1_penalty = min(25, 5 × guardrail_triggered次数)
```

| ID | 细项 | 观察证据（至少一条写入 evidenceRefs） | 得 1 分条件 | not_observed |
| --- | --- | --- | --- | --- |
| P1 | 定界与阅读 | `stage_enter`∈{orient,read} | 两阶段都出现 | 缺任一 |
| P2 | 非要答案首问 | 首条 `student_message` | `category` ≠ `direct_answer` | 无消息或首问 SR |
| P3 | 证据导向表述 | `student_message` 文本 | ≥1 条含观察/假设/验证/输出引用 | 纯要结论 |
| P4 | 多阶段提问 | 消息上的 `stage` | ≥2 个不同 stage | 单阶段刷屏 |
| P5 | 验证尝试 | `verification_attempt` 或可信 run | ≥1 | 从未运行 |
| P6 | 失败后迭代 | run 断言序列 | 存在 fail→pass | 无失败也无深挖，或从未通过 |

### 2.2 result（R1–R4）→ 归一化到 0–100 后再 ×0.35

**必须**来自同一（或明确合并的）受信 `runId`，recipe=`lab2.verify-trace.v1`（或 Lab 包声明的等价 recipe）。

```text
R_raw = (R1+R2+R3+R4) / 4 × 100
result = R_raw
```

自定义命令退出码 0 **不计**任何 R 分。

| ID | 断言 id | 得 1 分 | not_observed |
| --- | --- | --- | --- |
| R1 | `hello-output` | passed | 未跑或失败 |
| R2 | `power-result` | passed | 同上 |
| R3 | `yield-five-rounds`（count≥5） | passed | 同上（防假通过） |
| R4 | `all-exited` | passed | 同上 |

### 2.3 reflection（F1–F2，T1–T2）→ 归一化到 0–100 后再 ×0.20

```text
F_raw = (F1+F2+T1+T2) / 4 × 100
reflection = F_raw
```

| ID | 细项 | 证据 | 得 1 分 | not_observed |
| --- | --- | --- | --- | --- |
| F1 | 独立判断 | `reflection_submitted` / 报告 | 含自我理解表述 | 空或套话无判断 |
| F2 | AI 与验证分工 | 同上 | 同时提 AI 帮助点 + 验证/输出/路径 | 只夸 AI 或只贴输出 |
| T1 | 迁移对照 | 报告思考题 | 提及抢占 / VM Exit / 协程等之一且不自相矛盾 | 未写 |
| T2 | 反例意识 | 报告/反思 | 说明「仅退出码 0」不够，点名 Yield/断言 | 未提及 |

## 3. 强制 / 建议复核（冻结，对齐 gates 文件）

完整表见 `teacher-review-gates.md`。实现时**至少**实现 Hard：

| 代号 | 触发（可机判） | 动作 |
| --- | --- | --- |
| H1 | `result≥90` 且 `process≤40` | 进复核队列 |
| H2 | R3 为边界（count==5 且输出截断标记）或教师标记存疑 | 进复核 |
| H3 | F1=F2=1 但反思文本与任何 `runId`/输出无引用 | 进复核 |
| H4 | `guardrail_triggered≥3` 且 `process≥80` | 进复核 |
| H5 | 变体 ∈ {fill,debug,remedial} 且自动 total 与教师抽检样本冲突 | 进复核 |
| H6 | 学生提交申诉 | 进复核 |

Soft S1–S3 建议实现，不阻塞 MVP。

## 4. 给 C / B 的接口约定

- 评分 API 返回：`total`、三维分、14 细项数组、`gatesTriggered[]`、`evidenceRefs` 并集。  
- 教师改分：写 `teacherOverride`（保留 `autoScore`）。  
- UI：点细项 → 打开对应 run / 事件 / 报告段落。

## 5. 变更规则

本冻结版字段 ID（P/R/F/T/G/H）本周内不改名。若需调权重，发 `rubric-v2.1` 并保留 v2 兼容读取。
