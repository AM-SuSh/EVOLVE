---
layout: home

hero:
  name: os-lab
  text: 操作系统教学实验学习手册
  tagline: Rust + RISC-V 64 · 单内核 feature 渐进式 · 问题驱动自学
  actions:
    - theme: brand
      text: 实验总览
      link: /labs/overview
    - theme: alt
      text: 学习进度
      link: /guide/progress
    - theme: alt
      text: 5 分钟上手
      link: /guide/quick-start

features:
  - icon: 📖
    title: A 档 · 文档手册
    details: 聚合实验指导、习题、参考答案与设计报告；Mermaid 知识地图原样渲染，与 labs/ 源文档自动同步。
  - icon: ✅
    title: B 档 · 学习门户
    details: Lab1–5 进度勾选、验证命令一键复制、期望输出对照；进度保存在浏览器本地，不依赖后端。
  - icon: 🧩
    title: 单内核渐进式
    details: 同一套 kernel 通过 lab1→lab5 feature 逐级「长出」能力，脉络比 8 个独立内核更清晰。
  - icon: 🤖
    title: AI 协作友好
    details: 每章实验文档含 AI 提问模板；本手册可作为与 AI 对话时的结构化上下文入口。
---

## 学习路径一览

建议顺序：**总览 → 按 Lab 阅读指导 → QEMU 验证 → 文字习题 → 对照答案**。

<LabProgress />

> 提示：上方进度条数据仅保存在本机浏览器；换设备需重新勾选。实验正文修改后请执行 `npm run sync` 或 `npm run dev` 自动同步。
