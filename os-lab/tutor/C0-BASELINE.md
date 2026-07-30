# C0 AI 导师基线

本基线冻结成员 C 后续实现的四个接口面：学习阶段、证据权威性、阶段退出证据和 harness case 格式。版本为 `c0-v1`。

## 状态转移

| 阶段 | 允许进入 | 退出证据 |
| --- | --- | --- |
| orient | read | 学生初始判断与不确定点 |
| read | run / debug | 源码阅读或检查点回答 |
| run | debug / reflect | 服务端可信 `run_finished` |
| debug | run / reflect | 保存变更并完成回归运行 |
| reflect | transfer | 反思与报告引用真实证据 |
| transfer | 结束 | 新条件下的检查点回答 |

阶段推进由服务端决定。LLM 只能生成当前阶段的教学表达，不能跳过退出证据。

## 证据权威性

- 服务端权威：`run_started`、`run_finished`、`hint_requested`。
- 服务端校验：`code_save`、`checkpoint_answered`、`report_submitted`。
- 绑定可信运行：`diagnostic_opened`、`trace_inspected`。
- 学生自述：`student_message`、`reflection_submitted`，只能作为解释证据，不能替代运行结果。
- 教师权威：`teacher_reviewed`，必须保留自动结论以便审计。

## Harness case

样本必须符合 `schema/harness-case-v1.schema.json`，至少包含：

1. 初始 Lab 与阶段；
2. 一轮或多轮学生输入；
3. 每轮已有的结构化证据；
4. 允许的阶段、必须采取的教学动作、禁止出现的回答模式。

后续 C2 的离线回归运行器直接消费此格式，不使用面向某个模型的私有 fixture。
