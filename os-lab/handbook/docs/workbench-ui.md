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
| 左栏 | `ManualPane` + `KnowledgePathBar` | 实验手册（Markdown 渲染、目录、阅读位置）；Lab2 手册顶挂知识路径五段条（定稿见 `lab2/knowledge-path.md`） |
| 右栏 · 工作区 | `CodePanel`（Monaco）+ 内联底部 dock | 源码编辑；底栏页签：**终端** / **Problems** / **测试结果** |
| 右栏 · 学习支持 | `ReportPanel` / `AssessmentPane` / `TraceViewer`；AI 对话为浮层 | 页签：**实验报告** / **学习评价** / **Trace** |

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

挂载位置：学生端**悬浮 AI 导师窗口**，顶栏与消息列表之间；从右下角悬浮入口打开（教师端不显示）。

- 数据来源：`POST /chat`（及 SSE `meta`/`done` 帧）回传的 `tutorState`（成员 C 状态机权威字段）。
- 展示三列：**阶段**（`stage` → `tutorStages` 短名）· **已有证据**（`toolContext` / `evidenceRefs`）· **下一步所需**（`gate` / `actions` 中文映射）。
- 提示阶梯徽章：`hintLevel` → `L0 · 观察复现` … `L4 · 升阶边界`（通用短文案；具体 Lab 话术仍由服务端 / manifest）。
- 拒答态：`gate === 'answer-guardrail'` 或 `actions` 含 `apply-answer-guardrail` 时显示「拒答」标记；消息 meta 同步「已拒答完整实现」。
- 空态：尚未收到服务端 `tutorState` 时用本地 `activeStage` +「还没有服务端证据摘要…」，**不 mock** run / 断言；无 `latestRun.verified` 时不出现「已验证通过」话术。
- 新对话清空证据条状态。

## AI 导师 · 证据引用跳转（Day3）

- 正文中的 `run:<id>` / `trace:<id>` 渲染为可点链接；助手消息与证据条展示可点 chips（过滤 `event:`）。
- 导航由 `LabWorkspace.navigateEvidenceRef` 统一处理：
  - `run:` → 底部 **测试结果** 页签（并设置 `lastRunId`）
  - `trace:` → 学习支持 **Trace** 页签，并 `TraceViewer.seek(0)`
  - `diag:` / `diagnostic:` / 诊断摘要 → 底部 **Problems**；若已有诊断条目则复用 `openAtLine`
- 无真实 run / 事件 / 诊断时只切面板并走可信空态，不造假数据。

## AI 导师 · 添加到对话

工作区各面板可将当前内容附到导师输入区，与问题一并发送（不立刻自动发送）：

| 来源 | 附带内容（可选范围） |
| --- | --- |
| 工作区 | **选区优先**；无选区则光标附近片段 |
| 终端 | **xterm 选区优先**；无选区则本次完整输出 |
| Problems | 全部诊断或**单条** |
| 测试结果 | 全部断言，或**单条断言** |
| 手册 | 当前阅读章节正文 |
| Trace | 当前选中事件（`formatTraceEvidence`） |

- 附件以 chips 显示在输入框上方，可单独移除；最多 5 段、单段约 6000 字截断。
- **点击 chip 可溯源**：跳回工作区行号 / 终端 / Problems / 测试结果 / 手册章节 / Trace 事件。
- 发送后学生气泡保留可点附件 chips；完整拼装正文仍交给导师。
- 发送时由 `formatChatWithAttachments` 拼进用户消息；新会话清空待发附件。

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
- 关键断言提示：Lab2 的测试结果页固定提示 `Yield round ×5`，并注明「退出码 0 不足为凭」；对应断言项在“当前结果”和“近期历史”中高亮。
- 无 run：提示先在终端运行可信验证。
- 有 run 但无断言数组：明确「未返回可展示断言，不表示验证已通过」，不伪造通过勾选。

## Trace 面板

挂载位置：**学习支持**区页签（与实验报告、学习评价并列；AI 导师为悬浮窗口），不是底部 dock。

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
7. **OPRE 条**（`OpreBar`，Day5）：挂在 Trace intro 下；Lab2 Trap→T-OPRE-1、时间线→S-OPRE-1；每步「插入报告」走同一 `insert-report` 通道；无事件显示 `opre.empty_trace`，不锁死、不播假动画；Lab3 走 P-OPRE-1 降级模板（文案见 `visualization/opre-copy-final.md`）。
8. 事件上报：切换视图或移动播放头时上报 `trace_inspected`（事件 v2，字段 `runId`/`view`/`eventRange:{start,end}`）。
9. 空数据与异常 trace 显示明确空态，不展示预设动画；移动端控制条与视图纵向堆叠。
10. Sv39 page walk 视图暂未实现：真实 trace 无 `page_walk` 事件，按 `visualization/README.md` 应显示降级空态而非伪造；OPRE 页表任务改为源码降级路径。

## 实验报告面板

挂载位置：**学习支持**区页签。

- **编写格式下拉**：**模板填写** / **Markdown 自由编写**。提交、预览、导出一律以当前下拉选项为准。已移除 Word 编辑页；Word/PDF 用「上传附件」。
- **图片库**（始终可浏览）：上传 → 改名 → 勾选 → 插入；缩略图可放大预览。模板插入**当前段**末尾并在段下显示；Markdown 下方有「插入结果」；完整排版看「预览最终稿」。
- 「收获与反思」系统固定。终端插入当前正在编辑的位置。
- **预览最终稿**：与导出 / `POST /reports` 使用同一份 Markdown。
- **教师布置 UI**：弹窗编辑；可导入 Markdown；无需配置「用途 / 行数」。

## 评分 v2 · 学生得分区（Day4）

