# AI Tutor Prompt Eval V3

本目录评估 AI 导师是否围绕学生**本轮问题**进行必要解释和引导，而不是检查回复是否符合人为划分的学习阶段。`orient/read/run/debug/reflect/transfer` 只作为存储阶段变量，用于跨阶段不变性实验，不再决定主评分。

## V3 要回答的问题

1. 学生在任意存储阶段提出同一问题，服务端是否识别为同一意图并采用同类教学动作？
2. 回复是否先回应当前问题，再给一个有价值的思考或验证动作？
3. 学生判断错误时，导师是否明确纠正并说明理由，而不是只反问或顺着错误判断？
4. 回复是否避免完整代码、可提交 patch 和替学生完成实验？
5. 涉及运行、诊断、Trace 或知识片段时，引用是否来自本轮白名单，是否避免虚构“已经通过”？

## V3 语料

`cases-v3.json` 包含 19 条固定用例，覆盖 Lab1-8 和七类本轮意图：

- `concept`、`code-reading`、`debug`、`verification`、`reflection`、`transfer`、`direct-answer`
- 错误假设、直接索要答案、换题、无证据、可信通过证据、学生说法与失败运行冲突
- 三组阶段不变性用例：同一个概念、调试或验证问题分别种在不同阶段，期望 `intent + actions + guardrail class` 保持一致

旧的 48 条“8 Lab x 6 阶段”语料仍可通过 `--corpus legacy-stage` 运行，只用于历史对照，不作为当前架构的主验收集。

## V3 主评分

单条综合分是下列六项的等权平均：

| 指标 | 检查内容 |
| --- | --- |
| `questionRelevance` | 服务端意图正确，回复覆盖问题的核心机制 |
| `guidanceCorrectness` | 引导话术与动作适合该意图 |
| `necessaryExplanation` | 不是只抛问题，包含形成判断所需的解释 |
| `actionability` | 至多推进一个可执行的阅读、判断或验证动作 |
| `noLeak` | 不泄漏完整实现、可提交 patch 或大段代码 |
| `evidenceFidelity` | 引用均在本轮白名单内，不虚构可信结论 |

`questionCount`、`textLength` 和代码行数仍记录在 diagnostics 中，但不参与主分。V3 不检查阶段关键词，也不因为出现“判断、运行、复盘”等词自动加分。

历史备注：早期 C3 阶段状态机配套的通用 `tutor/harness.mjs`（主指标 `questionRelevance` / `guidanceActionAccuracy` / `answerLeakageRate` / `evidenceCitationAccuracy` / `stageInvarianceRate`）已随 stage 兼容路由一并移除；输出护栏的回归用例现位于 `tutor/output-guard.test.mjs`。

## 运行

离线全链路，不需要模型：

```powershell
cd os-lab/tutor/prompt-eval
node run-eval.mjs --tag offline-v3
```

真实 OpenAI-compatible 上游：

```powershell
node run-eval.mjs --tag remote-v3 `
  --upstream https://<upstream>/v1 --model <model> --api-key <key>
```

真实上游的连接建立超时默认是 30 秒，可用 `--connect-timeout-ms <ms>` 覆盖；默认离线地址仍使用 500ms，避免离线回归等待。接口地址必须指向实际 OpenAI 兼容 API（通常以 `/v1` 结尾），不能只填写会返回 HTML 首页的站点根地址。

真实评测遇到 HTTP `429/5xx`、空正文或生产链路 `mode=offline` 时最多退避重试 3 次；每条主结果和消融基线都会记录 `attempts`。护栏回复不重试，最终仍为 offline/error 的条目不得计入真实模型结论。

增加 `--ablate` 后，对比“完整意图策略”和“无意图策略基线”。基线只保留 system、Lab 上下文、证据权限与 RAG，不再保留阶段 gate/actions，因此是架构变量更清楚的对照。

输出目录：

```text
records/<tag>/
  raw.json
  summary.md
  scorecard-v3.md
  scorecard-v3.json
  ablation-v3.json       # 仅 --ablate
  lab1.md ... lab8.md
```

## 可复现重放

每条新记录保存：

- system、Lab 和意图策略文件的 SHA-256
- 运行时策略状态摘要的 SHA-256
- 每个召回 chunk 的完整文本与 SHA-256
- 框架版本、路由模式、模型、回复、检索元数据和 V3 分项

评测启动时复制 `learning/os-lab.db` 和 `learning/knowledge/knowledge.db` 到临时目录，检索日志不会写入真实知识库。

重放默认写入源记录旁的新时间戳目录，不覆盖原始结果：

```powershell
node run-eval.mjs --replay records/remote-v3/raw.json
node run-eval.mjs --replay records/remote-v3/raw.json --records records/replay-explicit
```

新记录优先使用 `raw.json` 中冻结的 chunk 文本重算，避免当前 `knowledge.db` 变化后分数漂移。旧 V2 记录没有文本快照时才回退到当前知识库。

## 8 月 9 日实验与当前方向的差异

8 月 9 日更新增加了评测基础设施，但没有改变生产回答架构。该实验的 48 条问题与阶段人工配对，并在数据库中预置目标阶段；所谓“无阶段 Prompt”仍保留了 `tutorPolicyPrompt()` 的阶段、gate 和必须动作，因此不是严格的无阶段架构。

已有结果应这样解释：

- 问题质量逐条比较：阶段 Prompt 赢 7 条，无阶段 Prompt 赢 10 条。
- V2 平均差为 `5.56`，95% CI 为 `-0.60..12.11`，不能证明阶段 Prompt 稳定更好。
- 优势主要来自阶段关键词分；事后移除 `stageScore` 后，阶段 Prompt 平均差为 `-1.83`。
- 原语料没有测试“任意阶段提出同一问题”，因此不能证明阶段路由适合真实学生提问。

V3 的变化不是简单删除阶段词，而是把实验问题改成：导师是否回答了学生正在问的内容、是否采取正确引导、是否泄漏答案、是否忠实使用证据，以及回答策略是否不受存储阶段干扰。

## 后续实验原则

- 一次只改一个策略变量，保留 before/after 的 `raw.json` 与 Prompt 哈希。
- 先看分项和失败用例，再看综合分；离线回复只验证链路，不代表真实模型质量。
- RAG 引用按“使用了外部事实时必须合法引用”评估，不把固定引用率作为目标。
- 反思和迁移属于教学策略，不把“阶段动作块”塞进知识 chunk；知识库保存可核验的课程事实与来源。
- 真实 A/B 至少多次采样并报告均值、置信区间和正/平/负分布；抽样人工复核错误假设、证据冲突和答案泄漏用例。
