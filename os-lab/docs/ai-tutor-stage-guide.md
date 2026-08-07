# AI 导师阶段配置与引导设计指南

本文面向维护 OS Lab AI 导师的教师和开发者，说明教学阶段如何流转、各层 Prompt 如何组合、修改时应编辑哪些文件，以及如何验证调整没有破坏证据门控和答案保护。

> 学生端不展示 `stage`、`gate`、`hintLevel`、`actions`、`evidenceRefs` 等内部状态。它们仍由服务端维护并注入模型上下文，用来约束回答；前端只展示自然语言对话和学生可执行的操作。

## 1. 一轮对话如何形成

```text
学生消息 + 当前 Lab + 工作区事件/可信运行
  -> handbook/tutor-server.mjs
  -> learning/db.mjs 读取会话阶段和提示等级
  -> tutor/state-machine.mjs 决定阶段、门控和动作
  -> system + Lab context + stage prompt + evidence policy + RAG
  -> 上游模型
  -> enforceTutorOutput() 校验答案泄漏和非法证据引用
  -> 返回学生对话，同时持久化内部 TutorState
```

权威状态由服务端生成，不能让模型自行声称“进入下一阶段”或“验证已通过”。

## 2. 当前六个教学阶段

| 阶段 ID | 教学目标 | 进入下一步的主要依据 | 默认引导动作 |
| --- | --- | --- | --- |
| `orient` | 把“不会做”收敛为问题、初始判断和不确定点 | 学生给出自己的判断或观察 | `ask-for-judgment` |
| `read` | 沿调用链或数据流定位源码和不变量 | 打开源码、指出函数/状态/位置 | `request-source-evidence` |
| `run` | 用可信运行验证预测，不凭退出码猜测 | 服务端保存的 `run_finished` 与断言 | `request-trusted-run` |
| `debug` | 用“现象 -> 假设 -> 最小实验 -> 证据 -> 结论”排错 | 保存修改、诊断、失败/回归运行 | `request-falsifiable-hypothesis` |
| `reflect` | 区分学生判断、AI 帮助和客观证据 | 复盘和实验报告提交 | `ask-causal-explanation` |
| `transfer` | 改变条件后重新解释机制 | 带预测和验证方法的迁移回答 | `ask-transfer-question` |

基础阶段目录和允许转换定义在 `tutor/baseline.mjs`。真正决定每一轮是否转换的是 `tutor/state-machine.mjs` 中的 `decideTutorTurn()`。

## 3. 文件职责

### 3.1 阶段和门控规则

| 文件 | 职责 | 适合修改的内容 |
| --- | --- | --- |
| `tutor/baseline.mjs` | 阶段清单、允许的下一阶段、退出证据目录 | 阶段拓扑和证据契约 |
| `tutor/state-machine.mjs` | 运行时状态转换、门控、提示升级、输出保护 | 什么时候进入 read/run/debug/reflect，动作名称，L0-L4 推进条件 |
| `tutor/state-machine.test.mjs` | 状态机单元测试 | 每个新门槛、转换和提示等级的正反例 |
| `learning/db.mjs` | 保存 `current_stage`、`hint_level` 和证据摘要 | 状态持久化字段，不负责教学话术 |
| `handbook/tutor-server.mjs` | 身份校验、取证、调用状态机、拼装 Prompt、调用模型 | 阶段白名单、Prompt 优先级、服务端返回契约 |

`decideTutorTurn()` 返回的内部 `TutorState` 主要字段：

```text
stage          当前阶段
previousStage  上一阶段
gate           本轮门控结论
hintLevel      当前提示等级（0-4）
actions        本轮模型必须执行的教学动作
evidenceRefs   本轮允许引用的 run/event/trace
toolContext    最近运行、诊断数量、Trace 数量摘要
```

### 3.2 Prompt 层次和覆盖顺序

