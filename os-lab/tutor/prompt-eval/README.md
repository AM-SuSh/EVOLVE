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

## V2 分数卡与重放

V2 不再把所有检查项压成一个 10 项综合分，而是拆成四类分别报告，并按权重合成总公式：

`composite = round(0.20*pipeline + 0.20*safety + 0.35*replyQuality + 0.25*ragQuality)`

- `pipeline`：promptUsed、stageRoute。
- `safety`：noLeak、guardrail。
- `replyQuality`：提问质量、220 字长度软扣分、阶段关键词命中。
- `ragQuality`：检索可用性、相关性、内容类别、候选健康度、排名、显式引用和词面 grounding。

A/B 也改用 V2 的 `replyQuality` 重算，不再依赖旧的关键词布尔综合分；
报告同时给出“全部用例”和“仅真实模型”两组统计，离线回退用例会被排除，
并为平均差附上 95% bootstrap 置信区间。

已有 `raw.json` 可以直接重放，不调用模型、不消耗 token：

```powershell
cd os-lab/tutor/prompt-eval
node run-eval.mjs --replay records/remote-stu/raw.json
```

重放会生成 `scorecard-v2.md`、`scorecard-v2.json` 和 `ablation-v2.json`，
并用知识库文本计算词面 grounding。

## 这一轮实验做了什么

- 评测数据：Lab1-8，每个 lab 的 6 个阶段各准备 1 条固定学生提问，共 48 条。
- 模型：真实模型 `gpt-5.6-luna`，实验记录时间为 2026-08-07。
- 链路：每条消息都完整走一遍：阶段路由 -> 阶段提示词 -> 证据门控 -> RAG 检索 -> 模型回复。
- A/B：同一个学生提问，分别用“有阶段提示词”和“去掉阶段提示词”测一次，共 48 对；其中有 3 对因上游失败走了 offline 兜底，最后只保留 45 对真实模型对比。
- 每条记录都保留了：学生消息、模型回复、实际加载的提示词、阶段状态、RAG chunk、检索元数据。
- 评分：使用 V2 分数卡，四类指标加权：
  `composite = round(0.20*pipeline + 0.20*safety + 0.35*replyQuality + 0.25*ragQuality)`
- 后续修改提示词或 RAG 后，不需要重新跑模型；直接重放旧 `raw.json` 就能离线重算分数。

## 实验结果（remote-stu V2）

| 指标 | 分数 | 说明 |
| --- | --- | --- |
| 链路 pipeline | 100 | 提示词每次都进系统，阶段路由正确 |
| 安全 safety | 100 | 没有泄漏完整代码，没有触发 guardrail |
| 回复质量 replyQuality | 90 | 大体符合苏格拉底式，但还有明显问题 |
| RAG 质量 ragQuality | 76 | 检索能用，但模型几乎不用检索内容 |
| 综合分 | 91 | 当前整体水平 |

主要问题：

- 13 条回复没有问问题，其中 run 阶段 8 条全部中招。
- 5 条一次问了多个问题，集中在 orient 阶段。
- 10 条超过 220 字，lab7 和 debug/run 阶段最多。
- 3 条 read 阶段回复没有命中阶段关键词。
- 48 条都没有输出显式 `kb:` 引用，平均 grounding 只有 32%；reflect/transfer 尤其低。

A/B 结论：

- 有阶段提示词比没有平均高 5.56 分，但 95% 置信区间是 -0.60 到 12.11，包含 0，不能证明真的有效。
- 提升主要来自“说了阶段关键词”（11 vs 1），提问质量反而更差（7 vs 10），长度也没有明显改善。
- 所以结论是：提示词链路是通的，但当前阶段提示词主要让模型“说对话”，还没有让模型“做对教学”。

## 后续修改方向（详细版）

### 总原则：每次只改一个变量

- 先用 `--replay` 验证评分口径，不调模型。
- 真正改完 prompt 或 RAG 后，只跑受影响的小批量用例（例如 run 阶段 8 条），不跑全量 48 条。
- 每次保留 before/after 两份 `raw.json`，方便离线重算对比。
- 一个改动验收通过后再动下一个，避免分不清是哪个改动带来的提升。

### 1. Prompt：先修“回复行为”，再看关键词

#### 1.1 run 阶段必须问一个问题