挂载位置：学习支持 · **学习评价**页签（与实验报告同级；`AssessmentPane` → `AssessmentScorePanel`）。

- **生成**：学生登录后点「生成 / 刷新评价」→ `POST /assessment`，body `{ labId, sessionId }`；权威结果为 `assessment`（`rubric-v2.0.0`：`total` / `dimensions` / 14 `items` / `evidenceRefs`）。
- **展示**：综合分 + 过程/结果/反思；细项可展开；`status === unobserved` 或无分显示「未观察到」，禁止凭空满分话术。
- **跳转**：细项 chips 经 `LabWorkspace.navigateEvidenceRef`：
  - `run:` → 底部测试结果（无断言则终端）
  - `trace:` → Trace
  - `diag:` → Problems
  - `event:` → 实验报告页签（事件证据落点）
- **空态**：未登录 / 无 session / 请求失败时说明原因，**不**用本地 `scoreEvents` 启发式冒充 v2。

## 实验报告操作文案

- **AI 点评**：把报告发给 AI 助手（浮层对话），不是真人老师。
- **提交给老师**：提交前弹窗二次确认；重复提交覆盖本实验上一份。

## 评分 v2 · 教师评分复核（Day4–5）

挂载：`/guide/teacher-report`（`TeacherReport`）。与「实验验收」页（`TeacherReview` / 报告批语）不同入口。

- **数据**：教师登录后 `GET /teacher/reviews` → `automaticResult`（与学生 items 同形）；主区复用同一 `AssessmentScorePanel`。
- **限制**：仅展示已进入复核队列的评价；未触门控的会话显示可信空态，不回落旧启发式分。
- **引用**：教师页无学生工作台；点击 evidenceRefs 复制引用并提示，不假装跳进 IDE。
- **改分留痕（Day5）**：`pending` 项可提交 `POST /teacher/review`（`confirmed` / `corrected` / `dismissed` + 必填 `rationale` + 合法 `evidenceRefs`；`corrected` 时带维度总分 `correctedResult`）。`automaticResult` 只读不变；`decisions[]` 作审计时间线。导航「评分复核」指向本页。

## 知识路径条（Day5）

挂载：`ManualPane` 工具栏与正文之间（`KnowledgePathBar`）。

- Lab2：五段（先修 / 本机制 / 产物 / 必观证据 / 迁移），文案对齐 `lab2/knowledge-path.md`。
- 点击段：滚到手册内标题匹配章节（背景/任务/验证/思考等）；无匹配仅高亮该段。
- 变体弱提示：`scaffold.variants[labId]` 为 `debug|remedial` / `fill` 时显示一行焦点说明；其它 Lab 不展示假路径。

## Lab 工厂向导（Day6）

挂载：`/guide/lab-factory`（`LabCreateWizard`）。导航「Lab 工厂」仅教师可见。

与工作台右栏「教学安排」（`TeacherPublishPanel`：班级开放 / 任务变体下发）分工不同：本页只做 **包校验与版本发布**，不在线新建或改写 `lab.yaml`。

| 步骤 | 动作 | API |
| --- | --- | --- |
| 1 元数据 | 选 `labId` + `variant`；只读展示 inspect（title/version/status/recipe/已发布） | `GET /teacher/lab-factory?labId=` |
| 2 校验 | schema lint + 临时目录 dry-run | `POST /teacher/lab-factory/validate` |
| 3 隔离测试 | 取得通过的 `testRunId` | `POST /teacher/lab-factory/test` |
| 4 批准发布 | 勾选明确批准 + 审批说明 | `POST /teacher/lab-factory/publish` |

- **门控**：未通过前一步不可跳到后续；测试未通过不能发布；错误展示服务端 `error`/`errors`，不伪造通过态。
- **发布后**：提示到对应 Lab 工作台「教学安排」下发变体（学生领取仍走 access/scaffold）。
- **保存待下发**：发布成功会自动保存最近一次发布记录；下次打开 Lab 工厂时顶部会显示「打开工作台并下发变体」入口，不必重跑发布向导。
- **直达教学安排**：发布 CTA 跳转到 `/learn/labN?view=teaching&variant=...`，工作台会自动切到「教学」视图并预选工厂发布的变体，可一键「开放并下发」。
- **自然入口**：教师导航、教师工作台顶栏、Lab 工厂页都提供「教学安排」入口；存在已保存发布记录时会自动带上对应 Lab 和变体。
- **空态**：非教师 / 未登录显示「需要教师账号」；连不上 tutor 时说明原因。

## 终端（xterm）

挂载位置：工作区**底部**页签。

- 交互式 xterm：命令直接在终端 `$` 后输入；上下方向键在 Lab 推荐命令库中循环，`Tab` 补全推荐命令，`Enter` 运行，`Ctrl+C` 停止/清行，`Ctrl+V` 粘贴。
- 多会话：最多 4 个终端，各自保留滚动历史与输出缓存；右上角 + 可新开，至少保留 1 个。
- 可信验证：命令等于 `lab.verificationCommand` 时走可信 recipe；自定义命令成功运行只显示“不作为实验通过证据”，不会伪造 `verified`。
- SSE `output` 帧原样 `write` 到 xterm，保留 ANSI；`scrollback` 默认 5000 行；停止/超时写入醒目提示行。
- 仍非 PTY：输入被解析为工作台命令提交，不模拟真实 shell 会话。

## 事件（与成员 C 契约）

| 用户动作 | 目标事件（v2） |
| --- | --- |
| 打开文件 | `code_open` |
| 保存 | `code_save` |
| 运行开始/结束 | `run_started` / `run_finished` |
| 打开诊断 | `diagnostic_opened` |
| 查看 trace | `trace_inspected` |

诊断跳转会上报 `diagnostic_opened`，并携带 `runId`、`file`、`line` 与诊断 `code`。
