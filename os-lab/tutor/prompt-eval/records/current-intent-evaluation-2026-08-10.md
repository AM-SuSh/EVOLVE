# AI 导师意图路由更新后提问测试

## 测试基线

本轮沿用 SIZN 的两类测试资产：

- `7340a22` 中的 Tutor/RAG Harness fixture 与 Lab1-4 金标准对话，用于检查答案护栏、证据门控、RAG 权限和典型错误假设。
- `901b142` 中的 Prompt Eval 运行器与 Lab1-8 共 48 条固定提问，用于保留历史输入和结果口径。

当前架构另外使用 `cases-v3.json` 的 19 条意图语料，覆盖七类本轮意图、错误假设、直接索要答案、证据冲突和三组跨阶段同题。

## 可复现结果

| 测试 | 结果 | 能说明什么 |
| --- | --- | --- |
| Tutor Harness | 34/34 通过 | 意图、教学动作、答案护栏、证据白名单和跨阶段响应类别符合契约 |
| RAG Harness | 3/3 通过 | 知识条数、元数据、内容权限、Prompt 注入和检索诊断符合契约 |
| 意图/状态机/V3 评分单测 | 15/15 通过 | 七类意图、问题线程提示、阶段不变性和 V3 评分规则正常 |
| V3 离线全链路 | 19 条，综合 94 | 当前 `/chat` 的 intent 路由、RAG、护栏和离线兜底实际走通 |
| SIZN 旧 48 条语料重跑 | 48 条完成 | 同一批 Lab、消息和存储阶段可在 intent 模式下执行；因无模型凭证，本次回复均为离线兜底 |
| 全量 Node 测试 | 94/95 通过 | 唯一失败仍是 Lab7 工厂测试引用已迁移的旧学生文件，与导师更新无关 |

V3 离线全链路分项：

| 综合 | 问题相关 | 引导正确 | 必要解释 | 可执行 | 无泄漏 | 证据忠实 | 跨阶段一致 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 94 | 79 | 87 | 100 | 100 | 95 | 100 | 100% |

三组同题分别放在不同存储阶段时，`intent + actions + guardrail class` 完全一致，说明 `activeStage` 已不再改变回答策略。Tutor Harness 的答案泄漏率为 0、证据引用准确率为 1、无依据判断率为 0。

## 结果解释

这次不能把 94 与 SIZN 的历史 91 直接比较：

- SIZN 的 91 来自 `gpt-5.6-luna` 的 48 条真实模型回复，使用 V2 阶段评分。
- 本轮 94 来自 19 条离线兜底回复，使用 V3 意图与证据评分。
- 历史上游 `https://you.loveme.space/v1` 当前返回 401，本机没有可用 API key，因此没有生成新的真实模型 after 样本。
- 用旧 V2 规则给当前 48 条 intent 结果评分会把“未加载阶段 Prompt”和“未按阶段路由”各扣一项；该分数衡量的是旧架构相似度，不是当前教学质量。
- 旧 48 条语料没有显式 `focusTerms` 和期望意图，事后按 V3 重评分会让泛化回复虚高，因此不把该重评分当作改进证据。

## 暴露的问题

1. 离线兜底的问题相关性只有 79。8 条回复使用了正确意图，但没有提及学生问题的核心对象，例如入口地址、page fault、三级页表或 inode 链接计数。
2. 引导正确性为 87。`sepc` 特例给了连续两个问题；`code-reading-task` 被错误回答成 `sscratch` 栈交换，原因是特例正则中的 `sp` 会命中 `suspend_current_and_run_next` 内部的字母 `sp`。
3. V3 的“无泄漏 95”是评分误报，不是真实泄漏。护栏回复“不能交付可直接提交的完整实现”包含检测词“可直接提交”，被泄漏正则误判；人工核对和 Tutor Harness 均为零泄漏。
4. 旧 48 条问题暴露了意图分类覆盖不足：8 条历史 debug 提问中 7 条被判为 `concept`、1 条判为 `verification`；`make test-lab6/7/8` 的运行提问中 3 条被判为 `concept`；“pending 与 mask 的区别”被判为 `transfer`。当前 19 条 V3 语料尚未覆盖这些较含蓄的表达。

## 下一轮建议

1. 先补意图分类语料和规则：覆盖 `page fault`、`mismatch`、`不对`、`只有 0 次`、`make test-*`，并区分概念对比与条件迁移。
2. 修复离线兜底的 `sp` 子串命中，并让兜底回复带上安全截断后的问题锚点，避免上游故障时答非所问。
3. 收紧 V3 泄漏检测：拒绝句中的“完整实现/可直接提交”不能算泄漏，同时保留对真实代码块、patch 和肯定式交付话术的拦截。
4. 配置可用上游后，用同一模型、温度和 19 条 V3 语料至少运行 3 次；保留 before/after `raw.json`，报告均值、95% CI 和逐题正/平/负分布。

## 运行命令

```powershell
cd os-lab/handbook
npm run test:harness
npm run test:rag-harness
node --test ../tutor/prompt-eval/scoring-v3.test.mjs ../tutor/turn-policy.test.mjs ../tutor/state-machine.test.mjs

cd ../tutor/prompt-eval
node run-eval.mjs --tag current-intent-offline-2026-08-10 --records records/current-intent-offline-2026-08-10
node run-eval.mjs --tag current-intent-legacy-offline-2026-08-10 --corpus legacy-stage --records records/current-intent-legacy-offline-2026-08-10
```
