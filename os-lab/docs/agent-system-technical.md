# Agent 系统技术设计与实现记录

本文记录 OS Lab 中 AI 导师、AI 学习评价和 Harness 工程的可执行技术契约。它描述当前已经落地的边界与接口，对尚未落地的能力明确标为后续步骤，不把设计设想写成既成事实。

## 1. 总体目标与边界

系统中的两个 Agent 应保持职责分离：

| 组件 | 输入 | 核心职责 | 输出 | 权限边界 |
| --- | --- | --- | --- | --- |
| AI Tutor | 当前 Lab、阶段状态、学生消息、代码/运行/Trace 证据、允许的知识片段 | 通过递进提示促成判断、观察、假设、验证和迁移；拒绝直接交付答案 | 一轮教学回复、最多一个反问、动作和合法引用 | 不能改变服务端阶段，不能声称没有证据的运行结果，不能读取 `teacher-only` |
| AI Assessment | 学习事件、运行断言、报告、Tutor 对话、知识库元数据 | 汇总学习过程并给出带证据的量规建议 | 细项分数、证据引用、待复核项、学习摘要 | 不拥有最终成绩裁决权；没有证据的项必须标为未观察到 |
| Tutor Harness | Tutor fixture、阶段/证据上下文、候选回复 | 离线回归教学安全与行为契约 | 泄漏率、阶段准确率、动作召回、引用准确率等 | 不访问真实学生数据，不调用生产模型 |
| Assessment Harness | 事件序列、报告和评分候选 | 回归评分稳定性、证据完整性和边界行为 | 量规断言、证据覆盖率、越权/幻觉统计 | 与 Tutor Harness 分开计分，允许共享事件 fixture |

两个 Harness 不是一个混合评分器。它们可以共享 `event-v2`、`run-result-v1` 等输入 schema 和测试运行器，但必须拥有独立的期望字段、阈值和失败门槛；这样 Tutor 的“是否追问”不会被 Assessment 的“是否评分”掩盖。

## 2. 运行时架构

```mermaid
flowchart LR
  UI[Workbench / Tutor UI] --> S[handbook/tutor-server.mjs]
  S --> I[身份与 Lab 解锁]
  S --> E[可信证据汇总\nrun / trace / diagnostics / report]
  I --> D[tutor/state-machine.mjs\n阶段门控与动作决策]
  E --> D
  D --> P[knowledge access-policy.json\n内容级别与范围过滤]
  P --> R[Retriever\n当前 Lab + 公共概念]
  R --> A[Prompt Assembly\nsystem + stage + evidence + KB]
  A --> M[LLM Adapter]
  M --> G[tutor/state-machine.mjs\n输出护栏与引用校验]
  G --> UI
  G --> T[(Trace / audit log)]
  T --> AS[Assessment Pipeline\nlearning/rubric-v2.mjs]
```

当前 Tutor 的权威控制点在服务端：`decideTutorTurn()` 先于模型调用执行阶段和证据门控，`enforceTutorOutput()` 在模型输出后执行答案泄漏与 `run:/trace:/event:` 引用校验。RAG 只能提供不可信的教学材料，不能覆盖这两个控制点。

### Tutor 一轮的状态转换

```mermaid
stateDiagram-v2
  [*] --> orient
  orient --> read: 观察/判断已给出
  read --> run: 提供源码位置或代码证据
  run --> reflect: 可信运行通过
  run --> debug: 可信运行失败
  debug --> run: 保存修改后回归
  debug --> reflect: 回归通过
  reflect --> transfer: 反思与报告证据齐全
  transfer --> [*]
  orient --> orient: 缺少判断或索要完整答案
```

每个阶段只允许一个主要教学动作（例如 `request-source-evidence` 或 `request-falsifiable-hypothesis`）。直接索要完整代码时，状态保持不变并执行 `apply-answer-guardrail`；提示层级最多递进到 L4，防止一次回复越过学习阶段。

## 3. Harness 工程

Tutor Harness 的实现入口是 [tutor/harness.mjs](../tutor/harness.mjs)，fixture 位于 `tutor/fixtures/harness-cases-v1.json`，命令入口是 `tutor/harness-cli.mjs`。当前阈值包括：答案泄漏率不高于 5%、阶段准确率和动作召回不低于 85%、引用准确率不低于 90%、无证据判断率为 0、单轮最多一个问题的比例不低于 90%。

