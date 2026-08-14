# 双 Agent 苏格拉底复盘实施过程

本文记录“日常答疑闭环 + 实验结束复盘闭环”的分阶段实现、验证结果和本地提交，确保设计设想与实际代码状态一致。

## 设计基线

- Tutor 日常优先解决学生当前问题；只在疑问基本闭合时选择性进行一次理解检查，不逐轮机械追问。
- Assessment 汇总 Tutor 对话、提示使用、工作区操作、可信运行、诊断、Trace、检查点和报告内容，生成 3-5 题复盘计划。
- 实验结束后由 Tutor 逐题执行计划；全部自适应追问也计入 5 题上限。
- 报告正文保留，“收获与反思”改为专门复盘对话区；学生完成逐题回答后，服务端根据首答、追问修正、证据与迁移表现自动形成反思评价，不再要求另写最终总结。
- 教师端不再把“评分复核”作为独立工作流；自动评分、报告与复盘证据统一进入“实验验收”，由教师作最终验收决定。
- 实验状态为 `working -> verification_passed -> review_ready -> review_planning -> review_active -> review_completed -> report_submitted -> lab_completed`。`awaiting_evidence` 与 `deferred` 仅保留旧数据兼容，不再作为新复盘的正常分支。

## 当前统一验收口径

本节是当前产品与文档的权威口径；后文各阶段仍保留当时的实现记录，不表示教师端继续保留多个并行验收入口。

1. **一个提交对象**：学生答完 3-5 题即完成复盘，回答质量只影响反思评分。点击“提交给老师”后，报告正文与附件、苏格拉底复盘 transcript、逐题 Assessment 评价、系统生成的作答表现总结及证据引用一次性提交。
2. **一个教师入口**：教师从“实验验收”进入统一队列。复盘进行中或已完成但尚未联合提交时教师不可见；队列只读取正式报告提交记录及其绑定的复盘。
3. **中栏合并阅读**：选中学生后，中栏连续展示报告正文、附件和完整复盘记录，包括问题、学生原答、评价、遗漏点、正确推理、作答表现总结、 transcript 与 Tutor 日常对话证据。
4. **右栏评分与验收**：右栏展示服务端自动评分、评分细项和 `evidenceRefs`，并提供教师最终分与验收建议。自动评分保持只读，是验收依据而不是最终结论；教师的最终验收记录追加保存并形成审计记录。
5. **兼容而不分流**：历史 `automaticResult`、复核决定和相关服务端接口继续保留，避免破坏既有记录与审计链。旧 `/guide/teacher-report` 页面只作为兼容说明并引导到 `/teacher-review`，不再承载第二套评分复核流程。
6. **解锁与验收分离**：下一 Lab 只要求教师已开放、上一 Lab 可信验证通过、上一 Lab 报告与复盘已联合提交；不要求教师先完成最终验收，也不要求复盘后重新运行或满足时间间隔。

## 阶段计划

1. 建立概念目录、复盘领域契约和数据库持久化。
2. 实现 Assessment Agent、全过程证据聚合和复盘计划生成。
3. 实现 Tutor 日常追问节流和苏格拉底复盘编排 API。
4. 将前端固定反思文本框替换为复盘对话区，并生成报告章节。
5. 统一完成状态、教师可见记录、端到端测试和技术文档。
6. 执行全量回归、构建和真实服务验收。
7. 根据学生端实测修复题目重复、澄清后提前终止、评价不可操作、延期报告不可提交和教师队列不可见问题。

## 实施总账

本闭环以 `5450314` 为开发前基线，从 `881881e` 到 `8feab4b` 连续完成 7 次本地提交。以下统计直接来自 Git 提交记录，不只计算最后一次修复。

