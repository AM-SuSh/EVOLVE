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

工作台顶部的连接状态按钮可以随时重新探测。

## 模型怎么配置

**在工作台界面上配置**：进入任意 Lab 工作台（如 [Lab1](/learn/lab1)），点击右上角的 **齿轮按钮（模型设置）**，填写三项：

| 设置项 | 说明 |
| --- | --- |
| 接口地址 | OpenAI 兼容 base URL；本机 Ollama、vLLM 或云端 API 均可，如 `http://127.0.0.1:11434/v1` |
| 模型名 | 如 `qwen2.5:7b`、`deepseek-chat` |
| API Key | 云端 API 需要时填写；本机 Ollama 留空 |

保存后立即重连生效。配置只保存在**本机浏览器**（localStorage），随每次提问发给本地导师服务转发，不会写入仓库；换设备需重新填写。全部留空 = 使用默认的本机 Ollama `qwen2.5:7b`。

服务端只保留少量运维项，用环境变量控制（一般不需要动）：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OS_LAB_TUTOR_PORT` | `8787` | 导师服务监听端口 |
| `OS_LAB_TUTOR_DATA_DIR` | `os-lab/learning/sessions/` | 学习事件 JSONL 落盘目录（已 gitignore） |
| `OS_LAB_TUTOR_ORIGIN` | dev 端口 5173 | 允许的前端来源，逗号分隔 |

前端连接哪个导师服务由 Vite 环境变量 `VITE_OS_LAB_TUTOR_ENDPOINT` 决定（默认 `http://127.0.0.1:8787`），改端口时在 `os-lab/handbook/.env.local` 中写：

```text
VITE_OS_LAB_TUTOR_ENDPOINT=http://127.0.0.1:8788
```

教学提示词全部在 `os-lab/tutor/prompts/` 下按文件管理：`system.md`（教学边界）、`labN/context.md`（各 Lab 上下文）、`stages/stage-*.md`（阶段策略）、`guardrails.yaml`（护栏规则，前后端共用同一份）。改完重启 `npm run tutor` 生效。
