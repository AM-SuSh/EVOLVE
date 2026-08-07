# Lab1-8 Prompt 分阶段评测

这个目录用来检验 `tutor/prompts/lab1..lab8` 的提示词是否真正进入 AI 导师的完整回答链路，
以及各阶段回复质量、RAG 检索质量和知识引用情况。

## 评测什么

- **提示词是否被使用**：每个 lab 每个阶段请求 `/chat` 后，从响应里的 `framework.layers` 检查
  阶段层是否指向 `tutor/prompts/<lab>/stage-<stage>.md`（lab 定制）或
  `tutor/prompts/stages/stage-<stage>.md`（通用兜底）。
- **阶段路由**：种子会话状态到目标阶段后，服务端状态机是否停在目标阶段并应用对应阶段提示词。
- **回复质量**：是否有反问、是否单一问题、是否控制在 220 字内、是否贴合当前阶段策略、
  是否泄漏完整代码/可提交 patch。
- **RAG 质量**：检索是否可用（eligible/lexical/vector 候选数、fallbackReason）、
  返回 chunk 是否限定在本 lab 或 global 范围、内容类别是否只含 `student-safe`/`guided-hint`。
- **A/B 提升（需真实模型）**：同一学生消息分别用「完整框架（含阶段提示词）」和
  「去掉阶段提示词的基线」直接调用模型，比较两份回复的评分差。

## 评分公式

单条用例综合分（0-100）：`composite = round(通过检查项数 / 10 × 100)`，10 项为：

1. 提示词命中（promptUsed）：框架阶段层指向 lab 定制或通用兜底阶段提示词
2. 阶段路由（stageRoute）：`tutorState.stage` 等于目标阶段
3. 有反问（hasQuestion）：回复含 `？` 或 `?`
4. 单一问题（singleQuestion）：问号数量 ≤ 1
5. 220字内（lengthOk）：回复长度 ≤ 220
6. 阶段贴合（stageAdherence）：命中该阶段特征词
7. 无泄漏（noLeak）：不含完整代码/可直接提交/diff --git，代码块行数 ≤ 12
8. RAG 相关（knowledgeRelevant）：chunk 覆盖本 lab 或 global
9. RAG 类别（knowledgeClassesOk）：chunk 全为 `student-safe`/`guided-hint`
10. RAG 可用（retrievalOk）：`eligibleChunks > 0` 且无 `fallbackReason`

按 Lab/阶段汇总：`综合分 = round(组内用例 composite 平均值)`；
单项百分比 = 该组通过项数 ÷ 用例数 × 100%。

A/B 对比（`ablation.md`）：
`quality = round((hasQuestion + singleQuestion + lengthOk + stageAdherence + noLeak) / 5 × 100)`，
`差值 = 有提示词 quality - 无提示词 quality`。A/B 只用 5 项回复质量，不含提示词命中/阶段路由/RAG。

## 怎么跑

### 离线链路基线（不需要模型，立即可跑）

```powershell
cd os-lab/tutor/prompt-eval
node run-eval.mjs --tag offline-baseline
```

脚本会自己拉起一个独立 `tutor-server` 实例（独立端口、临时 DB 和临时数据目录，
知识库复用真实的 `learning/knowledge/knowledge.db`），注册一次性评测账号，
逐条发送 48 个用例，并把结果写到：

```text
os-lab/tutor/prompt-eval/records/<tag>/
  summary.md      # 汇总评分表与结论
  lab1.md ... lab8.md
  raw.json        # 原始响应，供复查
```

### 真实模型全链路 + A/B（需要可访问的 OpenAI-compatible 上游）

```powershell
node run-eval.mjs --tag remote-<model> `
  --upstream https://<你的上游>/v1 --model <model> --api-key <key> --ablate
```

- `--ablate` 会对每个用例额外做一次“有阶段提示词 / 无阶段提示词”的直接模型对比。
- 如果只想先跑真实模型链路、暂不做 A/B，去掉 `--ablate` 即可。
- 也可以用 `OS_LAB_LLM_BASE_URL` / `OS_LAB_LLM_MODEL` / `OS_LAB_LLM_API_KEY`
  环境变量代替三个参数。

## 用例结构

每个用例：`labId` + `stage` + 一条贴合该 lab/该阶段的学生消息。
`orient` 消息刻意不包含“我认为/我猜”等判断词；`read` 消息包含判断但不包含源码特征词，
避免状态机提前跳阶段；`debug`/`reflect`/`transfer` 用例会先在临时 DB 里种子对应运行证据
（失败运行 / 可信运行），确保阶段提示词能稳定命中。

## 已知限制

- 离线模式下回复来自服务端 `offline-tutor` 兜底，能验证“提示词是否进入框架、阶段与 RAG 是否工作”，
  但不能代表真实模型质量；真实质量与 A/B 提升必须接上游模型后重跑。
- 当前临时 DB 是复制正式 `learning/os-lab.db` 生成，不会写入真实会话；知识库检索日志会写入
  真实 `knowledge.db`（与现有 tutor-server 行为一致）。