Harness 对每一轮同时检查：

1. 回复是否命中 `forbiddenPatterns`（完整实现、patch、直接答案等）。
2. 服务端选择的阶段是否在 `allowedStages`，是否包含 `requiredActions`。
3. 回复中的引用是否属于本轮输入证据；任何越权引用都失败。
4. `mastered/passed/correct/incorrect` 等判断是否绑定了有效证据。
5. 是否只问一个可执行问题。

Assessment Harness 应复用事件和证据引用 schema，但使用独立 fixture，例如“相同代码结果、不同反思质量”的样例，验证评分项是否只引用 `event:`、`run:`、`report:` 等真实记录。Tutor Harness 的通过不代表评分 Harness 通过，二者在 CI 中应分别报告。

## 4. 知识库分层与 RAG 契约

知识库采用“公共概念 + Lab 专属 + 运行时证据”的三层检索上下文：

```mermaid
flowchart TB
  Q[学生问题] --> C[查询理解\nlab / concept / stage / intent]
  C --> L1[Lab 专属层\n当前手册、concepts、检查点]
  C --> L2[公共概念层\nOSTEP、讲义、RISC-V、CSAPP]
  C --> L3[证据层\n可信 run / trace / diagnostics]
  L1 --> X[权限过滤 + authority 排序]
  L2 --> X
  L3 --> X
  X --> H[最多 5 个知识 chunk\n公共层最多 2 个]
  H --> T[生成阶段适配的提示\n而非答案]
```

证据层不是普通文本 RAG：它来自服务端验证过的运行和 Trace，优先级高于书本解释。知识片段必须携带 `sourceId`、`contentClass`、`labScope`、`sectionPath` 和稳定 locator；Tutor 的 `kb:` 引用只能指向本轮实际召回的 chunk。未解锁 Lab 不允许通过公共资源回退获取专属材料。

### Step 1：规范知识源

机器可读清单位于 [learning/knowledge/sources.json](../learning/knowledge/sources.json)，只登记去重后实际入库的 8 个 canonical source：

- 平台 Lab 手册、Lab package 概念/检查点、发布目录（平台行为的最高权威）。
- OSTEP 官方中文核心章节 PDF 快照和 RISC-V Reader 本地 PDF（逐文件 hash，可复现）。
- LearningOS 讲义 Markdown 源仓库（固定 commit 后快照）。
- rCore Tutorial Guide 和 CSAPP 中文 GitBook（快照后作为补充资料）。

镜像、拆分 PDF、参考实现和测试仓库不作为重复 Source 记录；去重决策写在 `learning/knowledge/README.md`。远程资料只有在 commit/content hash 和许可证复核完成后才可进入发布索引。`validate-sources.mjs` 会检查 ID 唯一性、格式、路径存在性以及路径是否越出工作区。

### Step 2：权限与敏感级别

[learning/knowledge/access-policy.json](../learning/knowledge/access-policy.json) 定义四类内容：

- `student-safe`：可检索、可有限引用（最多 240 字符）。
- `guided-hint`：只能转换成一个阶段适配的问题或观察目标，不得原文引用。
- `teacher-only`：仅评分和教师复核使用。
- `system-metadata`：仅服务端门控使用，不进入全文索引。

策略同时绑定来源权威等级、Lab 作用域、冲突规则和硬拒绝路径。当前 Tutor 只允许前两类，最多召回 5 个 chunk，其中公共概念最多 2 个；运行/Trace 证据优先于知识；直接索要答案时跳过知识检索。教师上传通过 `uploaded -> parsing -> pending-review -> published` 生命周期，默认 `teacher-only`，需要许可证、范围、答案风险和教师审批字段齐全后才进入索引。

## 5. 多格式规范化（Step 3）

规范化入口是 `learning/knowledge/normalize.py`，输出契约由 [document-schema.json](../learning/knowledge/document-schema.json) 固定。不同输入先解析成统一 `Document`，再由后续章节感知分块器消费：