| 阶段 | 提交 | 日期 | 实际提交统计 |
| --- | --- | --- | --- |
| 1 · 领域底座 | `881881e feat(review): establish socratic review domain foundation` | 2026-08-12 11:05 | 10 files，+801 / -1 |
| 2 · Assessment Agent | `7b5843d feat(assessment): generate evidence-backed review plans` | 2026-08-12 11:13 | 6 files，+646 / -3 |
| 3 · Tutor 编排与 API | `1c39192 feat(tutor): orchestrate throttled checks and socratic reviews` | 2026-08-12 11:42 | 12 files，+982 / -15 |
| 4 · 前端复盘与报告 | `06daeb8 feat(workbench): replace freeform reflection with review dialogue` | 2026-08-12 11:57 | 9 files，+1015 / -109 |
| 5 · 生命周期与教师可见性 | `8977d70 feat(lifecycle): enforce reviewed completion and teacher visibility` | 2026-08-12 12:33 | 11 files，+562 / -22 |
| 6 · 契约收口 | `723aca3 feat(contracts): close authoritative review lifecycle` | 2026-08-12 13:10 | 9 files，+147 / -47 |
| 7 · 实测可用性修复 | `8feab4b fix(review): make Socratic feedback actionable and teacher-visible` | 2026-08-12 16:32 | 13 files，+1006 / -87 |

- 阶段提交累计：7 commits、70 次文件变更记录、+5159 / -284。
- 相对开发前基线的最终净变化：36 个唯一文件、+5091 / -216。累计值包含同一文件在多个阶段的反复演进，因此高于最终净变化。
- 本次历史补账属于纯文档归档提交，不作为新的功能实现阶段，也不计入上述 7 次实现提交统计。
- 覆盖范围：概念目录、Assessment Agent、Tutor 答疑节流、复盘状态机、服务端权威事件、SQLite 持久化、学习访问门禁、报告模板、学生复盘 UI、教师验收 UI、JSON Schema、单元测试、行为 harness、HTTP smoke 和本 process 文档。

### 累计文件索引

- 领域与数据：`lab-packages/lab1/lab.yaml`、`lab-packages/lab1/concepts/boot.yaml`、`lab-packages/lab1/checkpoints.yaml`、`learning/concept-catalog.mjs`、`learning/review-contracts.mjs`、`learning/assessment-agent.mjs`、`learning/db.mjs`、`learning/access.mjs`、`learning/report-template.mjs`、`learning/trial-operations.mjs`。
- Tutor 与契约：`handbook/tutor-server.mjs`、`tutor/baseline.mjs`、`tutor/contracts.mjs`、`tutor/turn-policy.mjs`、`tutor/state-machine.mjs`、`tutor/schema/assessment-review-plan-v1.schema.json`、`tutor/schema/event-v2.schema.json`。
- 学生与教师前端：`handbook/.vitepress/theme/components/LabWorkspace.vue`、`ReportPanel.vue`、`SocraticReviewPanel.vue`、`TeacherPublishPanel.vue`、`TeacherReview.vue`、`handbook/.vitepress/theme/report-template.ts`、`handbook/.vitepress/theme/tutor-model.ts`。
- 测试与工程：`learning/concept-catalog.test.mjs`、`assessment-agent.test.mjs`、`socratic-review-db.test.mjs`、`access.test.mjs`、`report-template.test.mjs`、`tutor/baseline.test.mjs`、`contracts.test.mjs`、`turn-policy.test.mjs`、`state-machine.test.mjs`、`handbook/tutor-server.smoke.mjs`、`handbook/package.json`、`docs/process/socratic-review-implementation.md`。

## 实施记录

### 阶段 1：领域底座

- 状态：完成
- 目标：以 `lab-packages` 为单一事实源加载 Lab1-Lab8 概念、可信断言、误区和检查点；定义 2-5 题复盘计划契约；增加可审计复盘数据表。
- 主要修改：
  - 新增 Lab1 教学规格、概念和检查点，使 Lab1-Lab8 都能进入统一概念目录。
  - 新增 `learning/concept-catalog.mjs`，从 Lab package 加载概念、断言映射、误区、源码锚点和通过条件。
  - 新增 `learning/review-contracts.mjs`，约束 2-5 题计划、题型和回答评价。
  - 新增 `socratic_reviews`、`socratic_review_turns`、`mastery_observations` 及事务 CRUD。
  - 新增概念目录与复盘数据库测试。
