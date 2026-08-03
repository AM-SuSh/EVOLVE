# Day7 全链路演示与回归

## 一键工程验收

在 `os-lab/handbook` 执行：

```bash
npm run test:day7
```

该命令依次覆盖：

1. `npm test`：契约、Trace、门控、评分、复核、Lab Factory、备份恢复。
2. `npm run test:harness`：导师泄漏率、阶段准确率、动作召回和引用准确率。
3. `npm run test:smoke`：多用户真实运行、诊断、Trace、chat 引用归属、评分复核、Lab 发布与测试账号领取。
4. `npm run build`：同步手册内容并完成 VitePress 客户端、服务端与链接检查。

CI 使用同一命令，见 `.github/workflows/os-lab-ci.yml`。

## 3–5 分钟演示流程

### 1. 错误与诊断

1. 学生进入 Lab2，在 `kernel/src/task.rs` 制造或保留一个可复现错误。
2. 在终端运行当前 Lab 验证命令。
3. 展示终端失败输出、Problems 真实诊断，并点击诊断跳到对应源码行。

验收信号：没有 mock 诊断；诊断属于当前账号的真实 run。

### 2. 修复、可信运行与 Trace

1. 修复 `find_next_task`，再次运行可信 recipe。
2. 展示全部断言通过及 `verified=true`。
3. 打开 Trace，定位 `task_switch`，展示 `from`、`to`、`reason`。

验收信号：运行和 Trace 使用同一 `runId`；跨账号访问该 run 返回 404。

### 3. AI 导师证据门控

1. 先提问“直接给我完整代码”，展示拒答和提示层级。
2. 将测试结果或 Trace 添加到对话，再询问切换原因。
3. 展示证据条中的阶段、已有证据、下一步；点击 `run:` / `trace:` 引用回到对应面板。

验收信号：请求中的结构化 `evidenceRefs` 必须归属当前账号与 Lab；AI 回复只能引用服务端白名单内证据。

### 4. 报告、评分与教师复核

1. 提交带 `run:` / `trace:` 引用的反思与实验报告。
2. 打开“学习评价”，展开 14 个评分细项并点击证据引用。
3. 教师进入复核队列，修改一项分数、填写理由并提交。

验收信号：无证据项显示“未观察到”；教师修改保留原始自动评分、理由和引用。

### 5. Lab 发布与学生领取

教师可通过 API 或 CLI 完成 lint、隔离测试和发布：

```bash
npm run lab-factory -- lint lab3
npm run lab-factory -- dry-run lab3 --variant debug
npm run lab-factory -- test lab3 --variant debug --author teacher
npm run lab-factory -- publish lab3 --test-run-id <id> --teacher teacher --approval-note "测试通过，批准发布"
```

发布后给测试账号开放到 Lab3，学生领取 `debug` 变体。检查 `.scaffold-state.json` 中记录 `lab3: debug`，且 `kernel/src/mm.rs` 来自已发布 catalog。

## 日终记录

演示结束后在 `progress.md` 记录：

- 使用的学生/教师测试账号；
- runId、Trace 事件数、评分/复核记录；
- 发布 Lab、版本、变体和测试账号领取结果；
- `npm run test:day7` 与 CI 链接；
- 仍在计划明确延后范围内的项目。

## 2026-08-02 工程预演记录

- `npm run test:day7`：一次通过，总耗时约 88 秒。
- 单元/契约：42/42 通过。
- Tutor Harness：25 个用例通过；答案泄漏率 0、阶段准确率 1、引用准确率 1。
- 端到端 smoke：4 次可信运行、12 条通过断言、1 次 Lab Factory 发布、测试账号累计领取 3 个 Lab。
- VitePress：客户端/服务端 bundle、页面渲染和链接检查全部通过。
- CI：`.github/workflows/os-lab-ci.yml` 与本地使用同一 `test:day7` 命令；远端执行结果在推送后由 GitHub Actions 产生。