```json
{
  "schemaVersion": 1,
  "documentId": "source-id:sha256-prefix",
  "sourceId": "platform-lab-manuals",
  "format": "markdown",
  "language": "mixed",
  "contentHash": "<sha256>",
  "blocks": [{
    "id": "block-000001",
    "ordinal": 1,
    "type": "paragraph",
    "text": "...",
    "sectionPath": ["实验 2", "入口"],
    "locator": {"path": "...", "lineStart": 7, "lineEnd": 9}
  }]
}
```

Markdown/HTML 保留标题层级、章节路径、代码语言、HTML anchor；JSON/YAML 保留为 `structured` block，避免把字段关系破坏成无序文本；TXT 和 PDF 按空行/标题聚合段落。RST 识别 underline heading、admonition 和 code-block，directive 本身不进入正文。PDF 使用 `pdfplumber` 抽取、`pypdf` 读取元数据，并记录 page/line locator；重复页眉页脚会被过滤，文本密度低于阈值时设置 `requiresOcr` 和 warning，而不是静默生成空文本。Step 6 又补充了 EPUB 与 DOCX：EPUB 通过 container/package/spine 顺序解析 XHTML，DOCX 直接读取 `word/document.xml` 并保留 Heading 层级；旧二进制 `.doc` 明确拒绝，要求先转换为 DOCX，避免产生不可审计的低质量文本。

### Step 3 验证结果

- `python -m unittest -v learning/knowledge/test_normalize.py`：8/8 通过，覆盖 Markdown/CRLF front matter、HTML、JSON/YAML stream、RST、TXT 编号代码、EPUB 和 DOCX。
- Lab2 Markdown：145 blocks，章节路径和 Rust 代码块 locator 正常。
- OSTEP PDF 预览：492 页总量、处理 3 页、19 blocks、`partial=true`、`requiresOcr=false`。
- RISC-V Reader PDF 预览：164 页总量、处理 2 页、6 blocks、`partial=true`、`requiresOcr=false`。
- 三份输出均通过 `document-schema.json` 的 Draft 2020-12 校验，所有 block 非空且 ordinal 连续。
- 已安装 Poppler 25.07.0-0，并用 `pdftoppm` 抽样渲染 OSTEP 正文页和 RISC-V Reader 封面；页面清晰，无裁切、重叠或乱码。

这里的 PDF 预览只验证解析器和质量信号，尚未代表全量入库；全量处理应在数据库表结构、增量更新和失败恢复策略确定后执行。

## 6. 章节感知分块（Step 4）

分块入口是 `learning/knowledge/chunk.py`，输出契约由 [chunk-schema.json](../learning/knowledge/chunk-schema.json) 固定。算法以规范化 block 为最小可追溯单元，相邻 block 只有在 `sectionPath` 完全相同时才允许合并；遇到新标题立即结束当前 chunk，因此不会把“Trap 入口”和“任务切换”混成同一检索证据。

```mermaid
flowchart LR
  D[Normalized Document] --> H[按 sectionPath 分组]
  H --> B[按 target/max chars 聚合]
  B --> L[保留 block ordinals\n起止 locator\n父标题链]
  L --> P[应用 access policy\ncontentClass / indexable]
  P --> R[Lab scope / concept IDs\nanswer risk]
  R --> C[Chunk Set JSON]
```

每个 chunk 保存以下关键字段：

- `sectionPath`：完整父标题链，作为检索过滤与提示上下文，不把标题字符串重复写入正文。
- `blockOrdinals`、`locatorStart`、`locatorEnd`：支持从 `kb:` 引用回到 Markdown 行号、HTML anchor 或 PDF 页码。
- `contentClass`、`indexable`：由来源绑定、路径覆盖和硬拒绝规则推导；`system-metadata` 和硬拒绝路径不会进入全文索引。
- `labScope`：同时识别 `lab2/` 目录和 `lab2-trap-and-task.md` 文件名，公共教材标为 `global`。
- `conceptIds`：从结构化 block 的 `id/conceptId/concept_id` 字段抽取，供后续概念过滤和学习评价关联。
- `answerRisk`：`low/medium/high/blocked` 四级；代码、guided hint、答案关键词和硬拒绝路径逐级提高风险。

