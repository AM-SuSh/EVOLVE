# 方向七：Lab Factory 与课程内容生产（新增部分）

> 初赛基线：实验内容以手工 Markdown 为主。
> 本次新增：Lab package、冻结契约、fill/debug 变体、lint/dry-run/test/publish 发布流水线。

## 1. Lab Package

新增 `os-lab/lab-packages/`：

- Lab2：样板包
- Lab3：第二样板
- Lab4-8：lab.yaml、concepts、checkpoints、fill/debug

每个 Lab package 包含：

- Lab 元数据
- 知识点索引
- 文件清单
- 验证命令
- 任务变体
- 检查点与迁移题

## 2. 冻结契约

- Lab spec v1：Lab 教学规格
- event v2：学习事件 schema
- run-result v1：可信运行结果
- trace v1：教学 Trace

权威源：

- `tutor/schema/lab-spec-v1.schema.json`：Lab 规格校验 schema
- `tutor/schema/event-v2.schema.json`：学习事件校验 schema
- `tutor/schema/run-result-v1.schema.json`：可信运行结果校验 schema
- `tutor/schema/trace-v1.schema.json`：教学 Trace 校验 schema
- `tutor/schema/m0-contract-baseline-v1.json`：M0 四契约版本清单与兼容规则

## 3. Lab Factory 流水线

```text
lint -> dry-run -> test -> publish
```

CLI 示例：

```bash
npm run lab-factory -- lint lab3
npm run lab-factory -- dry-run lab3 --variant debug
npm run lab-factory -- test lab3 --variant debug --author teacher
npm run lab-factory -- publish lab3 --test-run-id <id> --teacher teacher --approval-note "测试通过，批准发布"
```

发布生成不可变 release 目录：

```text
os-lab/lab-packages/releases/lab2/1.0.0/
os-lab/lab-packages/releases/lab3/1.0.0/
...
os-lab/lab-packages/releases/lab8/1.0.0/
```

详细文档：

- `os-lab/lab-packages/README.md`：Lab package 结构、样板与协作约定
- `os-lab/docs/lab2-m0-acceptance.md`：Lab2 纵向闭环验收与契约冻结
- `os-lab/docs/day7-demo-runbook.md`：Day7 全链路演示与回归
