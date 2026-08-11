# 方向六：知识库与 RAG（新增部分）

> 初赛基线：无知识库与检索。
> 本次新增：多来源知识库、多格式规范化、章节分块、FTS + 向量混合检索、教师知识工作台。

## 1. 知识来源

- 平台 Lab 手册：Lab 任务、平台行为与验证标准的最高权威
- Lab package concept 与检查点：机制概念、检查点与迁移题
- 发布目录：系统版本元数据，不参与自由文本 RAG
- OSTEP 中文核心章节：虚拟化、并发、持久化教材内容
- RISC-V Reader 中文版：RISC-V ISA 与特权架构背景
- LearningOS 讲义：课程讲义正文
- rCore Tutorial Guide：内核实现参考
- CSAPP 中文电子书：内存、进程、链接与并发补充

文档记录规模：

- 8 个 Source
- 约 1964 个 active Chunk
- 约 1940 条同时进入 FTS 与向量缓存
- 后续构建基线：1384 active Chunk、1360 条向量缓存
- 实际数量以当前 SQLite 统计为准

## 2. 多格式规范化

支持：

- Markdown
- HTML
- JSON/YAML
- TXT
- RST
- PDF
- EPUB
- DOCX

统一输出 `Document` 模型，保留标题层级、章节路径、代码语言、HTML anchor、PDF page/line locator。

## 3. 章节感知分块

- 相邻 block 只有 `sectionPath` 相同才合并
- 每个 chunk 保留 block ordinals、locator、父标题链
- 默认目标长度 1000 字符，硬上限 1400 字符
- 不做隐式 overlap

## 4. SQLite 与检索

- 独立知识库：`learning/knowledge/knowledge.db`
- FTS5 trigram 支持中文子串检索
- 一两字查询使用 LIKE 回退
- FTS + embedding + Reciprocal Rank Fusion
- 权限、版本、active/indexable、Lab/global 上限硬截断
- Tutor 最多 5 个 chunk，公共层最多 2 个
- 直接索要答案时跳过知识检索

## 5. 教师知识工作台

新增 `/teacher/knowledge`：

- 左栏：Global/Lab1-8 与来源状态
- 中栏：版本、章节路径、Chunk 摘要
- 右栏：正文、自动归属依据、审核表单、版本/Chunk 操作
- 支持 PDF/EPUB/MD/TXT/DOCX 上传
- 默认 teacher-only，审核后才进入发布索引
- 发布、停用、回滚全部写审计日志

详细文档：

- `os-lab/docs/agent-system-technical.md`：知识库分层、检索与 Tutor RAG 技术契约
- `os-lab/learning/knowledge/README.md`：知识源登记、去重、构建与发布规则