- 验证：`node --test ../learning/concept-catalog.test.mjs ../learning/socratic-review-db.test.mjs`。
- 实际变更范围：Lab1 教学规格 3 个 YAML；`learning/concept-catalog.mjs`、`review-contracts.mjs`、`db.mjs` 及对应测试；测试脚本和本 process 文档，共 10 个文件，+801 / -1。
- 本地提交：`881881ec91fc22c75b2c9b4ce522b78dcc83f6d0 feat(review): establish socratic review domain foundation`。

### 阶段 2：Assessment Agent 与全过程证据

- 状态：完成
- 主要修改：
  - 新增独立 `learning/assessment-agent.mjs`，使用独立 Prompt 和严格 JSON 输出生成复盘计划、评价复盘回答。
  - 证据 bundle 同时纳入完整 Tutor 会话快照、学生/AI 事件、提示、代码操作、诊断/Trace、可信运行、报告正文、Rubric 和 mastery。
  - 复盘计划默认 3 题、允许 2-5 题，并为动态追问保留总计 5 题的上限。
  - 所有 `conceptId` 和 `evidenceRefs` 经过当前 Lab 概念与证据白名单校验；远程模型失败或伪造引用时确定性降级。
  - 实现类概念缺少对应可信通过 run 时，口头回答最多进入 `needs-evidence`。
  - 新增可版本化 JSON Schema 和 Assessment Agent 回归测试。
- 验证：`node --test ../learning/assessment-agent.test.mjs ../learning/concept-catalog.test.mjs`，6 项通过。
- 实际变更范围：`learning/assessment-agent.mjs` 及测试、复盘契约、Assessment 计划 JSON Schema、测试脚本和本 process 文档，共 6 个文件，+646 / -3。
- 本地提交：`7b5843db0533eb78eef1b82c7bd7a1d81af63c86 feat(assessment): generate evidence-backed review plans`。

### 阶段 3：Tutor 编排与复盘 API

- 状态：完成
- 主要修改：
  - 日常 Tutor 只在已有解释、学生明确表示理解、同一主题未检查过且通过冷却窗口时追加一次理解检查；学生回应后立即关闭该检查，不形成连续追问。
  - `/chat` 的护栏、远程、流式和离线返回统一写入服务端权威 `student_message` / `ai_response` 事件，并保存可跨设备恢复的完整对话快照。
  - 新增 `GET /learning/review`、`POST /learning/review/start`、`/answer`、`/resume`、`/summary`，由服务端校验学生归属、可信验证、逐题顺序、回答不可覆盖和五题总上限。
  - 复盘启动时使用独立 Assessment 配置综合对话、工作区事件、可信运行、诊断/Trace、报告和 mastery；回答不完整时最多增加一次有边界的动态追问，缺运行证据时进入 `awaiting_evidence`。
  - 新增 `review_started`、`review_question_asked`、`review_answer_submitted`、`review_answer_evaluated`、`review_completed` 事件；浏览器不能伪造这些服务端事件。
  - 远程 Assessment 的 `passed` 不能覆盖可信运行要求；完成后保存不可变问答 transcript 和复盘 mastery observations。
- 验证：
  - `node --test learning/assessment-agent.test.mjs learning/socratic-review-db.test.mjs tutor/turn-policy.test.mjs tutor/contracts.test.mjs`，27 项通过。
  - `npm run test:smoke`，真实 HTTP/SSE/运行/评价/报告链路通过；确认两轮 Tutor 问答生成 4 条服务端权威事件。
- 实际变更范围：Tutor 服务与 smoke、Assessment 和数据库编排、事件契约与 Schema、日常追问策略及其测试、本 process 文档，共 12 个文件，+982 / -15。
- 本地提交：`1c39192daac802b14bddb658703901b534e8ebb6 feat(tutor): orchestrate throttled checks and socratic reviews`。

### 阶段 4：前端复盘对话与报告 transcript

