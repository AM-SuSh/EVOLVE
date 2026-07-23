# os-lab 学习手册

基于 [VitePress](https://vitepress.dev/) 的静态学习门户，聚合自研教学文档并提供 Lab1–5 进度勾选与验证命令复制。

- **A 档**：实验指导、习题、答案、设计报告等 Markdown 手册化浏览（含 Mermaid）
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

`npm run dev` / `npm run build` 会自动执行 `npm run sync`，从 `../labs/`、`../docs/`、`../../docs/` 同步 Markdown 到 `labs/`、`exercises/`、`answers/`、`project/`、`setup/`（这些目录已 gitignore，勿手改）。

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
├── guide/                # 手册原生页面（上手、进度、验证速查）
├── data/labs.json        # Lab 元数据（进度组件数据源）
├── scripts/sync-content.mjs
├── labs/ … setup/      # 同步生成（gitignore）
└── .vitepress/           # VitePress 配置与主题组件
```

## 内容源

| 手册路径 | 源文件 |
| --- | --- |
| `/labs/*` | `os-lab/labs/*.md` |
| `/exercises/*` | `os-lab/labs/exercises/` |
| `/answers/*` | `os-lab/labs/answers/` |
| `/project/*` | `os-lab/docs/` |
| `/setup/*` | 仓库 `docs/` 中环境安装与完整验证文档 |

修改源 Markdown 后重新 `npm run dev` 或 `npm run sync` 即可更新站点。
