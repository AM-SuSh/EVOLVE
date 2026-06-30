# Web 学习手册

自研 `os-lab` 教学环境的静态学习门户：聚合实验指导、习题、答案与设计报告，支持 Mermaid 图表渲染、Lab 进度勾选与验证命令一键复制。

源码与配置位于 `os-lab/handbook/`（VitePress）。

## 本地运行

**前置**： [Node.js](https://nodejs.org/) 18+（含 `npm`）

```powershell
cd os-lab/handbook
npm install
npm run dev
```

浏览器打开终端提示的地址（默认 `http://localhost:5173`）。

`npm run dev` 与 `npm run build` 会自动从 `os-lab/labs/`、`os-lab/docs/`、仓库 `docs/` 同步 Markdown 到站点内容目录。

## 构建静态站点

```powershell
npm run build    # 产物：os-lab/handbook/.vitepress/dist/
npm run preview  # 本地预览构建结果
```

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 文档聚合 | 实验指导、习题、参考答案、设计报告等统一浏览 |
| Mermaid | 知识地图等图表原样渲染 |
| 学习进度 | 首页与「学习进度」页可勾选 Lab1–5 步骤（浏览器 localStorage 保存） |
| 命令复制 | 各 Lab 验证命令、环境激活命令一键复制 |

## 与验证路径的关系

手册为 **70% 自研环境** 的教学体验增强，不改变内核代码与 QEMU 验证结论。终端复现请按 [os-lab_verify.md](os-lab_verify.md)；手册可作为文档导航与命令速查入口。