- 状态：完成
- 主要修改：
  - 新增 `SocraticReviewPanel.vue`，在报告工作区中按服务端状态显示一个当前问题，支持刷新恢复、回答评价、`awaiting_evidence`、`deferred`、最终总结和完成记录。
  - 复盘进度固定显示“第 n / 最多 5 题”；未完成可信验证时不能启动，未完成复盘时不能提交教师报告。
  - 移除活动界面中的自由文本“收获与反思”输入框和 `reflection_submitted` 完成路径；报告保存只保存正文，复盘完成由服务端状态确认。
  - 问题原文、学生原始回答和最终总结通过同一个 `assembleMarkdown()` 汇入预览、Markdown 导出、AI 点评和教师提交，避免多套报告生成结果不一致。
  - 初始报告草稿不再创建 `reflection` 文本字段；旧字段仅作为草稿/模板兼容标识，不参与显示和完成判定。
  - 教师报告版式说明同步为“收获与复盘”对话语义。
- 验证：
  - `node --test learning/report-template.test.mjs`，4 项通过。
  - `npm run build`，VitePress 客户端、服务端 bundle 与页面渲染全部通过。
- 实际变更范围：新增 `SocraticReviewPanel.vue`；修改工作台、报告面板、教师发布提示、前端模型、前后端报告模板和测试、本 process 文档，共 9 个文件，+1015 / -109。
- 本地提交：`06daeb8dcfbcb10b910021317640e33ee640676c feat(workbench): replace freeform reflection with review dialogue`。

### 阶段 5：生命周期、报告门禁与教师可见性

- 状态：完成
- 主要修改：
  - 新增数据库迁移 `20260812_socratic_review_lifecycle_v1`。新实验的完成与前置解锁严格要求“可信 verified run + `socratic_reviews.status = review_completed`”。`reflection_submitted` 不再是新闭环的完成依据。
  - 历史兼容被显式拆为 `legacyReflected`：仅迁移生效前已经存在的旧反思事件可以保留已完成资格；新写入的同类事件不会被误判为旧数据。访问 API 同时返回 `reviewCompleted`、`legacyReflected` 和兼容字段 `reflected`。
  - `POST /reports` 在服务端执行复盘门禁，未完成当前 Lab 的服务端复盘会返回 `409 review_required`。迁移前已提交报告使用 `review_grandfathered` 继续允许重提交，避免影响已有课程记录。
  - 新增教师只读接口 `GET /teacher/socratic-review?user=&labId=`。它返回复盘计划、导师问题、学生原答、Assessment verdict 与 evidenceRefs、最终总结、原始 transcript，以及该复盘会话中的服务端权威 Tutor 对话。
  - 教师“实验验收”页按当前报告按需读取上述数据并展示结构化复盘、证据引用、最终总结、原始 transcript 和日常对话证据；不会一次性下发其他学生的数据。
  - 备份 manifest 增加 `socratic_reviews`、`socratic_review_turns`、`mastery_observations` 三张表的计数。
  - 前端学习路径不再使用本地 `reflection_submitted` 推断完成；本地同步只在可信验证后刷新 access，复盘完成由服务端组件主动刷新。
- 验证：
  - `node --test access.test.mjs socratic-review-db.test.mjs trial-operations.test.mjs`：14 项通过，涵盖新旧完成状态隔离、五题上限与备份表计数。
  - `npm run test:smoke`：通过旧反思不可解锁、Lab1/2 复盘完成、`awaiting_evidence -> 新可信运行 -> resume`、最多五题、服务端报告门禁、教师复盘读取与备份链路。
  - `npm run build`：VitePress 客户端、服务端 bundle 与渲染页面通过。
- 实际变更范围：学习访问与迁移、复盘数据库、Tutor 服务与 smoke、学生工作台模型、教师验收页、备份统计和对应测试、本 process 文档，共 11 个文件，+562 / -22。
- 本地提交：`8977d70d223f7626611bcbf148177aec7f518200 feat(lifecycle): enforce reviewed completion and teacher visibility`。

### 阶段 6：全量验收与契约收口

