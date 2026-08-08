# os-lab 学习手册

基于 [VitePress](https://vitepress.dev/) 的静态学习门户，聚合自研教学文档并提供学习进度勾选与验证命令复制。学生入门请先读 `guide/start.md`（规划 Lab1–8）。

- **A 档**：实验指导、参考答案、设计报告等 Markdown 手册化浏览（含 Mermaid）
- **B 档**：首页与学习进度页中的交互式清单（`localStorage` 持久化）

## 前置要求

- [Node.js](https://nodejs.org/) 18+（含 `npm`）

## 开发与预览

```powershell
cd os-lab/handbook
npm install
npm run dev
```

浏览器打开终端提示的本地地址（默认 `http://localhost:5173`）。

`npm run dev` / `npm run build` 会自动执行 `npm run sync`。公开项目文档同步到 `project/`、`setup/`；`learn/` 只生成工作台路由壳。实验手册正文不进入静态构建，而由 tutor-server 登录后按权限读取（同步目录已 gitignore，勿手改）。

## 构建静态站点

```powershell
npm run build
npm run preview
```

产物在 `.vitepress/dist/`，可部署到 GitHub Pages、静态对象存储等。

## 目录说明

```text
handbook/
├── index.md              # 首页（含 LabProgress）
├── guide/                # 手册原生页面（start 入门、进度、验证速查）
├── data/labs.json        # Lab 元数据（进度组件数据源）
├── scripts/sync-content.mjs
├── labs/ … setup/      # 同步生成（gitignore）
└── .vitepress/           # VitePress 配置与主题组件
```

## 内容源

| 手册路径 | 源文件 |
## 学生数据持久化边界

学生代码仍只放在仓库根目录的 `student-labs/<username>/`，学习数据不混入代码工作区。Tutor Server 按数据库用户 ID 统一保存：

```text
learning/student-data/<userId>/
  reports/<labId>/draft.json
  reports/<labId>/draft-attachments/
  reports/<labId>/submission.md
  reports/<labId>/attachments/
  conversations/<sessionId>.jsonl
  conversations/<sessionId>.json
  events/<sessionId>.jsonl
  runs/<labId>/<runId>/output.log
  runs/<labId>/<runId>/trace.jsonl
```

SQLite `learning/os-lab.db` 保存权限、索引、运行状态、断言、评分和报告元数据；文件系统保存正文、会话原文和运行制品。实验报告正文与附件不使用浏览器 `localStorage` / IndexedDB 持久化，前端只通过 `/reports/draft` 读写当前账号、当前 Lab 的文件；对话仍可使用本地副本并通过 `/conversations/mine` 同步。旧 `learning/sessions/`、旧报告附件目录只用于兼容读取，不再接收新数据。

| --- | --- |
| `/learn/labN` | 路由壳；正文由 `GET /manual` 按教师发布与学习证据返回 |
| `/project/*` | `os-lab/docs/` |
| `/setup/*` | 仓库 `docs/` 中环境安装与完整验证文档 |

修改源 Markdown 后重新 `npm run dev` 或 `npm run sync` 即可更新站点。
