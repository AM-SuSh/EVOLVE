# 学生工作台 UI 交互说明

本文档描述教学 IDE 各面板的交互契约及当前实现，供成员 A/C 联调与回归验收。

## 布局

| 区域 | 组件 | 职责 |
| --- | --- | --- |
| 左栏 | `ManualPane` | 实验手册、知识路径、阶段任务 |
| 右上半 | `ReportPanel` / `TutorPane` / `CodePanel` | 实验报告、AI 导师、**工作区**（三页签切换） |
| 右下半 | `BottomDock` + `TerminalPanel` | 终端、Problems、Trace、测试结果 |

桌面端为「左手册 + 右实践区（上：报告/导师/工作区；下：终端）」三栏布局。

- **拖动**：手册与实践区之间的竖条调整左右宽度；实践区与终端之间的横条调整上下高度
- **开关**：各分区标题栏右侧图标可收起；收起后出现「展开…」条可重新打开
- **滚动**：各分区内容区独立滚动（手册、报告、导师、代码、终端输出）

## 文件状态 A/M/T/G/!

| 标记 | 含义 | 数据来源 |
| --- | --- | --- |
| A | 本 Lab 新增 | `lab.yaml` → `starter_files.added` |
| M | 你已修改 | `/fs/status` 基线哈希 vs 当前哈希 |
| T | 待完成 | 任务变体 manifest |
| G | 自动生成 | `starter_files.generated` |
| ! | 冲突/过期 | 基线升级无法合并 |

工作区通过 `GET /fs/status?labId=...` 获取服务端基线哈希与当前哈希；前端不再维护文件状态 mock 或重复的 Lab 文件清单。

## Problems 面板

1. 学生运行 `cargo build`（或 recipe 中的构建步骤）后，服务端解析 `--message-format=json`。
2. 列表项：级别、文件、行列、消息摘要。
3. **点击条目** → 打开对应工作区文件，并由 `MonacoEditor.revealLine(line)` 跳转。
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

诊断跳转会上报 `diagnostic_opened`，并携带 `runId`、`file`、`line` 与诊断 `code`。