- 状态：完成
- 主要修改：
  - C0 Tutor 基线补齐 `review_started`、`review_question_asked`、`review_answer_submitted`、`review_answer_evaluated`、`review_completed` 的服务端权威证据分类；反思阶段的正式退出证据由旧 `reflection_submitted` 改为 `review_completed`。
  - 同步修正非默认 `OS_LAB_TUTOR_ROUTING_MODE=stage` 路径：只有 `review_completed + report_submitted` 才能从 `reflect` 进入 `transfer`，历史 `reflection_submitted` 不再能绕过新闭环。
  - stage 路径进一步区分“缺最终复盘”与“已复盘、缺报告提交”；前端 `gate/actions` 文案与新状态机同步，避免继续显示旧自由文本反思指引。
  - 报告提交显式携带当前 `sessionId`；服务端确认同一 Lab、同一会话的复盘已完成后，才保存报告并生成含正文 SHA-256、复盘引用和 `server-verified` 标记的 `report_submitted`。公开 `/events` 接口拒绝客户端伪造该事件。
  - 移除服务端与前端离线副本中针对 `sepc` / `sscratch` 的术语特判回答；离线回复统一使用共享意图分类，不维护术语白名单或额外直接解释。
  - 为上述 stage 路径、报告权威事件和离线策略补充回归测试，避免默认 `intent` 路由之外出现完成语义分叉。
- 验证：
  - `npm test`：122/122 通过。
  - `npm run test:harness`：34 个 Tutor 场景全部通过，单轮追问率、相关性、证据引用与阶段不变性均满足阈值。
  - `npm run test:rag-harness`：3/3 通过。
  - `npm run test:smoke`：通过真实 HTTP/SSE/SQLite 链路，包括旧反思不解锁、复盘阻塞恢复、报告门禁、客户端伪造报告事件被拒绝、服务端权威报告事件落库、教师复盘读取和备份。
  - `npm run build`：VitePress 客户端、服务端 bundle 与静态渲染通过。
  - 运行态：Tutor `GET /health` 返回 `ok: true`，VitePress 开发站点根路径返回 HTTP 200；本次环境没有可用的浏览器控制实例，因此未能补充截图式人工页面检查。
- 实际变更范围：Tutor 基线、stage 状态机、服务端权威报告事件、工作台事件模型、HTTP smoke 和对应测试、本 process 文档，共 9 个文件，+147 / -47。
- 本地提交：`723aca34e7924096d9923b31687bc54e36ea47f8 feat(contracts): close authoritative review lifecycle`。

### 阶段 7：复盘可用性修复与教师验收队列闭环

- 状态：完成
- 实测根因：
  - 原 Assessment 计划生成没有读取同一学生、同一 Lab 的历史复盘，确定性回退总会选中相同概念和固定题面；远程模型原样复用旧问题时也没有新颖性校验。
  - 原回答状态机把澄清追问仍未通过视为整场复盘的终止条件，因此常在两题后直接进入 `deferred`。
  - 原评价契约只有 verdict、简短 rationale 和证据引用，无法稳定向学生说明“是否正确、缺了什么、完整因果链是什么”。
  - 原报告门禁只接受 `review_completed`，且教师验收队列只从 `reports` 表读取；因此 `deferred` 学生既不能提交报告，教师也看不到仅有复盘的记录。
- 主要修改：
  - 新增最近 5 次复盘读取；Assessment Agent 根据历史概念、题型和题面轮换问题。远程模型若原样重复近期问题，则拒绝该计划并回退到同样遵守轮换规则的确定性计划。
  - 每个主问题最多生成一次澄清追问；澄清仍未通过时保留明确评价并继续下一主问题，不再提前结束整场复盘。计划问题全部完成后仍存在未解决叶子问题，或达到五题总上限时，才进入 `deferred`。
  - 评价契约增加 `verdictLabel`、`missingPoints`、`correctReasoning`、`correctiveExplanation`。学生当前题、已完成记录、延期记录、报告正文和教师验收页统一展示明确结论、遗漏点和参考因果链。
  - `deferred` 保存完整 transcript，并成为可提交报告的状态；报告会携带复盘问答、逐题评价和延期原因。该状态不写入熟练掌握证据，也不自动解锁下一实验，仍由教师处理未解决知识点。
  - 教师验收队列改为报告与复盘联合队列，增加 `hasReport`、`reviewStatus`、`reviewUpdatedAt`。学生尚未提交报告时，教师也能先查看完整复盘和 Tutor 对话；报告批语输入保持禁用，提交报告后即可正常验收。
