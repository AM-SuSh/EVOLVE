# 学生工作台 UI 交互说明

本文档描述教学 IDE 各面板的交互契约及当前实现，供成员 A/C 联调与回归验收。
布局与空态核对见 [`day1-workbench-audit.md`](./day1-workbench-audit.md)（成员 B · Day1）。

## 学习材料

- 顶栏与首页「学习材料」进入 `/materials`（`MaterialsShelf`），不再直链单一 PDF。
- **内置**：操作系统导论（OSTEP 中译）始终在列表中。
- **教师**：同页可上传补充材料（PDF/EPUB/MD/TXT/Word，≤80 MiB），可删除自己上传的项；不能删内置。
- **学生**：同一列表自选「打开」；上传材料经 `GET /materials/file?id=&token=` 读取。
- 接口：`GET /materials`；教师 `POST|DELETE /teacher/materials`；文件落盘 `os-lab/learning/uploads/materials/`（已 gitignore）。

## 布局

| 区域 | 组件 | 职责 |
| --- | --- | --- |
| 左栏 | `ManualPane` | 实验手册（Markdown 渲染、目录、阅读位置）；知识路径条属本周 Day5 挂载，当前未实现 |
| 右栏 · 工作区 | `CodePanel`（Monaco）+ 内联底部 dock | 源码编辑；底栏页签：**终端** / **Problems** / **测试结果** |
| 右栏 · 学习支持 | `TutorPane`（含 `TutorEvidenceBar`）/ `ReportPanel` / `TraceViewer` | 页签：**AI 导师** / **实验报告** / **Trace** |

桌面端为「左手册 + 右实践区（上：工作区；下：学习支持）」布局；工作区内部再分「代码 + 底栏」。

- **拖动**：手册与实践区之间的竖条调整左右宽度；工作区与学习支持之间的横条调整上下高度
- **开关**：顶栏「手册 / 工作区 / 学习支持」控制三区显示；收起后**不**留展开占位条，靠顶栏开关恢复。各区标题栏仍有收起/铺满控件
- **滚动**：各分区内容区独立滚动（手册、代码、终端输出、导师、报告、Trace）
- **我的系统 ↔ 系统构建路径**：学习侧解锁下一层后，须在「系统构建路径」点击该层「领取并开始」才会 `scaffold/upgrade`；顶栏「我的系统 · labN」与已发放层同步。弹窗内不再单独提供「升级到下一层」按钮（仅保留首次初始化 Lab1）。

> 无独立 `BottomDock.vue`：底部页签由 `LabWorkspace` 内联实现。

## 文件状态 A/M/T/G/!

| 标记 | 含义 | 数据来源 |
| --- | --- | --- |
| A | 本 Lab 新增 | `lab.yaml` → `starter_files.added` |
| M | 你已修改 | `/fs/status` 基线哈希 vs 当前哈希 |
| T | 待完成（教师发放的任务文件，优先阅读文件头注释） | 任务变体 manifest |
| G | 自动生成 | `starter_files.generated` |
| ! | 冲突/过期 | 基线升级无法合并 |

工作区通过 `GET /fs/status?labId=...` 获取服务端基线哈希与当前哈希；前端不再维护文件状态 mock 或重复的 Lab 文件清单。请求失败时不显示徽章（`source='none'`），不回落假状态。

## AI 导师 · 证据条（TutorEvidenceBar）

挂载位置：学习支持 · **AI 导师**页签，顶栏与消息列表之间。

- 数据来源：`POST /chat`（及 SSE `meta`/`done` 帧）回传的 `tutorState`（成员 C 状态机权威字段）。
- 展示三列：**阶段**（`stage` → `tutorStages` 短名）· **已有证据**（`toolContext` / `evidenceRefs`）· **下一步所需**（`gate` / `actions` 中文映射）。
- 次要徽章：`hintLevel` → `L0`…`L4`（完整提示阶梯文案属 Day3，本条仅展示层级）。
- 空态：尚未收到服务端 `tutorState` 时用本地 `activeStage` +「还没有服务端证据摘要…」，**不 mock** run / 断言；无 `latestRun.verified` 时不出现「已验证通过」话术。
- 新对话清空证据条状态；消息内 `run:`/`trace:` 点击跳转属 Day3。

