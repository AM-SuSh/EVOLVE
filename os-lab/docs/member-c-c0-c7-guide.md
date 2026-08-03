# 成员 C：AI 导师 C0-C7 完成情况与使用指南

本文说明成员 C 在 AI 导师方向完成的 C0-C7 工作、目前可以从哪里查看，以及哪些能力已经完成后端闭环但还没有接入前端页面。

## 1. 先说结论：前端能看到什么

当前前端可以直接体验 AI 导师的核心学习过程和可信运行证据，但 **C0-C7 并非每一项都有独立页面**。

| 能力 | 前端位置 | 当前状态 |
| --- | --- | --- |
| 引导式学习入口 | `/guide/ai-tutor` | 可见，可选择已开放的 Lab |
| Lab 学习工作台 | 从学习入口进入已解锁的 Lab，例如 `/learn/lab2` | 可见 |
| AI 导师对话 | 工作台右下角的 AI 图标 | 可见；点击后打开对话窗，导师会根据阶段和证据继续追问 |
| 可信运行结果 | 工作台下方的“终端”页签 | 可见 |
| 编译诊断 | 工作台下方的“Problems”页签 | 可见，可跳回源码位置 |
| Trace 查询与回放 | 工作台“学习支持”区的“Trace”页签 | 可见，可查看 Trap 时序和任务时间线 |
| 教师发布与课程配置 | 教师账号登录后进入 `/guide/ai-tutor`，查看教师工作区 | 可见 |
| 学生报告验收与反馈 | `/teacher-review` | 可见，但这是已有的报告反馈页面 |
| C4 评价与掌握画像 | 暂无专门页面 | 后端接口已完成 |
| C5 证据评分复核队列 | 暂无专门页面 | 后端接口已完成；现有 `/teacher-review` 尚未接入该队列 |
| C6 Lab Factory | 暂无创建、校验、测试、发布页面 | 后端流水线已完成 |
| C7 试用分析与备份 | 暂无分析和运维页面 | 后端接口及 CLI 已完成 |

特别注意：`/teacher-review` 当前读取的是 `/teacher/reports`，用于查看学生报告并反馈；C5 新增的量规评分复核队列使用 `/teacher/reviews` 和 `/teacher/review`，两者不是同一套数据，暂时不能在现有页面操作 C5 队列。

## 2. 如何启动并查看前端

在两个 PowerShell 终端中分别运行：

```powershell
cd os-lab/handbook
npm run tutor
```

```powershell
cd os-lab/handbook
npm run dev
```

默认地址如下：

- 前端：`http://localhost:5173/`
- AI 导师服务：`http://127.0.0.1:8787/`

如果 `5173` 已被占用，Vite 会显示实际使用的新端口。Tutor 服务默认允许本机开发端口访问。

### 学生查看路径

1. 打开前端并注册学生账号，填写班级。
2. 登录后进入 `/guide/ai-tutor`。
3. 选择教师已经开放、并且当前已解锁的 Lab。
4. 点击右下角 AI 图标打开导师，提交判断、问题和复盘。默认窗口停靠在右侧；桌面端可拖动图标、窗口和左右/底边握把，刷新后会保留对话、位置与尺寸。
5. 在下方“终端”运行受信命令；失败诊断进入 “Problems”。
6. 运行产生教学 Trace 后，在“学习支持”区进入 “Trace”查看 Trap 时序或任务时间线。
7. 在 Trace 中检查事件会形成 `trace_inspected` 学习事件，可作为后续评价证据。

### 教师查看路径

1. 使用教师账号登录。开发环境预置账号为 `admin/admin123`，首次使用后应立即修改密码。
2. 进入 `/guide/ai-tutor` 查看实验开放、学生进度、变体分配和导师配置。
3. 进入 `/teacher-review` 查看学生提交的报告并填写报告反馈。

当前教师前端还不能处理 C5 的自动评价复核队列，也不能操作 C6/C7。相关后端能力见第 5 节。

## 3. AI 导师核心数据闭环

成员 C 的核心工作不是只做一个聊天窗口，而是让导师的动态引导建立在可审计的学习过程上：