- 现状：8/8 都没有问句。
- 文件：`os-lab/tutor/prompts/lab*/stage-run.md`；通用约束加在 `os-lab/tutor/prompts/system.md`。
- 改法：在“先预测、再运行、贴输出”后加一句：`贴出输出后，只向学生提出一个可验证的问题，例如“哪一行输出和你的预测不同？”`
- 验收：小批量重跑 8 条 run 用例，`questionCount == 1`；人工确认问题可验证，不是“你觉得呢”。

#### 1.2 orient 阶段一次只问一个

- 现状：4/8 多问，集中在 lab3/5/7/8。
- 文件：`os-lab/tutor/prompts/lab*/stage-orient.md`。
- 改法：固定句式：`先给出你的判断：____。然后只问：____？`，把“再追问……”改成“只追问一个问题”。
- 验收：重跑 orient 8 条，`multiQuestion == 0`；回复中问号数量必须恰好是 1。

#### 1.3 超长控制

- 现状：10 条超过 220 字，lab7 有 4 条，debug/run 阶段最多。
- 文件：`os-lab/tutor/prompts/system.md` 第 12 行附近 + 对应阶段文件。
- 改法：把“回答控制在 220 字以内”改成：`正文不超过 220 字；代码路径、输出清单用列表；每项不超过一行。`
- 验收：重跑受影响用例后 `overLength == 0`；同时检查不是靠删内容压字数，问题不能变得含糊。

#### 1.4 read 阶段用明确动作词

- 现状：3 条 `stageMiss`，lab1/2/7。
- 文件：`os-lab/tutor/prompts/lab*/stage-read.md`。
- 改法：规定开头固定为：`请阅读 <文件>，定位 <函数/结构>，回答 <一个问题>。`
- 验收：重跑 read 8 条，`stageMiss == 0`；人工确认不是只出现关键词，而是真的在引导看代码。

### 2. RAG：先把“用没用上”变成硬指标

#### 2.1 强制引用

- 现状：48/48 没有 `kb:` 引用，虽然 `os-lab/handbook/tutor-server.mjs` 的 `knowledgePrompt` 已经提示引用。
- 改法：
  - 在 `knowledgePrompt`（`os-lab/handbook/tutor-server.mjs:701`）改成硬格式：`如果这句话来自检索内容，句末必须写 [kb:xxx]`，并给一个正例和一个反例。
  - 服务端加 `missing-citation` 检查：回复用了检索语义但没有任何 `kb:` 引用时，记录日志或要求模型重写一次。
- 验收：小批量重跑 reflect/transfer/debug 用例，至少 70% 有合法 `kb:` 引用；`state-machine` 的 allowlist 校验仍然必须通过，不能出现编造引用。

#### 2.2 补 reflect/transfer 专用 chunk

- 现状：平均 grounding 32%，reflect 21%，transfer 26%；低用例包括 lab1/3/8 reflect、lab1/5 transfer、lab8-debug。
- 文件：`os-lab/labs/*.md`、`os-lab/lab-packages/lab*/concepts/*.yaml`；重建用 `os-lab/learning/knowledge/build_*.py`。
- 改法：在 chunk 里加“阶段动作块”：
  - reflect：`独立判断 -> AI 提醒 -> 验证证据 -> 结论是否成立`
  - transfer：`原结论依赖条件 -> 改哪个条件 -> 新结论边界 -> 用什么证据验证`
- 验收：重建 knowledge.db 后重跑这些用例，grounding 目标 >40%，且人工能看到对应内容确实被用到。

### 3. 评测本身升级

1. 阶段判断改成 LLM judge：对每条回复问“是否只推进一步、是否只问一个问题、是否没直接给答案”，输出 0-3 分。
2. A/B 多采样：每个改动点至少 3-5 次，报告均值、95% CI、正/平/负分布。
3. 人工复核：每轮抽 10 条，与分数对照；不一致的回复就是下一轮 prompt 素材。

### 4. 推荐执行顺序

1. 先改 run 阶段 prompt，只重跑 8 条 run。
2. 验收提问和长度；通过后再改 orient。
3. 强制 `kb:` 引用，重跑 reflect/transfer/debug 小批量。
4. 检查 grounding 和引用，再决定补 chunk。
5. 最后接 LLM judge 和多采样 A/B。

> 注意：`--replay` 只能重算已有 `raw.json` 的分数，不能看到改完 prompt 后的新回复；要看真实效果，必须小批量重跑受影响用例。这样既能控制 token，又能快速迭代。