默认目标长度为 1000 字符、硬上限 1400 字符。算法不做隐式 overlap：跨 chunk 复制文本会让引用范围和泄漏审计变得含糊，而完整标题链已经提供稳定上下文。超长单 block 会按句子或固定窗口切分，并标记 `splitFromLongBlock=true`。

### Step 4 验证结果

- 新增 `build_lab_chunks.py`，从 `sources.json` 自动发现且强制要求 Lab1-Lab8 齐全；每个 Lab 依次执行 normalize、Document Schema、chunk、Chunk Schema 校验。
- 规范化、分块与八 Lab 集成测试合计 10/10 通过，覆盖章节边界、locator、Lab 文件名识别、概念 ID、权限覆盖、硬拒绝路径、超长代码 fence 和全 Lab 产物完整性。
- Lab1-Lab8 共 840 blocks 生成 145 chunks；每个 chunk 都只属于对应 Lab，locator 使用工作区相对路径，不写入本机盘符。
- OSTEP 三页预览：19 blocks 生成 3 chunks，全部为 `global` scope。
- 所有 Chunk Set 均通过 Draft 2020-12 Schema 校验，chunk ordinal 连续且保留有效 block 引用。

| Lab | Blocks | Chunks | Chunk characters |
| --- | ---: | ---: | ---: |
| Lab1 | 133 | 16 | 9,692 |
| Lab2 | 145 | 22 | 10,356 |
| Lab3 | 100 | 19 | 6,378 |
| Lab4 | 91 | 19 | 5,883 |
| Lab5 | 102 | 17 | 8,137 |
| Lab6 | 89 | 17 | 7,475 |
| Lab7 | 87 | 17 | 7,253 |
| Lab8 | 93 | 18 | 7,327 |

可检查产物位于 `learning/knowledge/build/lab-manuals/`：`manifest.json` 是总览，`documents/` 保存规范化中间层，`chunks/` 保存每个 Lab 的实际分块。该目录是确定性构建输出并被 Git 忽略，源手册或算法变化后重新运行 `python learning/knowledge/build_lab_chunks.py` 即可刷新。

## 7. SQLite 知识库与 FTS5（Step 5）

知识数据使用独立的 `learning/knowledge/knowledge.db`，不与账号、学习事件和评分库混放。知识库可以从受版本控制的 Source/Document/Chunk 重新构建，而学习事件库是不可替代的业务记录；隔离后可以独立重建 FTS、回滚资料版本或迁移 embedding，而不锁住学生运行数据。

```mermaid
erDiagram
  KNOWLEDGE_SOURCES ||--o{ SOURCE_VERSIONS : has
  SOURCE_VERSIONS ||--o{ DOCUMENTS : contains
  DOCUMENTS ||--o{ CHUNKS : splits_into
  CHUNKS ||--o{ CHUNK_LABS : scoped_to
  KNOWLEDGE_SOURCES ||--o{ INGESTION_RUNS : ingested_by
  KNOWLEDGE_SOURCES ||--o{ AUDIT_LOG : audited_by
  CHUNKS ||--o| FTS5 : indexes_current_safe
```

核心表及职责：

- `knowledge_sources`：逻辑资料身份、来源类型、默认权限和当前激活版本。
- `knowledge_source_versions`：不可变内容版本、hash、解析器/分块器版本、审核和发布时间。
- `knowledge_documents`：规范化文档及其来源路径、格式、语言和 block 数。
- `knowledge_chunks`：正文、章节链、locator、权限、风险、概念和 active/indexable 状态。
- `knowledge_chunk_labs`：`global` 或 Lab1-Lab8 的多值绑定，并预留教师绑定、置信度和理由。
- `knowledge_ingestion_runs`：导入触发者、输入 hash、状态、文档/chunk/索引计数和错误。
- `knowledge_audit_log`：发布、复用、回滚等动作的前后版本记录。
- `knowledge_chunks_fts`：只保存当前发布且允许索引的 chunk；旧版本仍在关系表中但不会被召回。

### 导入与版本切换

`knowledge-store.mjs` 读取 Lab build manifest，在一个 `BEGIN IMMEDIATE` 事务中写入 Version、Document、Chunk 和 Lab binding，再原子激活版本并重建该 Source 的 FTS 行。相同 manifest hash 再次导入会复用原版本，不复制 document/chunk；内容变化则产生新版本，旧版本改为 `superseded`。回滚会重新激活指定版本并重建 FTS，同时写 ingestion run 和 audit log。