- 验证：
  - `node --test learning/assessment-agent.test.mjs learning/concept-catalog.test.mjs learning/socratic-review-db.test.mjs`：15/15 通过。
  - `npm run test:smoke`：真实 HTTP/SQLite 链路通过，覆盖“主问题 partial -> 一次澄清 partial -> 继续下一主问题 -> 最终 deferred -> deferred 可提交报告 -> 教师队列从 `hasReport: false` 更新为 `hasReport: true`”。
  - `npm test`：125/125 通过。
  - `npm run test:harness`：34 个 Tutor 行为案例全部通过；相关性、单次追问、阶段不干扰与无答案泄漏指标均达标。
  - `npm run test:rag-harness`：3/3 通过。
  - `npm run build`：VitePress 客户端、服务端 bundle 与页面渲染通过。
  - `node --check` 与 `git diff --check` 通过；仅有工作区 LF/CRLF 提示。
  - 最新隔离服务的 Tutor `8788` 与 VitePress `5174` 均正常监听。当前运行环境没有可用的浏览器控制实例，因此无法补充截图式桌面/移动端验收；本轮 UI 已通过生产构建、类型编译、真实 API smoke 与长文本响应式样式审查。
- 实际变更范围：Assessment 题目轮换和结构化评价、复盘状态机、报告门禁、教师联合队列、学生与教师复盘 UI、前端类型、HTTP smoke 和数据库/契约测试、本 process 文档，共 13 个文件，+1006 / -87。
- 本地提交：`8feab4b0d75ed39b2ecad6697dc6b10ca010a938 fix(review): make Socratic feedback actionable and teacher-visible`。

### 验收入口与展示口径收口

- “评分复核”并入“实验验收”，教师不再在评分页和报告页之间切换处理同一个学生的同一次实验。
- 教师队列以“学生 + Lab”为验收单元；报告和复盘是同一验收单元的两类证据，中栏合并展示，避免重复条目或上下文割裂。
- 自动评分移入右栏，与评分细项、证据引用和历史复核决定一起展示；自动结果不被覆盖，也不直接代表验收通过。
- 最终验收由教师在同一右栏完成。教师可以参考自动评分修正分数、记录理由和验收意见，所有决定保留时间线与证据引用。
- 旧评分复核路由改为兼容说明页，历史数据和接口继续可读。本次文档收口不改变前述 7 个实现阶段的提交统计。

### 本轮代码实现：统一实验验收（2026-08-12）

- 修复 `teacher-review-layout` 的页面级纵向滚动；教师验收的中栏提交文档、右栏验收表单也分别设置了可滚动内容区，长报告、复盘证据和评分细项不会被视口裁掉。
- `TeacherReview` 的中栏将学生提交的报告正文、附件和复盘问答作为一个连续的实验提交阅读流。若报告 Markdown 已包含复盘章节，不再重复渲染完整问答；服务端 transcript 和 Tutor 日常对话保留在可展开的权威证据区。
- 新增 `GET /teacher/report-assessment?user=&labId=`：按学生和 Lab 读取最新自动评价，不依赖是否进入旧 `review_queue`，同时返回关联旧复核和当前/历史教师验收记录。
- 新增 `POST /teacher/report-acceptance`：教师一次提交最终分、报告反馈和验收建议；写入追加式 `report_acceptances` 与 `teacher_reviewed` 审计事件。自动评价保持只读，旧 `GET /teacher/reviews` / `POST /teacher/review` 保留兼容。
- 顶栏移除“评分复核”导航；`/guide/teacher-report` 改为兼容说明页，统一入口为 `/teacher-review`。
- 验证结果：`npm test` 125/125，`npm run test:smoke` 通过（覆盖未入旧复核队列的自动评分、无报告拒绝验收、最终验收修订和自动分不可变），`npm run build` 通过，`git diff --check` 通过。浏览器控制实例不可用，未执行截图式验收。

### 本轮代码实现：复盘题目中立化与 Assessment Harness（2026-08-13）

