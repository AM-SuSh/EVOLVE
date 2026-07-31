# Lab2 知识路径条 · 定稿文案（成员 A · Day 5）

> 供 B 挂在 `ManualPane` 顶部（紧凑一条，可折行）。  
> 数据亦可由 `lab.yaml` 生成；本文件为**展示文案单一事实源**。

## 路径条（默认展示）

```text
先修 Lab1 裸机启动 → 本机制：Trap 陷入 / 系统调用 / 协作调度 → 本实验产物：可切换的多用户任务 → 必观证据：hello·power·Yield×5·All exited（+trap_enter/task_switch）→ 迁移：抢占 · VM Exit · 用户态协程
```

## 分段字段（组件 props）

| 字段 | 文案 |
| --- | --- |
| `prerequisite` | Lab1：裸机启动与 SBI 输出 |
| `mechanism` | Trap 进入/返回 · ecall 系统调用 · 协作式 yield 调度 |
| `artifact` | 用户程序经 trap 陷入内核并在多任务间轮转 |
| `evidence` | 输出断言四条；可选 trace：`trap_enter`、`task_switch` |
| `transfer` | 对照抢占式时钟中断、虚拟机 Exit、异步运行时 yield |

## 点击行为（建议）

| 段 | 跳转 |
| --- | --- |
| 先修 | Lab1 手册或 Journey 对应层 |
| 本机制 | 手册「背景知识」或 concept 锚点 |
| 产物 | 「实验任务」 |
| 证据 | 验证章节 / 底部测试结果说明 |
| 迁移 | 检查点迁移题 / 报告思考题 |

## 空态 / 变体

- **debug / remedial**：在路径条下增加一行弱提示：`本变体焦点：让出 ≠ 退出（Yield×5）`  
- **fill**：`本变体焦点：补全调度查找与 current 更新`

## 验收（A → B）

- [ ] 首屏可见，不遮挡正文 H1  
- [ ] 移动端可换行，不出现横向滚出屏幕  
- [ ] 文案与上表一致（允许微调标点，不改教学含义）