## Problems 面板

挂载位置：工作区**底部**页签（与终端、测试结果并列）。

1. 学生经 tutor 运行通道执行构建/验证后，服务端解析 cargo `--message-format=json`。
2. 按 `runId` 调 `GET /run/diagnostics?runId=...` 拉取结构化诊断。
3. 列表项：级别、文件、行列、消息摘要。
4. **点击条目** → 打开对应工作区文件，并由 `MonacoEditor.revealLine(line)` 跳转。
5. 与 `runId` 绑定，避免混入历史构建结果。
6. 空态：无 run →「还没有编译诊断；先保存再构建」；有 run 无条目 → 说明构建成功或无可解析诊断；请求失败显示错误，**不 mock 诊断列表**。

## 测试结果面板

挂载位置：工作区**底部**页签。

- 汇总最近一次**可信验证命令**返回的断言（期望 vs 实际）。
- 无 run：提示先在终端运行可信验证。
- 有 run 但无断言数组：明确「未返回可展示断言，不表示验证已通过」，不伪造通过勾选。

## Trace 面板

挂载位置：**学习支持**区页签（与 AI 导师、实验报告并列），不是底部 dock。

1. 可信运行结束后，按 `runId` 调 `GET /runs/:id/trace` 拉取 trace JSONL（`trace-v1` schema）。
   - 404/网络/服务异常：保持可信空态，文案说明「轨迹查询尚未返回真实事件 / 不会播放预设动画」，不 mock。
   - 前端再校验一遍事件形态（`isValidTraceEvent`），异常 trace 不污染视图。
2. 两个视图（Lab2 主视图）：
   - **Trap 时序**（`TraceTrapView`）：纵向时间轴按事件顺序排列（不允许前端重排）；`trap_enter` 为主标记，`task_switch` 为上下文；连续 `trap_enter` 之间无 `task_switch` 时标注「单任务 syscall 密集」。
   - **任务时间线**（`TraceTimelineView`）：每个 pid 一条横向泳道；`task_switch` 画 Running 块（延伸到下一条 switch）；`trap_enter` 画轻量竖线；两次 Running 之间的 Ready/Exited 不伪造，标注「未观测」。
3. 播放控制：播放/暂停、单步前进/后退、速度（0.5/1/2/4x）、事件类型/pid 过滤、重置；播放头竖线在时间线视图中标出当前位置。
4. 大数据：事件列表 >200 条时只渲染前 200 条并提示「用过滤或播放控制查看其余」；视图主体靠滚动承载。
5. 源码跳转：选中事件后「跳到源码」按静态映射跳转（`trap_enter` → `kernel/src/trap.rs`，`task_switch` → `kernel/src/task.rs`），复用 `codePanelRef.openAtLine`。
6. 关键帧插入报告：选中事件后「插入报告」把事件格式化为证据文本，复用 `LabWorkspace.onInsertReport` → `ReportPanel`（模板写入当前节；Markdown 追加到正文）。
7. 事件上报：切换视图或移动播放头时上报 `trace_inspected`（事件 v2，字段 `runId`/`view`/`eventRange:{start,end}`）。
8. 空数据与异常 trace 显示明确空态，不展示预设动画；移动端控制条与视图纵向堆叠。
9. Sv39 page walk 视图暂未实现：真实 trace 无 `page_walk` 事件，按 `visualization/README.md` 应显示降级空态而非伪造；OPRE 页表任务改为源码降级路径。

## 实验报告面板

挂载位置：**学习支持**区页签。

- **编写格式下拉**：**模板填写** / **Markdown 自由编写**。提交、预览、导出一律以当前下拉选项为准。已移除 Word 编辑页；Word/PDF 用「上传附件」。
- **图片库**（始终可浏览）：上传 → 改名 → 勾选 → 插入；缩略图可放大预览。模板插入**当前段**末尾并在段下显示；Markdown 下方有「插入结果」；完整排版看「预览最终稿」。
- 「收获与反思」系统固定。终端插入当前正在编辑的位置。
- **预览最终稿**：与导出 / `POST /reports` 使用同一份 Markdown。
- **教师布置 UI**：弹窗编辑；可导入 Markdown；无需配置「用途 / 行数」。

## 终端（xterm）

挂载位置：工作区**底部**页签。

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
