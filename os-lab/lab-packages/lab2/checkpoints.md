# Lab2 检查点与迁移题（成员 A · 第 6–7 周）

## 阶段检查点（须证据，不可只靠自评）

| ID | 阶段 | 检查点问题 | 可接受证据 |
| --- | --- | --- | --- |
| C2-1 | orient | 用户为何不能直接调用内核函数？ | 学生表述 + 指向 trap/ecall |
| C2-2 | read | `ecall` 之后第一条内核指令在哪个文件？ | 打开 `trap.asm` / 正确路径描述 |
| C2-3 | run | 四条输出断言分别证明什么？ | 受信 `verified` run |
| C2-4 | debug | 如何区分双栈错误 vs 调度状态错误？ | 最小实验记述（hello/power 正常与否） |
| C2-5 | reflect | 独立判断 / AI 点 / 验证 三者是否齐全？ | `reflection_submitted` 文本 |

提示阶梯：沿用 `variants/fill|debug/manifest.yaml` 的 `hint_ladder` L0–L3；导师不得跳级给完整实现。

## 迁移题（课后 / 答辩）

1. **抢占**：若用时钟中断抢占，与协作式 `sys_yield` 相比，哪些 trap 路径必须仍正确？哪些调度假设会变？
2. **VM Exit**：把「用户 ecall 进内核」类比到虚拟机 Exit，相似处与不同处各写一点。
3. **异步运行时**：用户态协程的 yield 与内核任务 yield，保存的「上下文」各是什么？
4. **反例**：只保证退出码 0、不检查 `Yield round` 次数，会放过哪类错误实现？

评分：迁移题进入报告「思考题与发现」；量规见 `learning/rubric-v2-draft.md` 增补项 **T1–T2**。
