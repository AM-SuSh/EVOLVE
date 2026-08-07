# 成员 B · Day1 工作台空态与文档核对

> 日期：2026-08-01  
> 对照：《三人小组后续实验发展实施计划》Day1 成员 B  
> 完成标准：空态文案已核对；与 `workbench-ui.md` 不一致处已列表；**无 mock 冒充真数据**  
> 教学缺口（规格有、产品无）见 [`MEMBER-A-7DAY/day1-gap-table.md`](https://github.com/AM-SuSh/Or2-1-OS/blob/main/os-lab/lab-packages/MEMBER-A-7DAY/day1-gap-table.md)，本表不重复开票。

## 1. Mock / 可信空态核查结论

| 面板 | 数据来源 | 无数据/失败行为 | 判定 |
| --- | --- | --- | --- |
| 文件状态 A/M/T/G/! | `GET /fs/status` | `source='none'`，不显示徽章，不回落 mock | **通过** |
| Problems | `GET /run/diagnostics?runId=` | 无 run / 空列表 / 错误三分态；不造假诊断 | **通过** |
| Trace | `GET /runs/:id/trace` | 404/异常 → `unavailable`；不播放预设动画 | **通过** |
| 测试结果 | 最近一次可信 run 的 `assertions` | 无 run / 无断言时明确空态，不伪造通过 | **通过**（本轮已收紧文案） |

**结论：工作台无 mock 冒充真数据。**

## 2. 与实现一致（勿重复开票）

| 能力 | 证据 |
| --- | --- |
| Monaco 多标签编辑 | `MonacoEditor.vue` → `CodePanel.vue` |
| 交互式 xterm + 多会话 | `TerminalPanel.vue` / `TerminalSession.vue`（非 PTY） |
| Problems 点击跳行 | `openAtLine` |
| Trace Trap / 任务时间线 + 播放控制 | `TraceViewer` / `TraceTrapView` / `TraceTimelineView` |
| 实验报告模板 / Markdown | `ReportPanel.vue` |
| Journey 解锁与领取 | `JourneyRail.vue` + access API |
| 分区开关 | 顶栏「手册 / 工作区 / 学习支持」；无折叠 rail |

## 3. 核对发现的不一致（及处置）

| ID | 文档原写法（`workbench-ui.md`） | 当前实现 | 责任 | Day1 处置 |
| --- | --- | --- | --- | --- |
| D1 | 右上：报告/导师/工作区；右下 BottomDock 含 Problems/**Trace**/测试 | 工作区底：终端 / Problems / 测试结果；**学习支持**：报告 / 学习评价 / **Trace**；AI 导师为悬浮窗口 | 文档 | 已同步 `workbench-ui.md` |
| D2 | 收起后出现「展开…」条 | 8/1 已删 rail；顶栏开关恢复 | 文档 | 已同步 |
| D3 | 仍写独立 `BottomDock` 组件 | `LabWorkspace` 内联底部 dock | 文档 | 已同步 |
| D4 | `ManualPane` 含「知识路径、阶段任务」 | 仅保留手册 Markdown 与 H2/H3 目录 | 文档 | 已按实际实现收敛为「手册」 |
| D5 | Problems 未写 API 路径 | 实现为 `/run/diagnostics?runId=` | 文档 | 已补路径 |
| D6 | Trace「接口未就绪」口吻偏旧 | 接口已就绪；404/无事件仍走可信空态 | 文档 | 已改为「查询失败/无事件」表述 |

## 4. 规格有、产品无（挂 Day2+，非文档漂移）

| 缺口（A 表） | 说明 | 计划日 |
| --- | --- | --- |
| G2 提示阶梯不可见 | **已落地**：证据条 `L{n} · 短文案` + 拒答标记；消息 meta 同步 | Day 3 ✅ |
| G7 OPRE 入口 | **已落地**：`OpreBar` 挂 Trace intro 下（T-OPRE-1 / S-OPRE-1 + 插入报告） | Day 5 ✅ |
| 导师证据条 | **已落地** `TutorEvidenceBar`（消费 chat `tutorState`） | Day 2 ✅ |
| 证据引用跳转 | **已落地**：消息内 `run:`/`trace:`/诊断 chips → 对应面板 | Day 3 ✅ |

## 5. 本轮已修正的空态文案

对齐 [`lab2/ui-copy-review.md`](https://github.com/AM-SuSh/Or2-1-OS/blob/main/os-lab/lab-packages/lab2/ui-copy-review.md)：

| 位置 | 调整 |
| --- | --- |
| Problems 无 run | 「还没有编译诊断；先保存再构建」 |
| Trace 无事件 | 强调确认教学 trace / `trap_enter`·`task_switch` |
| 测试结果有 run 无断言 | 「未返回可展示断言，不表示验证已通过」 |
| 文件状态 T | label：`T=教师发放的任务文件，优先阅读文件头注释` |

## 6. 怎么验

1. 打开本清单与更新后的 `docs/workbench-ui.md`，布局三区与实机一致。  
2. 未运行命令时打开 Problems / Trace / 测试结果：无假列表、无预设动画。  
3. 断开 tutor 或故意用无效 `runId`：Trace/Problems 显示失败/空态，不填充示例事件。

## 7. 后续堵点

- Day3 已收口：引用跳转 + 提示阶梯/拒答态（见 `workbench-ui.md`「证据引用跳转」）。
- Day4 已落地：评分细项 UI（学生报告区 + TeacherReport）。
- Day5 已落地：教师评分复核改分留痕（`POST /teacher/review`）、OPRE 条。
- Day6 曾落地 `LabCreateWizard`（`/guide/lab-factory`）validate → test → publish；后续已从前端移除，班级下发直接走 `TeacherPublishPanel`。
- Day7 已复核：关键断言、提示阶梯证据条与 OPRE 入口可用；窄屏断言区换行与底部页签溢出已修；`workbench-ui.md` 终端/AI 导师挂载描述已对齐实现。