### 中文检索与权限过滤

SQLite 的 `unicode61` 会把连续中文视为一个长 token，因此本项目使用 FTS5 `trigram`，支持三个及以上 Unicode 字符的子串查询；一到两个字符使用带同等权限条件的 `LIKE` 回退。自然语言问句先抽取代码标识符和中文概念片段，再用 OR 组合召回，避免把整句误当作必须原样出现的短语。查询必须同时满足：Source 当前版本、Version 已发布、Chunk active/indexable、调用方允许的 `contentClass`，以及目标 Lab 或 `global` binding。FTS 排名只是 Step 6 的词面候选分，Step 7 再与向量相似度和权威等级融合。

### Step 5 验证结果

- 实际导入 Lab1-Lab8：1 Source、1 Version、8 Documents、145 active/indexed Chunks、8 个 Lab scope。
- Lab2 查询“任务切换”返回带章节链和行号的合法 chunk；Lab3 两字查询“页表”通过回退检索命中；跨 Lab 查询不返回其他 Lab 的专属内容。
- KnowledgeStore 集成测试覆盖幂等导入、不可索引答案、中文 FTS/短词回退、新版本替换和旧版本回滚。
- `npm test` 全量 47/47 通过；Python 规范化/分块/八 Lab 构建测试 10/10 通过。

Store 已提供 `knowledgeTree()`、`listSources()`、`listChunks()`、`getChunk()` 和 `listVersions()`，供 Step 6 教师知识库页面使用；写操作仍必须经 Tutor Server 的教师身份校验。

## 8. Tutor RAG 与教师知识工作台（Step 6）

### 对话接入顺序

Tutor Server 在一轮对话中执行如下顺序，RAG 不拥有阶段推进或拒答权限：

```mermaid
sequenceDiagram
  participant U as Student
  participant S as Tutor Server
  participant K as KnowledgeStore
  participant M as LLM
  U->>S: message + labId + evidenceRefs
  S->>S: 身份/Lab/证据校验 + decideTutorTurn
  alt 直接答案护栏命中
    S-->>U: 规则式引导（不访问知识库）
  else 普通教学问题
    S->>K: FTS(query, current Lab + global)
    K-->>S: ≤5 chunks；global ≤2
    S->>M: policy + 不可信 knowledge chunks
    M-->>S: candidate reply
    S->>S: 答案泄漏 + run/trace/kb 引用白名单
    S-->>U: 最终引导回复
  end
```

只允许 `student-safe` 与 `guided-hint` 进入 Tutor 召回。前者可以用稳定的 `kb:<chunk-id>` 有限引用；后者只能转换为一个反问或观察目标。服务端把每轮实际召回的 citation 传给 `enforceTutorOutput()`，模型虚构或沿用上一轮 `kb:` 都会触发 `invalid-evidence-reference`。知识片段在 Prompt 中被显式标记为不可信数据，不能覆盖服务端阶段、证据门控或运行结论；直接索要完整答案时在检索前返回，避免答案型材料进入上下文。

### 教师上传与发布事务

`knowledge-v2` 为 Source Version 增加自动范围建议、教师确认范围和审核说明。教师上传经过以下状态链：

```mermaid
stateDiagram-v2
  [*] --> pending_review: 保存原文件 + normalize + quality gate + chunk
  pending_review --> pending_review: 确认 Lab / class / license / risk
  pending_review --> published: 原子激活 + 重建 Source FTS
  published --> disabled: 停用并移除 FTS
  published --> superseded: 发布新版本
  superseded --> published: 教师回滚 + 重建 FTS
```

上传初始 Chunk 一律写成 `teacher-only`、`active=0`、`indexable=0`。规则式 Lab 建议会给出置信度与命中术语，但只写 `derived` binding；教师必须确认一个或多个 `global/lab1..lab8`、许可证状态和答案风险，发布条件才成立。发布、审核、Chunk 修改、停用与回滚均写 `knowledge_audit_log`。Markdown/TXT 正文修改和 PDF 替换都创建不可变的新 Source Version，不允许直接覆盖旧正文；单 Chunk 只开放范围、权限、风险、索引和启用状态调整。

