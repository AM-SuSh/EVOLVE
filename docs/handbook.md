# os-lab 学习手册（Web）

自研教学环境的 **A+B 档** 静态学习门户：文档手册化浏览 + Lab 进度勾选与验证命令复制。

## 快速启动

```powershell
cd os-lab/handbook
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`（端口以终端输出为准）。

## 构建与部署

```powershell
npm run build    # 产物：os-lab/handbook/.vitepress/dist/
npm run preview  # 本地预览构建结果
```

## 功能说明

| 能力 | 说明 |
| --- | --- |
| 文档聚合 | 自动同步 `os-lab/labs/`、设计报告等 Markdown |
| Mermaid | 知识地图等图表原样渲染 |
| 学习进度 | 首页与 [学习进度](/guide/progress) 页勾选 Lab1–5 步骤（浏览器 localStorage） |
| 命令复制 | 各 Lab 验证命令、环境激活命令一键复制 |

详细维护说明见 [os-lab/handbook/README.md](../os-lab/handbook/README.md)。

## 与赛题交付关系

手册为 **70% 自研环境** 的教学体验增强，不改变内核代码与 QEMU 验证路径；评审方可按 [os-lab_verify.md](os-lab_verify.md) 在终端复现，也可用本手册作为导航入口。
