# 双 Agent 苏格拉底复盘实施过程

本文记录“日常答疑闭环 + 实验结束复盘闭环”的分阶段实现、验证结果和本地提交，确保设计设想与实际代码状态一致。

## 设计基线

- Tutor 日常优先解决学生当前问题；只在疑问基本闭合时选择性进行一次理解检查，不逐轮机械追问。
- Assessment 汇总 Tutor 对话、提示使用、工作区操作、可信运行、诊断、Trace、检查点和报告内容，生成 2-5 题复盘计划。
- 实验结束后由 Tutor 逐题执行计划；全部自适应追问也计入 5 题上限。
- 报告正文保留，“收获与反思”改为专门复盘对话区；问答原文和学生最终总结共同进入报告。
- 实验状态为 `working -> verification_passed -> review_ready -> review_planning -> review_active -> review_completed -> lab_completed`，必要时进入 `awaiting_evidence` 或 `deferred`。

## 阶段计划

1. 建立概念目录、复盘领域契约和数据库持久化。
2. 实现 Assessment Agent、全过程证据聚合和复盘计划生成。
3. 实现 Tutor 日常追问节流和苏格拉底复盘编排 API。
4. 将前端固定反思文本框替换为复盘对话区，并生成报告章节。
5. 统一完成状态、教师可见记录、端到端测试和技术文档。
6. 执行全量回归、构建和真实服务验收。

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
- 本地提交：`feat(review): establish socratic review domain foundation`。

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
- 本地提交：`feat(assessment): generate evidence-backed review plans`。