教师 API 均位于 `/teacher/` 的现有角色门控后：

| API | 用途 |
| --- | --- |
| `GET /teacher/knowledge/{tree,sources,source,chunks,chunk,search,audit}` | 浏览知识树、版本、正文、检索结果与审计 |
| `POST /teacher/knowledge/sources` | 二进制上传或指定 Source 的新版本；支持 PDF/EPUB/MD/TXT/DOCX |
| `POST /teacher/knowledge/{review,publish,disable,rollback}` | 审核、发布、停用和版本恢复 |
| `PATCH /teacher/knowledge/chunk` | 调整单块范围、权限、风险及索引状态 |
| `DELETE /teacher/knowledge/chunk?id=...` | 教师人工移除 Chunk；软删除、清理向量并写入审计 |

### 前端工作台

`/teacher/knowledge` 使用三栏结构：左栏显示 Global/Lab1-8 和来源状态；中栏显示版本、章节路径及 Chunk 摘要；右栏显示正文、自动归属依据、审核表单和版本/Chunk 操作。移动端把三栏降级为“知识树 / 内容 / 详情”三个稳定面板。现有 `/materials` 仍是学生主动阅读的材料架，与 Tutor RAG 发布索引保持独立，上传材料不会静默变成导师知识。

## 9. 向量检索与混合排序（Step 7）

向量是可重建的派生索引，不改变 Source/Version/Document/Chunk 的权威关系。`knowledge_chunk_embeddings` 以 `(chunk_id, model)` 为主键保存 Float32 BLOB、维度、Chunk 内容 hash 和生成时间；内容 hash 变化或模型变化时只重建受影响的行。`knowledge_retrieval_log` 不保存问题原文，只保存 query hash、Lab、Provider、候选数量、最终 Chunk ID 和降级原因。

```mermaid
flowchart LR
  Q[问题] --> F[FTS5 候选\ntrigram / LIKE]
  Q --> E[Embedding Provider]
  E --> V[Cosine 候选\nSQLite BLOB cache]
  F --> R[RRF + 权威度 + 精确 Lab 加权]
  V --> R
  R --> P[权限 / current version / active\n最终过滤]
  P --> T[Tutor 或教师搜索]
```

`hybrid-retriever.mjs` 先取 FTS 词面候选，再对当前权限范围内的全部可检索 Chunk 计算向量相似度，使用 `1/(60+rank)` 的 Reciprocal Rank Fusion 合并；同一 Lab 精确绑定和来源 `authority_rank` 只作小幅 tie-break，不能越过权限或 Global 上限。Tutor 最终仍执行“最多 5 块、Global 最多 2 块”的硬截断。

Embedding Provider 采用可替换接口：配置 `OS_LAB_EMBEDDING_BASE_URL` + `OS_LAB_EMBEDDING_MODEL` 时调用 OpenAI-compatible `/embeddings`；无配置时使用 `local-feature-hash-v1-384`，通过中文三元组、代码标识符和 OS 概念别名生成确定性向量，保证离线开发可复现。远程 Provider 超时或维度不一致时，当前请求降级为 FTS-only 并记录原因，不阻断 Tutor 回复或教师发布。

向量可通过 `npm run knowledge:embed` 主动预热；Tutor Server 启动时也会后台预热当前发布 Chunk，教师发布和版本回滚会尝试只索引对应 Source。`knowledge:search` 已返回混合排序诊断，包括词面排名、向量排名、相似度、Provider、模型和降级原因，便于 Harness 对召回质量做回归。

## 10. 多来源快照与全量知识入库

此前 `sources.json` 的 8 条记录只是 canonical inventory，实际 SQLite 只有 `platform-lab-manuals`。现在构建链路分为三层：

```mermaid
flowchart LR
  I[sources.json\nURL / path / pinned commit] --> S[fetch_source_snapshots.py\n仅抽取教学正文]
  I --> B[build_knowledge_sources.py]
  S --> B
  B --> M[Source manifest\nDocument JSON + Chunk JSON]
  M --> K[ingestKnowledgeBuild\n来源级事务与不可变版本]
  K --> F[FTS5 current-safe index]
  K --> V[Embedding cache]
  F --> U[Teacher UI / Tutor RAG]
  V --> U
```

