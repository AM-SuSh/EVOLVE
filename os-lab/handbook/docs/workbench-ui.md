# 学生工作台 UI 交互说明（第一周原型）

本文档描述教学 IDE 各面板的交互契约，供成员 A/C 联调与第 2 周实现参考。

## 四区布局

| 区域 | 组件 | 职责 |
| --- | --- | --- |
| 左上 | `ManualPane` | 实验手册、知识路径、阶段任务 |
| 右上 | `ReportPanel` / `TutorPane` | 实验报告与 AI 导师 |
| 中部 | `CodePanel` + `MonacoEditor` | 文件树、语法高亮编辑与保存 |
| 底部 | `BottomDock` | 终端、Problems、Trace、测试结果 |

移动端降级为 `manual | code | tutor | run` 四个 Tab，每次只显示一个主区。

## 文件状态 A/M/T/G/!

| 标记 | 含义 | 数据来源（目标） |
| --- | --- | --- |
| A | 本 Lab 新增 | `lab.yaml` → `starter_files.added` |
| M | 你已修改 | `/fs/status` 基线哈希 vs 当前哈希 |
| T | 待完成 | 任务变体 manifest |
| G | 自动生成 | `starter_files.generated` |
| ! | 冲突/过期 | 基线升级无法合并 |

第一周使用 `mockFileStatus()`；第 2 周切换为 `GET /fs/status?labId=...`。

## Problems 面板

1. 学生运行 `cargo build`（或 recipe 中的构建步骤）后，服务端解析 `--message-format=json`。
2. 列表项：级别、文件、行列、消息摘要。
3. **点击条目** → `MonacoEditor.revealLine(line)` 跳转（第 2 周）。
4. 与 `runId` 绑定，避免混入历史构建结果。

## Trace 面板

1. 可信运行结束后，按 `runId` 拉取 trace JSONL（`trace-v1` schema）。
2. 支持播放/暂停/单步/事件过滤/跳到源码。
3. 空数据与异常 trace 显示明确空态，不展示预设动画。
4. 关键帧可插入实验报告作为证据。

## 终端（xterm）

- MVP 为**只读输出渲染** + 上方命令 textarea；非 PTY。
- SSE `output` 帧原样 `write` 到 xterm，保留 ANSI。
- `scrollback` 默认 5000 行；停止/超时写入醒目提示行。

## 事件（与成员 C 契约）

| 用户动作 | 目标事件（v2） |
| --- | --- |
| 打开文件 | `code_open` |
| 保存 | `code_save` |
| 运行开始/结束 | `run_started` / `run_finished` |
| 打开诊断 | `diagnostic_opened` |
| 查看 trace | `trace_inspected` |

第一周前端可不全部上报，但组件应预留 `runId`、`path`、`line` 等 props。
