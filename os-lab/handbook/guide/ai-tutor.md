---
title: 引导式学习
description: 在实验手册旁边，用一位只提问不代写的 AI 导师学习操作系统
---

# 引导式学习

<TutorEntry />

## 这套环境在做什么

- **导师只提问，不代写。** 要完整代码会被护栏挡下并转成任务分解；每次提问都会被归类（概念澄清 / 现象描述 / 追因分析 / 对比迁移 / 实验验证 / 索要答案）。
- **导师知道你在读哪一节。** 左栏手册的当前章节会随提问一起送给模型，所以它能顺着「你刚读到 `sscratch` 那节」继续追问。
- **说过的话要用 QEMU 检验。** 每一层都要留下一次通过验证和一次学习复盘，下一层才会解锁。
- **过程留痕。** 所有交互按 `interaction-event` v1 契约存在本机浏览器，可随时导出 JSONL；评分只在[教师端](/guide/teacher-report)呈现，不干扰学习。

## 需要本地模型吗

不需要也能用。没有连上模型时导师退化为**离线引导**：按阶段给出固定的追问策略，护栏、事件记录、验证与复盘全部照常工作。

想接真实模型时，在 `os-lab/handbook` 下另开一个终端：

<CopyCommand command="npm run tutor" />

默认连本机 `http://127.0.0.1:11434/v1`（Ollama）的 `qwen2.5:7b`，可用环境变量覆盖：

<CopyCommand command="OS_LAB_LLM_BASE_URL=... OS_LAB_LLM_MODEL=... OS_LAB_LLM_API_KEY=... npm run tutor" />

工作台顶部的连接状态按钮可以随时重新探测。