```text
学生提问、保存代码、回答检查点
              |
              v
结构化学习事件 + 服务端可信运行 + Trace 制品
              |
              v
服务端状态机判断当前阶段和缺少的退出证据
              |
              v
AI 导师只执行当前阶段允许的教学动作
              |
              v
Rubric v2 评价 + 概念掌握画像
              |
              v
命中风险门控时进入教师复核队列并保留审计记录
```

这套设计解决三个问题：

1. **学习过程可记录**：记录提问、提示、保存、运行、诊断、Trace 检查、反思和迁移回答，而不只记录最终答案。
2. **证据有可信等级**：学生自述不能替代服务端运行结果；Trace 必须绑定可信 run，并经过哈希、数量和事件顺序校验。
3. **导师具有动态性但不失控**：动态性来自“当前阶段 + 已有证据 + 尚缺证据”，不是让模型自行决定学生是否完成，也不能由模型绕过状态门控。

## 4. C0-C7 分阶段完成情况

### C0：冻结基线与契约

- 定义 `orient -> read -> run/debug -> reflect -> transfer` 学习阶段。
- 定义阶段之间允许的转移和必须满足的退出证据。
- 区分服务端权威、服务端校验、可信运行绑定、学生自述和教师权威证据。
- 定义 `harness-case-v1` 样本格式，为后续离线回归提供稳定输入。

主要文件：

- `os-lab/tutor/C0-BASELINE.md`
- [`../tutor/baseline.mjs`](../tutor/baseline.mjs)
- [`../tutor/schema/harness-case-v1.schema.json`](../tutor/schema/harness-case-v1.schema.json)

### C1：可信 Trace 证据链

- 从可信运行输出中采集结构化 Trace，并将制品哈希、事件数和路径绑定到 run。
- 提供 `GET /runs/:id/trace` 分页查询。
- 查询时重新验证路径边界、文件大小、SHA-256、JSON、事件结构、序号单调性和事件总数。
- 前端 Trace Viewer 查询成功后记录 `trace_inspected`，使“看过运行机制”成为可审计证据。

主要文件：

- [`../tutor/trace-store.mjs`](../tutor/trace-store.mjs)
- `os-lab/handbook/.vitepress/theme/components/TraceViewer.vue`
- [`../handbook/.vitepress/theme/composables/useTracePlayback.ts`](../handbook/.vitepress/theme/composables/useTracePlayback.ts)

### C2：AI 导师离线回归 Harness

- 建立不依赖在线模型的回归 Harness。
- 用多轮 fixture 检查阶段是否正确、教学动作是否合规、回复是否出现越权代写或无证据放行。
- 汇总通过率、阶段准确率、动作召回率和禁用模式命中等指标。
- 可通过 `npm run test:harness` 单独运行。

主要文件：

- [`../tutor/harness.mjs`](../tutor/harness.mjs)
- [`../tutor/harness-cli.mjs`](../tutor/harness-cli.mjs)
- [`../tutor/fixtures/harness-cases-v1.json`](../tutor/fixtures/harness-cases-v1.json)

### C3：服务端导师状态机与证据门控

- 把阶段推进权从前端和 LLM 收回服务端。
- 每次对话根据历史事件计算当前阶段、缺失证据和允许的教学动作。
- LLM 只能生成当前阶段允许的表达，不能自行跳阶段或宣告完成。
- 工作台附件将 `run:`、`trace:`、`diag:` 作为结构化 `evidenceRefs` 提交；服务端逐条校验当前账号与 Lab，伪造其他学生 runId 直接拒绝。
- AI 回复中的证据引用必须出现在服务端白名单中；出现越权引用时丢弃原回复并返回安全追问。
- 新增迁移阶段提示词，并将服务端状态返回前端用于持续交互。

主要文件：

- [`../tutor/state-machine.mjs`](../tutor/state-machine.mjs)
- [`../tutor/evidence-refs.mjs`](../tutor/evidence-refs.mjs)
- `os-lab/tutor/prompts/stages/stage-transfer.md`
- [`../handbook/tutor-server.mjs`](../handbook/tutor-server.mjs)

