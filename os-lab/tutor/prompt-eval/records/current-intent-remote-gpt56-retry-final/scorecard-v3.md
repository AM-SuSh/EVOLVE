# Prompt 评测 V3 分数卡

- 数据源：current-intent-remote-gpt56-retry-final
- 模型：gpt-5.6-luna
- 用例数：19

## 主指标

| 综合 | 问题相关 | 引导正确 | 必要解释 | 可执行 | 无答案泄漏 | 证据忠实 | 跨阶段一致 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 94 | 100 | 79 | 100 | 89 | 95 | 100 | 100% |

> 问号数量、回复长度和代码行数只作为诊断信息，不参与 V3 主分；阶段关键词不再评分。

## 按意图

| 意图 | 用例 | 综合 | 问题相关 | 引导正确 | 证据忠实 |
| --- | --- | --- | --- | --- | --- |
| code-reading | 1 | 100 | 100 | 100 | 100 |
| concept | 6 | 88 | 100 | 58 | 100 |
| debug | 4 | 94 | 100 | 63 | 100 |
| direct-answer | 1 | 83 | 100 | 100 | 100 |
| reflection | 1 | 100 | 100 | 100 | 100 |
| transfer | 1 | 100 | 100 | 100 | 100 |
| verification | 5 | 100 | 100 | 100 | 100 |

## 用例

| 用例 | 存储阶段 | 意图 | 综合 | 问号(诊断) | 长度(诊断) |
| --- | --- | --- | --- | --- | --- |
| concept-boot-entry | run | concept | 92 | 1 | 310 |
| concept-sepc-orient | orient | concept | 92 | 1 | 416 |
| concept-sepc-debug | debug | concept | 92 | 1 | 372 |
| concept-sepc-reflect | reflect | concept | 75 | 0 | 243 |
| debug-panic-orient | orient | debug | 92 | 0 | 215 |
| debug-panic-read | read | debug | 92 | 0 | 261 |
| debug-panic-transfer | transfer | debug | 100 | 0 | 338 |
| verification-trace-orient | orient | verification | 100 | 0 | 368 |
| verification-trace-run | run | verification | 100 | 0 | 348 |
| verification-trace-reflect | reflect | verification | 100 | 0 | 342 |
| wrong-hypothesis-sepc | read | concept | 100 | 1 | 288 |
| direct-answer-patch | debug | direct-answer | 83 | 0 | 51 |
| code-reading-task | transfer | code-reading | 100 | 1 | 390 |
| reflection-evidence-gap | orient | reflection | 100 | 1 | 191 |
| transfer-multicore | read | transfer | 100 | 1 | 243 |
| topic-switch-page-table | debug | concept | 75 | 1 | 167 |
| evidence-none-local-claim | run | verification | 100 | 0 | 216 |
| evidence-verified-run | orient | verification | 100 | 0 | 274 |
| evidence-conflict-failed-run | reflect | debug | 92 | 0 | 328 |
