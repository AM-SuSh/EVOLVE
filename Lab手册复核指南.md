# Lab 手册人工复核与增补指南

> 面向：接下来要人工复核/增补 Lab1-8 引导说明手册的同学。
> 核心原则一句话：**只改 `os-lab/labs/` 下的源文档；不动 H2 标题的中文序号；改完跑一次 build 验证。**

---

## 1. 改哪里（唯一权威源）

| 要改的内容 | 文件位置 |
| --- | --- |
| 实验指导正文 | `os-lab/labs/labN-*.md`（如 `lab2-trap-and-task.md`） |
| 思考题参考答案 | `os-lab/labs/answers/labN-answers.md` |
| 独立文字习题（仅 Lab6-8 有） | `os-lab/labs/exercises/labN-exercises.md` |
| 总览/知识地图 | `os-lab/labs/overview.md` |

⚠️ **绝对不要改** `os-lab/handbook/` 下的 `labs/`、`learn/`、`answers/`、`exercises/` 目录——它们是同步脚本生成的副本，下次构建会被整体覆盖（这些目录已在 handbook/.gitignore 中）。

## 2. 怎么让修改生效、怎么预览

```powershell
cd os-lab/handbook
npm run dev     # 自动同步 + 实时预览（改源文档保存后需重跑 sync 或重启 dev）
npm run build   # 正式验证：含死链检查，必须 0 报错
```

工作台页面 `/learn/labN` 与阅读页 `/labs/labN-*` 共用同一份正文（壳页 `@include`），**改一处，两边同时更新**。

## 3. 结构约束（最重要的注意事项）

工作台左侧目录直接由正文的 H2/H3 标题生成，标题措辞可以自由改。仍依赖**中文序号前缀**的只有一处：

- 「`五、`AI 提问模板」这一章会在工作台里**默认折叠**（内容已经做成导师栏的快捷提问按钮）——保留「五、」前缀即可享受折叠；改掉前缀则该章会正常展开，不报错。

因此：

- ✅ **可以**：改标题措辞、在章节内自由增删小节（H3）、扩写内容、增删 H2 章节（目录自动跟随）；
- ⚠️ **建议保持**：现有「一、问题场景 → 二、背景知识 → 三、实验任务 → 四、验证」的叙述顺序与「任务二放思考题」的惯例，八个 Lab 结构一致学生才好迁移；
- 「五、AI 提问模板」章节标题的序号前缀不要改。

其他硬约束：

- **思考题与答案一一对应**：题目在正文「任务二」，答案在 `answers/labN-answers.md` 的对应小节。改题必改答案。
- **不要重命名文件**：文件名被 `config.mts`（侧栏）、`data/labs.json`（进度清单）、`tutor-model.ts`（`documentRoute`、resources 路径）、sync 脚本多处引用。

## 4. 正文大改时需要联动的位置

| 联动文件 | 什么情况要改 |
| --- | --- |
| `os-lab/tutor/prompts/labN/context.md` | 该 Lab 的核心机制、术语或任务变了——这是 AI 导师对该 Lab 的认知来源，不更新会答非所问 |
| `tutor-model.ts` 中该 Lab 的 `resources` | 各阶段推荐的代码阅读路径 / 文档卡片链接变了 |
| `handbook/data/labs.json` | 学习步骤、验证命令变了（进度清单页用） |
| `guide/verify.md` | 验证命令或期望输出变了 |

## 5. 写作注意

- 图一律用 mermaid 代码块（构建会暴露语法错误，`npm run build` 能兜住）；
- 站内链接用绝对路径：`/labs/lab3-memory`、`/answers/lab3-answers`（sync 会把源文档间的相对 `.md` 链接改写，但新增链接直接写站内绝对路径最稳）；
- 指向仓库代码文件（如 `kernel/src/trap.rs`）不要写成 markdown 链接（不是站内页面，会成死链），写成行内代码即可；
- 语气面向初学者：先问题、再原理、后代码，与现有 Lab1-5 风格保持一致。

## 6. 复核完成后的验收清单

1. `npm run build` 通过，0 死链；
2. 打开 `/learn/labN`，展开左侧目录逐项点击，确认跳转定位正确、「五、AI 提问模板」默认折叠；
3. 「任务二」题目与答案页逐题对上；
4. 若改了验证命令：实际跑一遍（`cargo run -p kernel --features labN --release`，Lab6-8 用 `make test-labN`）确认期望输出仍然成立；
5. 在 `progress.md` 顶部按现有格式补一条记录（What was done / Testing / Notes）。