### C4：证据驱动评价 v2 与掌握画像

- `POST /assessment` 根据指定学习 session 的真实事件和可信 runs 生成评价。
- Rubric v2 含 14 个细项，区分过程、结果、反思，并为评分项附带 `event:`、`run:` 等证据引用。
- 无证据的项目保持“未观察”，不会由 LLM 建议补成确定分数。
- `GET /mastery` 返回按概念聚合的掌握状态、误区、提示等级、置信度和最近评价引用。

主要文件：

- [`../learning/rubric-v2.mjs`](../learning/rubric-v2.mjs)
- [`../learning/mastery.mjs`](../learning/mastery.mjs)
- [`../learning/db.mjs`](../learning/db.mjs)

### C5：教师复核队列与审计

- 评价完成后自动执行 hard/soft 复核门控。
- 满分但过程证据极弱、运行断言可疑、反思没有证据引用、多次触发护栏仍获高分、学生申诉等情况进入队列。
- `GET /teacher/reviews` 查询队列，`POST /teacher/review` 提交确认或修正。
- 修正不会覆盖原自动评分；系统保留原结果、教师决定、理由、证据引用、修正版和 revision，便于审计。

主要文件：

- [`../learning/review-gates.mjs`](../learning/review-gates.mjs)
- `os-lab/learning/teacher-review-gates.md`
- [`../learning/db.mjs`](../learning/db.mjs)

### C6：Lab Factory 校验、试运行与发布

- 校验 Lab package 的元数据、任务、检查点、量规和制品引用。
- 在临时目录生成脚手架并执行 dry run，避免修改真实学生工作区。
- 执行测试并生成有 ID 的测试记录；发布必须引用成功的 test run，并要求教师显式批准。
- 发布生成不可变 release 目录和 `published.json` 索引，内容同步流程优先读取已发布版本。
- 提供 `lint`、`dry-run`、`test`、`publish` CLI；发布回归会用临时测试账号实际领取变体并核对文件来源。

主要文件：

- [`../handbook/lab-factory.mjs`](../handbook/lab-factory.mjs)
- [`../handbook/lab-factory-cli.mjs`](../handbook/lab-factory-cli.mjs)
- [`../lab-packages/published.json`](../lab-packages/published.json)
- [`../scripts/scaffold.mjs`](../scripts/scaffold.mjs)

### C7：匿名试用分析、校准与备份恢复

- 按学生和 Lab 聚合可信完成、提示依赖、护栏触发、评价与复核数据。
- 默认只导出聚合结果；参与者明细只有达到最小 cohort 要求时才允许输出，并移除用户名、班级、消息正文、命令、路径和原始时间戳。
- 使用 20 条人工标注轨迹进行离线校准，将建议阈值从 70 调整为 76；该阈值只供教师分析，不控制 Lab 解锁或最终成绩。
- 使用 SQLite 在线 backup API 创建一致性快照，同时生成 SHA-256、migration 和表行数 manifest。
- 恢复要求离线执行和显式 `--confirm`，覆盖前先保留旧库回滚副本。

主要文件：

- [`../learning/trial-operations.mjs`](../learning/trial-operations.mjs)
- [`../learning/trial-cli.mjs`](../learning/trial-cli.mjs)
- [`../learning/calibration-policy-v1.json`](../learning/calibration-policy-v1.json)
- [`deployment-and-recovery.md`](deployment-and-recovery.md)

边界说明：仓库没有伪造真人试用结果。当前校准数据是 20 条教学专家构造并人工标注的轨迹；真实学生招募、知情同意、迁移题和延迟测仍需线下执行。

## 5. 暂无前端页面的能力如何检查

以下接口都由 Tutor Server 提供，并要求对应的学生或教师登录身份。

