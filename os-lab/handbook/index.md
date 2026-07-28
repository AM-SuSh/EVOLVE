---
layout: home

hero:
  name: os-lab
  text: 操作系统自学实验环境
  tagline: Rust + RISC-V 64 · 单内核 feature 渐进式 · AI 引导的过程性学习
  actions:
    - theme: brand
      text: 进入引导式学习
      link: /guide/ai-tutor
    - theme: alt
      text: 认识 os-lab
      link: /guide/start

features:
  - icon: 🧭
    title: 引导式学习工作台
    details: 左栏实验手册、右栏 AI 导师。导师只提问不代写，记录你的判断、验证与复盘，形成可导出的学习证据链。
  - icon: 🧩
    title: 单内核渐进式 Lab1–8
    details: 同一套 kernel 通过 feature 逐级「长出」能力：裸机启动 → trap → 虚存 → 进程 → 文件/管道 → 磁盘 FS → IPC/信号 → 线程/同步。
  - icon: 📊
    title: 过程性评分
    details: 提问质量、验证行为、试错与复盘按统一 rubric 打分；护栏拦截「索要完整答案」，教师端可查看学习报告。
  - icon: 📖
    title: 完整实验材料
    details: 8 个 Lab 的指导与思考题按教师发布和学习进度逐层开放；教师始终可预览、编辑并安排任务。
---

## 怎么开始

第一次来：先读 **[认识 os-lab](/guide/start)** 配好环境，然后直接进入 **[引导式学习](/guide/ai-tutor)**——从 [Lab1 工作台](/learn/lab1) 起步，逐层解锁到 Lab8。

学生的实验正文统一放在引导式学习工作台中：教师先开放实验，学生完成当前 Lab 的可信验证与学习复盘后，下一层才可查看和领取。