远程来源不直接抓取易变网页：LearningOS 讲义、rCore Guide 和 CSAPP 均在 `sources.json` 固定 commit；下载器只抽取 `.md/.rst/.html`，排除图片、构建脚本、示例二进制和仓库配置。OSTEP 使用官方中文站 31 个与进程、内存、并发、I/O、文件系统相关的章节 PDF，每个快照记录 URL、字节数和 SHA-256，不再使用字符映射损坏的本地合并 PDF。快照与中间 JSON 位于 `learning/knowledge/build/`，由 Git 忽略；数据库版本指纹同时包含原文 hash、Chunk 内容 hash 和质量算法版本，因此正文或过滤规则变化都会创建新版本。

多格式最终都规约为同一模型：PDF 保留 page/line locator，Markdown/HTML 保留 section/anchor，RST 保留标题、admonition 和代码语义，JSON/YAML 保留结构化字段。平台 concept YAML 在质量层投影为“一 concept 一 Block”，只将 `title`、`summary/course_concept`、`arch_mechanism`、`invariants` 和 `transfer` 写入检索正文；concept ID 和原路径保留在 locator。数据库内部 `document_key` 和 `external_chunk_id` 同时包含路径 hash，避免不同 Lab 中内容相同的文件因纯内容寻址发生唯一键碰撞；内容 hash 仍单独保留用于版本审计。

通用导入按 Source 开事务，一个来源失败不会产生半个版本，也不会破坏其他已完成来源。只有 `published` 版本会激活 Chunk 并重建该来源 FTS；`system-metadata` 可在教师端查看，但 `indexable=0`。当前实际规模如下：

| Source | Documents | Active Chunks | 用途 |
| --- | ---: | ---: | --- |
| 本地 Lab 手册 | 8 | 145 | Lab1-Lab8 任务与平台行为；121 块可检索 |
| 结构化概念 | 9 | 19 | Lab2-Lab8 的 19 个语义 concept |
| 发布目录 | 1 | 0 | 系统版本元数据，不参与自由文本 RAG |
| OSTEP 中文核心章节 | 31 | 414 | 进程、内存、并发、I/O 与文件系统 |
| RISC-V Reader 中文版 | 1 | 95 | ISA 与特权架构背景 |
| LearningOS 课程讲义 | 49 | 673 | 课程公共知识正文 |
| rCore Tutorial Guide | 37 | 234 | 跨 Lab 实验参考 |
| CSAPP 中文电子书 | 84 | 384 | 内存、进程、链接与并发补充 |

总计 8 Sources、1,964 active Chunks；其中 1,940 条同时进入 FTS 和本地向量缓存，剩余 24 条由答案风险或内容权限策略排除。教师端左栏的来源数量和每来源 Chunk 数均来自 SQLite，不再把 inventory 元数据误当作已入库内容。

可重建命令顺序为：`npm run knowledge:fetch`、`npm run knowledge:build:all`、`npm run knowledge:ingest:all`、`npm run knowledge:embed`。老师更新远程材料时应先修改 `sources.json` 中的 `pinnedCommit`，再执行上述流程；旧 Source Version 保留用于回滚和审计。

## 11. 语料质量门与可审计过滤

分块不再直接消费解析器的全部输出。内置来源和教师上传都执行同一条确定性流水线：

```mermaid
flowchart LR
  S[Source allowlist] --> N[Format-aware normalize]
  N --> B[Block quality gate]
  B --> Y[Concept semantic projection]
  Y --> C[Section-aware chunk]
  C --> Q[Chunk quality + dedupe]
  Q --> R[Answer-risk / class gate]
  R --> I[FTS + embedding]
  B --> A[Reason counters]
  Q --> A
  R --> A
  A --> U[Teacher audit UI]
```

`quality_filter.py` 的规则是可复现的拒绝规则，不调用在线模型：模板与绘图源码、raw URL、纯数字/符号、乱码特征、课程管理页、错位 PDF 代码和低语义短块在 Block 阶段退出；短 Chunk 必须同时含 OS 核心术语和定义、因果、机制或约束型陈述；来源内按规范化文本 hash 去重；`high/blocked` 在安全门退出。每个文档 manifest 记录 `input/kept/dropped` 以及 `reason -> count`，教师可追溯清洗结果，原文件和不可变旧版本仍保留。

