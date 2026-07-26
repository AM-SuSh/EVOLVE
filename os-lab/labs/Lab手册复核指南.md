# Lab 手册人工复核与增补指南

> 面向：复核 / 增补 Lab1–8 引导说明的同学。  
> 本文件位置：`os-lab/labs/Lab手册复核指南.md`（与实验正文同目录，**不是**仓库根目录）。  
> 核心原则一句话：**只改 `os-lab/labs/` 下的源文档；不动 H2 的中文序号前缀；改完在 handbook 跑一次 build。**

---

## 0. 当前材料现状（先读这节）

| 项 | 现状 |
| --- | --- |
| Lab 范围 | Lab1–8 **全部开放**，均有实验指导 + 参考答案 |
| 阅读理解 / 思考题 | 写在各 Lab 正文 **【任务二】**，不再单独维护 `labs/exercises/` |
| 参考答案 | 只在 `labs/answers/labN-answers.md` |
| 手册入口 | `handbook/guide/start.md`（认识 os-lab）；工作台 `/learn/labN` |
| 验证命令 | Lab1–5：`cargo run -p kernel --features labN --release`；**Lab6–8：`make test-labN`（须 VirtIO）** |

> **不要**再建 `labs/exercises/`，也不要在正文/侧栏/进度清单里链到 `/exercises/...`。  
> 若发现 `sync-content.mjs`、`tutor-model.ts` 等仍残留 exercises 路径，复核时改为指向正文【任务二】或 `/answers/labN-answers`，而不是恢复习题目录。

目录职责见同目录 `README.md`。

---

## 1. 改哪里（唯一权威源）

| 要改的内容 | 文件位置 |
| --- | --- |
| 实验指导正文 | `os-lab/labs/labN-*.md`（如 `lab5-fs-and-sync.md`） |
| 思考题参考答案（对应正文【任务二】） | `os-lab/labs/answers/labN-answers.md` |
| 材料目录说明 | `os-lab/labs/README.md`、`os-lab/labs/answers/README.md` |
| 总览 / 知识地图 | `os-lab/labs/overview.md` |
| 本复核指南 | `os-lab/labs/Lab手册复核指南.md` |

⚠️ **绝对不要改** `os-lab/handbook/` 下由 sync 生成的 `labs/`、`learn/`、`answers/`（以及若仍存在的 `exercises/`）——下次 `npm run sync` / `build` 会被覆盖（见 `handbook/.gitignore`）。

---

## 2. 怎么让修改生效、怎么预览

```powershell
cd os-lab/handbook
npm run sync    # 仅同步源文档 → handbook 副本
npm run dev     # sync + 本地预览
npm run build   # 正式验证：含死链检查，必须 0 报错
```

- 工作台 `/learn/labN` 与阅读页 `/labs/labN-*` 共用同一份正文（壳页 `@include`），**改源文档一处，两边一起变**。
- 改完 `labs/` 源文件后，若 `dev` 已在跑，通常需再执行一次 `npm run sync`（或重启 `dev`）才能看到最新内容。

---

## 3. 正文结构约束（工作台依赖）

### 3.1 推荐 H2 骨架（Lab1–8 已对齐）

```text
零、开始之前          ← 环境 / 阅读建议；工作台不按阶段定位这里
一、问题场景          ← 定界 orient
二、背景知识          ← 阅读 read
三、实验任务          ← 验证 run（内含任务一 / 任务二 / 任务三）
四、验证              ← 排错 debug；无「六、」时复盘也回退到这里
五、AI 提问模板       ← 工作台默认折叠（内容已是导师栏快捷提问）
六、…                 ← 可选；目前各 Lab 通常没有
```

工作台阶段映射在 `handbook/.vitepress/theme/tutor-model.ts` 的 `stageManualSection`：

| 序号前缀 | 工作台阶段 | 说明 |
| --- | --- | --- |
| `一、` | orient | 问题场景 |
| `二、` | read | 背景知识 |
| `三、` | run | 实验任务（思考题在「任务二」） |
| `四、` | debug | 验证 |
| `五、` | —— | AI 提问模板，**默认折叠** |
| `六、`（或回退 `四、`） | reflect | 复盘；无「六、」时用「四、」 |