| 文件/目录 | 作用 |
| --- | --- |
| `tutor/prompts/system.md` | 全局教学边界、回答风格、答案保护 |
| `tutor/prompts/<lab>/context.md` | 当前 Lab 的机制、允许讨论范围、验证标准 |
| `tutor/prompts/stages/stage-*.md` | 六个阶段的通用引导策略 |
| `tutor/prompts/<lab>/stage-*.md` | 某个 Lab 对某阶段的专属覆盖 |
| `tutor/prompts/guardrails.yaml` | 直接索要答案、参考实现等请求的硬拒绝规则 |
| `lab-packages/<lab>/variants/<type>/manifest.yaml` | 单个任务的目标、埋点、成功标准和提示阶梯 |

阶段 Prompt 的选择规则在 `handbook/tutor-server.mjs` 的 `frameworkFor()`：

1. 若存在 `tutor/prompts/<lab>/stage-<stage>.md`，使用 Lab 专属版本。
2. 否则回退到 `tutor/prompts/stages/stage-<stage>.md`。
3. 再叠加服务端生成的证据门控 Prompt 和本轮允许的知识库片段。

因此，只改阶段 Markdown 会改变“怎么说”，不会改变“什么时候进入这个阶段”；阶段转换必须修改状态机。

### 3.3 前端和学生可见内容

| 文件 | 职责 |
| --- | --- |
| `handbook/.vitepress/theme/components/LabWorkspace.vue` | 发送 `labId/stage/message/evidenceRefs`，接收并保存服务端状态 |
| `handbook/.vitepress/theme/components/TutorPane.vue` | 学生对话窗口；不展示内部 TutorState |
| `handbook/.vitepress/theme/components/TutorMessage.vue` | 消息正文、复制按钮、知识来源图标 |
| `handbook/.vitepress/theme/tutor-model.ts` | 前端类型、快捷提问和离线回退文案 |

`tutor-model.ts` 中仍保留 `TutorState` 类型，是因为前端需要把状态随会话恢复并传回服务端；保留数据不等于向学生展示。

## 4. 如何调整阶段流转

### 4.1 修改现有阶段的进入条件

例：希望学生在 `read` 阶段不仅打开源码，还必须提交一个检查点答案后才能进入 `run`。

1. 在 `tutor/state-machine.mjs` 的 `read` 分支修改条件，不要只修改 Prompt。
2. 使用服务端证据摘要中的结构化字段，避免只靠学生自然语言声称“我看过了”。
3. 为缺失条件定义清晰的 `gate` 和 `action`，例如 `missing-checkpoint-answer`、`request-checkpoint-answer`。
4. 在 `tutorPolicyPrompt()` 中继续把新动作交给模型执行。
5. 在 `state-machine.test.mjs` 增加“没有证据不能推进”和“证据齐全可以推进”两条测试。
6. 如需前端自然语言提示，将 action/gate 的教师可读说明写进本文或教师后台，不恢复学生端内部状态条。

### 4.2 调整提示等级 L0-L4

当前等级含义：

| 等级 | 目标 | 允许的帮助 |
| --- | --- | --- |
| L0 | 观察复现 | 要求先运行并记录现象 |
| L1 | 提出假设 | 帮助形成可检验假设 |
| L2 | 最小实验 | 帮助设计对照或证伪实验 |
| L3 | 对比路径 | 指向相关调用链和状态写入 |
| L4 | 升阶边界 | 停止继续泄露，转教师短辅导 |

通用升级逻辑位于 `tutor/state-machine.mjs`：只有学生明确请求提示时才递增，最高到 L4。通用名称位于 `handbook/.vitepress/theme/tutor-model.ts` 的 `TUTOR_HINT_LADDER`，单任务具体话术位于 variant manifest 的 `hint_ladder`。

调整时应同时检查：

- 是否仍然只在明确请求提示时升级。
- 是否保留 L4 上限。
- 是否会因刷新或新会话错误继承旧等级。
- `hint_requested` 事件是否记录正确等级。
- 量规中的 `maxHintLevel` 是否仍能反映学生依赖程度。

### 4.3 新增一个阶段

新增阶段的影响面较大，至少同步：