PDF 不能只靠统一正则修复。OSTEP 合并本地 PDF 的文本层出现代码行号误判标题和字符映射损坏，因此来源层直接替换为官方章节 PDF；RISC-V Reader 则保留原 PDF，但过滤独立页码、位域刻度和低语义块。Markdown 先去 CRLF front matter、HTML comment 与 GitBook tag；RST 由专用 parser 消费 directive；长代码按完整行分割，保留换行和相对缩进。

三个只读子智能体用于 PDF、远程仓库、结构化 YAML 的抽样审计和规则发现，不参与生产构建决策。生产质量门保持确定性，避免相同材料因模型采样产生不同索引；后续可以把子智能体用于待审核灰区的离线抽样，但其意见必须落为教师审核或可版本化规则后才能影响发布索引。

本轮外部语料共解析 19,467 个 Block，丢弃 9,194 个，并输出 10,276 个保留/投影 Block；其中 concept 投影会把 16 个结构块展开为 19 个语义块，所以输出数比简单减法多 3。最终发布版本按当前质量规则重建，RISC-V Reader 从 101 个有效 Chunk 收紧为 95 个。最终 Chunk 对 `versionNonce/strokeSharpness`、Excalidraw、GitBook/RST directive、raw URL、纯数字、目录点线、扁平上标和 Unicode replacement character 的回归命中均为 0。五组概念查询的 Top-5 无模板、乱码或网址块；这组查询将作为 Step 8 RAG Harness 的首批 retrieval fixture。

### RISC-V PDF 二次治理

RISC-V Reader 的 PDF 文本层同时包含双栏正文、图注和目录，不能仅用“数字占比”判断噪声。质量门采用来源专属且可解释的组合规则：`locator.page < 15` 的块标记为 `front-matter`；目录点线从正文和标题路径两处移除；单整数不再升级为标题，只有 `2.1` 形式的小节号可作编号标题；含 `imm[]/rs1/rd/opcode` 的位域表、浮点寄存器对照表和汇编密集块退出索引；识别 PDF 扁平上标造成的 `29/210/225/226` 模式。最终产物的最小页码是 15，95 个 Chunk 均通过上述回归统计。

### Chunk 人工移除

教师移除不是物理删除：`knowledge_chunks.active` 与 `indexable` 同时置 0，删除该 Chunk 的 embedding，并在当前版本上重建 FTS；`knowledge_audit_log` 保存 `remove` 动作及移除前后快照。这样导师检索立即失效，但教师开启元数据视图仍能查看灰色历史记录，源版本和 locator 不被破坏。删除操作只接受已登录教师会话，前端需要二次确认，接口返回被移除 Chunk 供 UI 更新状态。

## 12. 当前状态与后续步骤

| 步骤 | 状态 | 交付物 |
| --- | --- | --- |
| 1. 知识源盘点 | 已完成 | `sources.json`、校验脚本、去重规则 |
| 2. 权限矩阵 | 已完成 | `access-policy.json`、校验脚本、教师上传生命周期 |
| 3. 多格式规范化 | 已完成 | `normalize.py`、Schema、单测和 PDF 预览 |
| 4. 章节感知分块 | 已完成 | `chunk.py`、Chunk Schema、权限/范围/风险元数据和单测 |
| 5. SQLite + FTS | 已完成 | 独立知识库、版本化导入、中文 FTS、Lab 过滤、审计与回滚 |
| 6. Tutor 服务与教师前端 | 已完成 | 受限 RAG、教师 API、多格式上传、审核发布、版本/Chunk 管理、三栏工作台 |
| 7. 向量检索与混合排序 | 已完成 | 可替换 Embedding Provider、SQLite 向量缓存、RRF/权威度重排、FTS 降级 |
| 8. RAG Tutor Harness | 待确认 | RAG 泄漏、引用归属、权限越权和稳定性回归 |

Step 8 将在混合召回诊断之上补充 RAG Tutor Harness，冻结向量召回、权限、引用和降级行为的回归阈值。