因此：

- ✅ **可以**：改标题措辞（前缀不变即可，如「二、背景知识」→「二、原理与背景」）、在章节内增删 H3、扩写内容；
- ❌ **不要**：删掉 / 调换 H2 中文序号、改成阿拉伯数字、在 H2 层插入无序号新章；
- 若确需增删 H2 结构，必须同步改 `tutor-model.ts` 的 `stageManualSection`。

### 3.2 其他硬约束

- **题目与答案一一对应**：题在正文「任务二」，答案在 `answers/labN-answers.md` 对应小节。改题必改答案。
- **答案文件常见三块**：一、代码解读；二、任务二参考答案；三、任务三现象参考。复核时核对题号与条数一致。
- **不要重命名** `labN-*.md` / `labN-answers.md`：被 `config.mts` 侧栏、`data/labs.json`、`tutor-model.ts`（`documentRoute` / resources）、`sync-content.mjs` 多处引用。

---

## 4. 正文大改时需要联动的位置

| 联动文件 | 什么情况要改 |
| --- | --- |
| `os-lab/tutor/prompts/labN/context.md` | 核心机制、术语或任务变了（AI 导师认知来源） |
| `tutor-model.ts` 中该 Lab 的 `resources` / `documentRoute` | 推荐代码路径、文档卡片链接变了；**勿再链到 `/exercises/`** |
| `handbook/data/labs.json` | 学习步骤、验证命令、期望输出变了 |
| `handbook/guide/verify.md` | 验证命令或期望输出变了 |
| `handbook/guide/start.md` | Lab 开放状态、OSTEP 对应关系、最短上手路径变了 |
| `handbook/.vitepress/config.mts` | 侧栏增删 Lab / 答案条目时（一般勿随意改文件名） |

---

## 5. 写作注意

- **文风**：面向学生；先问题场景，再背景知识，后任务。Lab6–8 已与 Lab1–5 对齐，复核时保持同一语气，不要写回「仅内部实现说明」口吻。
- **问题场景**：以提问 / 矛盾为主，避免在场景里把结论写尽（细节放「背景知识」与任务）。
- **图**：一律 mermaid 代码块（`npm run build` 能暴露语法错误）。
- **站内链接**：优先绝对路径，如 `/labs/lab6-disk-fs`、`/answers/lab6-answers`。
- **仓库源码路径**：写成行内代码（如 `kernel/src/trap.rs`），不要做成站内 markdown 链接（会成死链）。
- **Lab6–8**：正文「环境准备 / 任务一」须强调 `make test-labN`，并写明勿用裸 `cargo run`（无 VirtIO 则看不到 `fs.img`）。

---

## 6. 复核完成后的验收清单

1. `cd os-lab/handbook && npm run build` 通过，**0 死链**。
2. 打开 `/learn/labN`，点五个阶段，确认左栏手册滚到对应「一、～四、」章节。
3. 「任务二」题号 / 题数与 `answers/labN-answers.md` 逐题对上。
4. 全文与入口（`start.md`、`labs.json`、侧栏、`tutor-model` resources）**不再出现**可用的 `/exercises/` 入口。
5. 若改了验证命令或期望输出：Lab1–5 实际跑 `cargo run ...`；Lab6–8 实际跑 `make test-labN`，确认文档中的期望输出仍成立。
6. 在仓库根目录 `progress.md` **顶部**按现有格式追加一条（What was done / Testing / Notes）。

---

## 7. 常见误区

| 误区 | 正确做法 |
| --- | --- |
| 改 handbook 里同步出来的 `labs/*.md` | 只改 `os-lab/labs/` 源文件，再 sync |
| 为 Lab6–8 新建 `exercises/*.md` | 题目写进正文【任务二】，答案进 `answers/` |
| 以为没有「六、」工作台会坏 | 正常；复盘阶段会回退到「四、验证」 |
| Lab6–8 仍写 `cargo run --features labN` 作为主验证 | 主验证写 `make test-labN` |
| 把本指南放到仓库根或只改 handbook 副本 | 权威源是 `os-lab/labs/Lab手册复核指南.md` |