1. `tutor/baseline.mjs`：阶段、允许转换和退出证据。
2. `tutor/state-machine.mjs`：决策分支和默认动作。
3. `handbook/tutor-server.mjs`：`stageIds` 白名单和阶段 Prompt 加载。
4. `handbook/.vitepress/theme/tutor-model.ts`：`TutorStageId`、阶段元数据、资源映射和离线回退。
5. `tutor/prompts/stages/stage-<id>.md`：通用阶段 Prompt。
6. 需要专属策略的 `tutor/prompts/<lab>/stage-<id>.md`。
7. `tutor/state-machine.test.mjs`、baseline 测试和 Harness fixture。
8. 数据库中已有会话的兼容回退；未知阶段必须回到 `orient`。

除非新增阶段有独立证据门槛和明确教学目标，否则优先扩展现有阶段，而不是增加状态数量。

## 5. 如何设计引导话术

每一轮只推进一个主要动作，推荐结构：

```text
1. 复述学生已经提供的事实，不补造运行结果。
2. 指出当前判断缺少哪一类证据。
3. 提出一个可执行问题或最小实验。
4. 告诉学生应观察什么，不提前给出最终代码。
```

### Orient

- 把宽泛问题改写为一个机制问题。
- 要求学生先给判断和依据。
- 不讨论具体 patch。

### Read

- 指定入口或模块，不替学生总结整个文件。
- 每次追问输入、状态变化、输出、不变量中的一个。
- 要求指出文件、函数或关键字段。

### Run

- 先让学生预测关键输出，再执行可信命令。
- 只根据服务端 run 和断言判断是否通过。
- 退出码 0 不能替代行为断言。

### Debug

- 固定使用“精确现象 -> 可证伪假设 -> 最小实验 -> 证据 -> 结论”。
- 优先区分不同原因，不直接指出修复行。
- 学生保存修改后必须要求回归运行。

### Reflect

- 分开记录“我的判断 / AI 提醒 / 验证证据”。
- 要求解释断言证明了什么，而不是只写“测试通过”。

### Transfer

- 只改变一个关键条件。
- 要求先预测，再说明验证方式。
- 不把原题复述视为迁移能力。

## 6. Lab 专属调整示例

以 Lab2 debug 为例：

- 机制范围写在 `tutor/prompts/lab2/context.md`。
- 通用排错纪律写在 `tutor/prompts/stages/stage-debug.md`。
- Lab2 专属排错路径写在 `tutor/prompts/lab2/stage-debug.md`。
- `yield` 埋点、成功断言和 L0-L3 任务提示写在 `lab-packages/lab2/variants/debug/manifest.yaml`。
- “运行失败进入 debug、回归通过进入 reflect”由 `tutor/state-machine.mjs` 决定。

若只想改变 Lab2 的提问方式，应优先改 `lab2/stage-debug.md`；若想改变所有 Lab 的 debug 方法，改共享 `stage-debug.md`；若想改变进入 debug 的条件，改状态机。

## 7. 回归验证

从 `os-lab/handbook` 目录执行：

```powershell
node --test ../tutor/state-machine.test.mjs
npm run test:rag-harness
npm test
npm run build
```

修改阶段或动作后，还应更新 `tutor/fixtures/harness-cases-v1.json`：

- `allowedStages`：允许状态机落在哪些阶段。
- `requiredActions`：本轮必须包含哪些教学动作。
- `forbiddenPatterns`：禁止出现的完整答案、越权结论或错误引导。

最低验收标准：

- 没有可信 run 时，导师不能声称通过。
- 失败 run 能进入 debug，保存修改后要求回归。
- 提示等级不超过 L4。
- 直接索要完整实现仍触发 guardrail。
- 模型只能引用本轮允许的证据和知识块。
- 学生端不显示内部阶段、门控、证据摘要和提示等级。

## 8. 维护原则

1. 状态机决定“何时推进”，Prompt 决定“如何引导”，manifest 决定“这个任务具体提示什么”。
2. 学生自然语言可以辅助判断，但“已运行、已通过、已提交”必须来自服务端证据。
3. 不在多个文件复制同一套完整话术；通用策略放 shared stage，Lab 差异放 Lab override，任务细节放 manifest。
4. 每次调整至少增加一个正例和一个反例测试。
5. 内部状态可供教师审计和评分使用，但不直接暴露给学生。