| 身份 | 方法与路径 | 用途 |
| --- | --- | --- |
| 学生 | `POST /assessment` | 为 `sessionId + labId` 生成 Rubric v2 评价并执行复核门控 |
| 学生 | `GET /mastery` | 查看当前账号的概念掌握画像 |
| 教师 | `GET /teacher/reviews?status=pending` | 查看待复核评价 |
| 教师 | `POST /teacher/review` | 提交确认/修正、理由与证据引用 |
| 教师 | `GET /teacher/lab-factory?labId=lab3` | 查看 Lab Factory 状态 |
| 教师 | `POST /teacher/lab-factory/validate` | 校验并 dry run Lab package |
| 教师 | `POST /teacher/lab-factory/test` | 执行隔离测试并取得 `testRunId` |
| 教师 | `POST /teacher/lab-factory/publish` | 引用成功测试并显式批准发布 |
| 教师 | `GET /teacher/trial/analysis` | 获取匿名聚合分析 |
| 教师 | `POST /teacher/trial/backup` | 创建学习数据库一致性备份 |

接口的完整贯通示例已经写入 [`../handbook/tutor-server.smoke.mjs`](../handbook/tutor-server.smoke.mjs)，它覆盖 chat 证据归属、学生评价、掌握画像、教师复核、Lab 发布与测试账号领取、匿名分析和在线备份。

Lab Factory CLI 示例：

```bash
npm run lab-factory -- lint lab3
npm run lab-factory -- dry-run lab3 --variant debug
npm run lab-factory -- test lab3 --variant debug --author teacher
npm run lab-factory -- publish lab3 --test-run-id <id> --teacher teacher --approval-note "测试通过，批准发布"
```

Day7 完整演示步骤见 [`day7-demo-runbook.md`](day7-demo-runbook.md)；工程与 CI 共用 `npm run test:day7`。

C7 也可以直接使用 CLI：

```powershell
cd os-lab/handbook

# 重跑 20 条标注轨迹的阈值校准
node ../learning/trial-cli.mjs calibrate

# 默认写入 learning/exports 下的匿名聚合分析
node ../learning/trial-cli.mjs analyze

# 创建在线一致性备份
node ../learning/trial-cli.mjs backup

# Tutor Server 停止后，显式恢复到目标数据库
node ../learning/trial-cli.mjs restore <backup.db> <target.db> --confirm
```

## 6. 验证结果与本地提交

C0-C7 完成后已经执行：

```text
npm test            41/41 通过
npm run test:smoke  通过
npm run build       通过
```

对应本地提交如下，均未推送到 GitHub：

| 节点 | Commit | 内容 |
| --- | --- | --- |
| C0 | `3c40f0a` | 冻结 AI 导师状态、证据与 Harness 基线 |
| C1 | `ee02f3c` | 打通可信 Trace 查询与观察证据链 |
| C2 | `880f5e8` | 建立 AI 导师离线回归 Harness 与指标 |
| C3 | `cfe515b` | 实现服务端导师状态机与证据门控 |
| C4 | `5adbe1d` | 上线证据驱动评价 v2 与掌握画像 |
| C5 | `55a0b00` | 完成教师复核队列与评分修正审计 |
| C6 | `32f2d89` | 实现 Lab 校验、试运行与版本发布流水线 |
| C7 | `16a0d5f` | 完成试用分析校准与备份恢复闭环 |

这些提交的 author 仅为项目作者本人，没有 `Co-authored-by`，也没有执行远程 push。

## 7. 下一阶段前端接入建议

建议按以下顺序补齐页面：

1. **C5 教师复核队列**：风险最高、教师必须参与，而且后端契约已稳定。可扩展 `/teacher-review`，但应把“报告反馈”和“量规复核”做成两个清晰页签。
2. **C4 学生评价与掌握画像**：在工作台增加“评价/掌握”视图，展示分项、证据引用、未观察项、概念状态和是否待教师复核。
3. **C6 Lab Factory**：在教师工作区增加 package 状态、Validate、Test、Approve/Publish 流程，并明确展示 test run 和 release 版本。
4. **C7 分析与运维**：增加聚合指标页面；备份可提供创建和 manifest 查看，恢复仍建议保留为离线 CLI，避免在线覆盖正在使用的数据库。

C0 和 C2 属于工程契约与回归基础设施，本身不需要做成用户页面；C1/C3 已经通过现有工作台参与用户交互。