- 实测根因：复盘题面强制学生按“原假设 -> 修正后结论”还原自己的判断过程，答对机制但不复述错误经历的学生会被判 partial；评价文案也倾向要求固定叙事结构。
- `learning/assessment-agent.mjs`：三个 evidence-reflection 题面变体全部改写为“机制解释 + 证据对应”风格，不再要求复述最初的错误判断；`objective` 与 `passCriteria` 改为来自概念 invariants 的可判定知识要点；远程计划 Prompt 增加“不得要求固定叙事格式、passCriteria 必须是知识要点”约束；回答评价 Prompt 增加“只判机制理解，措辞简短或顺序不同也应判 passed”约束；确定性评价的纠正说明改为给出参考解释而非模板化格式要求。
- `handbook/tutor-server.mjs`：澄清追问改为引用评价给出的具体 `missingPoints`（最多两条），不再统一说“还缺少关键因果关系”。
- 新增 `learning/assessment-harness.mjs` / `assessment-harness-cli.mjs` / `assessment-harness.test.mjs` 与 fixture `learning/fixtures/assessment-harness-cases-v1.json`：计划用例校验题量题型、conceptId 归属、evidenceRefs 白名单、近期不重复与叙事中立性；回答用例校验 verdict 落点、证据引用真实、口头回答不覆盖运行证据、未通过必须给出缺失点与参考解释。入口 `npm run test:assessment-harness`，并纳入 `npm test`。
- `docs/agent-system-technical.md` 同步：Assessment Harness 从“应实现”改为已实现，记录两类用例的检查口径。

### 本轮代码实现：复盘书页化、草稿暂存与报告/复盘分离（2026-08-13）

- `SocraticReviewPanel.vue`：进行中的复盘改为“书页式”组织，每道已提出的题一页（题目、我的回答、AI 评价同页），待补证据与最终总结各占一页；顶部页码条可回看任意已答题，「回到当前」跳回待作答页。回答与总结草稿按 `labId + sessionId + reviewId` 存入 localStorage，提交成功或复盘完成后清除，折叠、切页签、翻页、刷新均不丢稿。
- `ReportPanel.vue`：删除 `reviewRecordMarkdown` 及其在 `buildBodyMarkdown` 中的拼接。提交、预览、导出的报告只含学生自己撰写的正文与附件，复盘问答不再重复出现在报告末尾；“先完成复盘才能提交”的服务端门禁不变，教师端复盘证据走独立接口。
- 存量数据清理：对清库后已重新提交的一份 Lab1 报告，同步截掉数据库 `reports.content` 与磁盘 `submission.md` 中拼接的“## 收获与复盘”段。
- `handbook/docs/workbench-ui.md` 同步书页翻页、草稿暂存与“正文不再拼接复盘”的口径。

### 本轮代码实现：教师工作台入口与验收阅读流精简（2026-08-13）

- `TutorEntry.vue`：删除教师登录后顶部的“教师工作区”hero 卡片（含进入 Lab1 工作台、实验验收、期末探索按钮与 8 Labs 进度块）和“查看全部提交”按钮；教师直达批量开放与课程实验列表。
- `TeacherNav.vue` 顶栏新增“教师工作台”入口；`RoleLearningNav.vue` 对教师隐藏“引导式学习”链接，避免双入口。
- `TeacherBatchOpen.vue` / `TeacherPublishPanel.vue`：发布区改为带步骤角标的视觉层级（快捷发布、公告、AI 模型状态角标等）；报告格式预览不再包含“收获与反思”固定章节，移除未使用的模板重置入口。
- `FinalProjectPublishPanel.vue`：头部精简为单行标题。
- `TeacherReview.vue`：“复盘对话记录”改为气泡对话式阅读流（导师问题与学生回答左右分侧，评价随气泡展开）；小标题从强调色小字放大为正文级加粗标题并配左侧色条，区块留白同步加大。
- 运维记录：2026-08-12 晚清空了服务端全部已提交报告、草稿、评估、复盘、掌握度与验收队列数据（保留账号、会话、对话与运行记录），清库前备份至 `learning/backups/os-lab-manual-reset-20260812T220007.db`，用于全流程人工测试。
