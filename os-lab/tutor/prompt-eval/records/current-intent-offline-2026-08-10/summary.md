# Prompt 评测 V3 分数卡

- 数据源：current-intent-offline-2026-08-10
- 模型：qwen2.5:7b
- 用例数：19

## 主指标

| 综合 | 问题相关 | 引导正确 | 必要解释 | 可执行 | 无答案泄漏 | 证据忠实 | 跨阶段一致 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 94 | 79 | 87 | 100 | 100 | 95 | 100 | 100% |

> 问号数量、回复长度和代码行数只作为诊断信息，不参与 V3 主分；阶段关键词不再评分。

## 按意图

| 意图 | 用例 | 综合 | 问题相关 | 引导正确 | 证据忠实 |
| --- | --- | --- | --- | --- | --- |
| code-reading | 1 | 83 | 50 | 50 | 100 |
| concept | 6 | 92 | 83 | 67 | 100 |
| debug | 4 | 92 | 50 | 100 | 100 |
| direct-answer | 1 | 83 | 100 | 100 | 100 |
| reflection | 1 | 100 | 100 | 100 | 100 |
| transfer | 1 | 100 | 100 | 100 | 100 |
| verification | 5 | 98 | 90 | 100 | 100 |

## 用例

| 用例 | 存储阶段 | 意图 | 综合 | 问号(诊断) | 长度(诊断) |
| --- | --- | --- | --- | --- | --- |
| concept-boot-entry | run | concept | 92 | 1 | 56 |
| concept-sepc-orient | orient | concept | 92 | 2 | 87 |
| concept-sepc-debug | debug | concept | 92 | 2 | 87 |
| concept-sepc-reflect | reflect | concept | 92 | 2 | 87 |
| debug-panic-orient | orient | debug | 92 | 0 | 57 |
| debug-panic-read | read | debug | 92 | 0 | 57 |
| debug-panic-transfer | transfer | debug | 92 | 0 | 57 |
| verification-trace-orient | orient | verification | 100 | 0 | 100 |
| verification-trace-run | run | verification | 100 | 0 | 100 |
| verification-trace-reflect | reflect | verification | 100 | 0 | 100 |
| wrong-hypothesis-sepc | read | concept | 92 | 2 | 87 |
| direct-answer-patch | debug | direct-answer | 83 | 0 | 51 |
| code-reading-task | transfer | code-reading | 83 | 2 | 82 |
| reflection-evidence-gap | orient | reflection | 100 | 0 | 55 |
| transfer-multicore | read | transfer | 100 | 0 | 53 |
| topic-switch-page-table | debug | concept | 92 | 1 | 56 |
| evidence-none-local-claim | run | verification | 100 | 0 | 100 |
| evidence-verified-run | orient | verification | 92 | 0 | 69 |
| evidence-conflict-failed-run | reflect | debug | 92 | 0 | 57 |
