# 部署、安全与备份恢复

## 部署边界

- `tutor-server.mjs` 默认只监听 `127.0.0.1`。远程课堂部署应放在带 TLS 的反向代理后，不直接暴露服务端口。
- 首次启动后立即修改预置 `admin/admin123`；生产环境不得保留默认口令。
- 通过 `OS_LAB_TUTOR_ORIGIN` 设置明确的前端来源；不要使用公网通配来源。
- LLM API Key 只配置在服务端教师配置或环境变量，不写入仓库、前端包或分析导出。
- 学生运行继续使用服务端可信 recipe、超时、输出上限和用户工作区隔离；不要把任意 shell 入口作为“通过”证据。

## Tutor 路由与评分配置

- Tutor Server 默认使用问题意图路由：`concept`、`code-reading`、`debug`、`verification`、`reflection`、`transfer` 和 `direct-answer`。生产环境无需设置额外变量即可使用该模式。
- `OS_LAB_TUTOR_ROUTING_MODE=intent` 可显式声明默认模式；`OS_LAB_TUTOR_ROUTING_MODE=stage` 只用于旧会话回放、兼容排障和对照实验，不应作为新部署的教学默认值。
- intent 模式仍保存 `activeStage`、`current_stage` 和 `stage_enter` 事件，供导航、遥测、历史数据和兼容旧客户端使用；这些字段不选择 `/chat` 的回答策略，也不应进入学习评分奖励。
- 学习评价接口使用 `rubric-v3.3.0`：过程细项（`P2`/`J1`/`E1`/`H1`/`V1`/`I1`）与反思细项（`F1`/`F2`/`T1`/`T2`，含逐题 `RQ*` 动态项），Lab 通过由 `V1` 可信验证与 `I1` 失败后复验覆盖，不再保存 Lab2 专属“结果”维度。总分默认按 60% 规则基线与 40% Assessment Agent 评价融合；Agent 不可用时明确回退到规则基线。可信 run、答案护栏、RAG 权限和引用白名单不因路由迁移而放宽。
## 数据最小化

匿名分析默认只输出聚合数据。参与者级数据仅在人数达到 `minCohortSize` 后输出一次性伪名，并排除用户名、班级、消息/报告正文、命令、文件路径和原始时间戳。伪名不代表绝对匿名，小样本不得公开。

## 在线备份

在服务运行时使用 SQLite backup API 创建一致性快照，禁止直接复制正在写入的 `.db` 文件。每个备份同时生成 manifest，包含 SHA-256、schema migration 和各证据表行数，并对源库与备份执行 `PRAGMA integrity_check`。

建议策略：每日备份，保留最近 7 天与最近 4 个周备份；备份目录应位于受控磁盘并纳入访问审计。定期把一份加密副本放到不同故障域。

## 离线恢复

1. 停止 tutor server，确认没有进程持有数据库。
2. 校验目标备份 manifest 和 SHA-256。
3. 调用 `restoreLearningBackup`，显式传入 `allowOverwrite: true`。
4. 工具会把旧数据库移动到 `.pre-restore-*.bak`，再安装并完整性检查新库。
5. 启动服务，执行 `npm test` 和 `npm run test:smoke`，抽查账号、可信 run、assessment 与 review 历史。
6. 验收完成前保留回滚数据库；恢复失败时不要删除它。

恢复函数不能在 tutor server 的在线请求中调用，这是有意限制，避免覆盖仍在使用的数据库。
