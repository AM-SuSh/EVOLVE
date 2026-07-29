# 学生工作台 UI 交互说明（第一周原型）

本文档描述教学 IDE 各面板的交互契约，供成员 A/C 联调与第 2 周实现参考。

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
- **我的系统 ↔ 系统构建路径**：学习侧解锁下一层后，须在「系统构建路径」点击该层「领取并开始」才会 `scaffold/upgrade`；顶栏「我的系统 · labN」与已发放层同步。弹窗内不再单独提供「升级到下一层」按钮（仅保留首次初始化 Lab1）。

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

1. 可信运行结束后，按 `runId` 调 `GET /runs/:id/trace` 拉取 trace JSONL（`trace-v1` schema）。
   - 接口由成员 C 提供；未就绪时（404/异常）保持可信空态，文案明确「查询接口尚未返回真实事件」，不 mock、不播放预设动画。
   - 前端再校验一遍事件形态（`isValidTraceEvent`），异常 trace 不污染视图。
2. 两个视图（Lab2 主视图）：
   - **Trap 时序**（`TraceTrapView`）：纵向时间轴按事件顺序排列（不允许前端重排）；`trap_enter` 为主标记，`task_switch` 为上下文；连续 `trap_enter` 之间无 `task_switch` 时标注「单任务 syscall 密集」。
   - **任务时间线**（`TraceTimelineView`）：每个 pid 一条横向泳道；`task_switch` 画 Running 块（延伸到下一条 switch）；`trap_enter` 画轻量竖线；两次 Running 之间的 Ready/Exited 不伪造，标注「未观测」。
3. 播放控制：播放/暂停、单步前进/后退、速度（0.5/1/2/4x）、事件类型/pid 过滤、重置；播放头竖线在时间线视图中标出当前位置。
4. 大数据：事件列表 >200 条时只渲染前 200 条并提示「用过滤或播放控制查看其余」；视图主体靠滚动承载。
5. 源码跳转：选中事件后「跳到源码」按静态映射跳转（`trap_enter` → `kernel/src/trap.rs`，`task_switch` → `kernel/src/task.rs`），复用 `codePanelRef.openAtLine`。
6. 关键帧插入报告：选中事件后「插入报告」把事件格式化为证据文本，复用 `LabWorkspace.onInsertReport` → `ReportPanel` 过程记录。
7. 事件上报：切换视图或移动播放头时上报 `trace_inspected`（事件 v2，字段 `runId`/`view`/`eventRange:{start,end}`）。
8. 空数据与异常 trace 显示明确空态，不展示预设动画；移动端控制条与视图纵向堆叠。
9. Sv39 page walk 视图暂未实现：真实 trace 无 `page_walk` 事件，按 `visualization/README.md` 应显示降级空态而非伪造；OPRE 页表任务改为源码降级路径。

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
