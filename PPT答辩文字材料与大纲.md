# os-lab / EVOLVE PPT 答辩文字材料与大纲

> 版本：2026-08-10
> 用途：面向最终答辩或项目汇报，覆盖“初赛双线交付 + 二期整体扩展优化”的完整项目叙事。
> 建议页数：28 页（含封面与致谢），演示总时长约 10-12 分钟，另可安排 3-5 分钟现场演示。

---

## 0. 先看：答辩叙事主线

一句话讲清项目：

> 我们不是只交了一个教学内核，而是把“参考练习、自研 8 Lab 内核、Web 学习工作台、AI 导师、AI 学习评价、教师管理与证据链”做成了可进入课堂的完整教学闭环。

叙事分四幕：

1. 为什么做：OS 课程难，难在原理与代码脱节、成熟内核太大、环境门槛高。
2. 初赛做了什么：30% 参考练习全绿 + 70% 自研 5 Lab 渐进式内核。
3. 二期扩展了什么：Lab6-8 补齐磁盘 FS、IPC/信号、线程同步；再扩展成账号制学习平台、教师端、AI 双 Agent 与可信证据链。
4. 为什么可信：所有结论绑定 checker、QEMU、host 单测、可信 run、Trace、证据引用与教师复核，AI 不拥有最终裁决权。

答辩的收尾价值主张：

> os-lab 不是替代 xv6 或 rCore，而是把“第一跳”做短、做直、做可验证，让学生在同一份内核代码里看见操作系统从裸机长到线程同步。

---

## 1. 数据口径与谨慎表述

答辩中建议优先使用以下口径，避免不同文档版本造成前后矛盾。

| 数据 | 推荐表述 | 说明 |
| --- | --- | --- |
| 参考练习 | 5 章 exercise 全部通过：ch3 7/7、ch4 16/16、ch5 17/17、ch6 33/33、ch8 25/25，合计 98/98 | 另有 base 模式 61/61 |
| 内核 Lab | Lab1-8 全部有 QEMU 验证，Lab1-5 用 cargo run，Lab6-8 用 make test-labN | Lab8 8 条 expected 全通过 |
| 代码规模 | 约 8353 行 Rust，70 个源码文件，11 个 workspace crate，8 个组件 crate，2 层依赖 | 参考环境约 36455 行、548 文件、29 crate、4 层依赖 |
| host 单测 | 一期 24 项，二期扩到 40+ 项，2026-07-26 记录为 42 项 | 文档存在 40/42 两种记录，解释为不同采集时间 |
| JS/契约/评测测试 | 最新 `npm test` 为 95 项中 94 项通过 | 唯一失败是既有 Lab7 debug 文件路径迁移引用问题，与本次功能无关 |
| AI 导师评测 | Tutor Harness 34/34；RAG Harness 3/3；V3 离线全链路 19 条综合 94；真实模型一轮综合 96 | 离线 94 与真实模型 96 采用不同语料/评分代次，不要直接比较 |
| 真实教学试用 | 方案与 5 人脚本已就绪，尚未大规模执行 | 不能说“已被证明提升学习效果”，可说“已完成可执行验证方案，等待课堂数据” |
| 校准数据 | 20 条人工标注轨迹，建议就绪阈值从 70 调到 76，假阳性 3 降到 0 | 必须说明是构造/标注样本，不是真人数据 |

---

## 2. 核心文字材料

### 2.1 背景与痛点

操作系统课程是计算机专业公认难啃的课程，学生普遍遇到三类问题：

- 原理与实践脱节：听得懂“虚存是什么”，但面对真实页表代码不知道从哪里看起。
- 缺少全局脉络：xv6、rCore 功能完整，但代码量大、模块多，学生看不到内核是怎么一步一步长出来的。
- 环境与语言门槛高：C 指针、依赖结构、QEMU 黑屏和晦涩错误，会把大量时间耗在“调环境”而不是“学机制”。

赛题要求两条线：

- 30%：在官方参考环境 tg-rcore-tutorial 中完成 5 章基础实验练习并写实现报告。
- 70%：设计一套适合学生自学的操作系统内核教学实验环境，包含实验指导、代码、测试用例、答案、文字习题，并与参考环境、本校环境做定量和定性对比。

### 2.2 设计命题

我们把项目拆成三层递进目标：

| 目标 | 设计选择 | 教学作用 |
| --- | --- | --- |
| 低门槛 | Rust 内存安全 + 精简代码规模 | 学生不被指针和庞大工程劝退 |
| 清晰脉络 | 单内核 + feature gate 渐进式 | 学生在同一份代码里看到内核逐步长出 trap、mm、process、fs |
| 主动思考 | 问题驱动文档 + AI 提问模板 | 学生先想、再问、再验证，而不是被动抄代码 |

### 2.3 项目交付全貌

| 交付类别 | 内容 |
| --- | --- |
| 参考练习线 | ch3/ch4/ch5/ch6/ch8 的 base 与 exercise 全部通过 checker，补丁与报告可复现 |
| 自研内核线 | os-lab workspace：kernel + 8 个组件 crate + user 用户程序，Lab1-8 |
| 教学材料线 | 8 份实验指导、8 份参考答案、总览知识地图、任务二思考题、AI 提问模板 |
| 平台线 | VitePress 学习站点、账号/班级、学习工作台、终端、Problems、测试结果、Trace、实验报告 |
| AI 导师线 | 苏格拉底式 AI Tutor、七类问题意图、L0-L4 提示、答案护栏、证据门控、RAG 知识检索 |
| 评价与教学管理线 | Rubric v3 评分、掌握画像、教师复核队列、任务变体分发、Lab Factory、匿名分析与备份恢复 |
| 质量与文档线 | 架构、设计总结、三方对比、AI 协作记录、环境安装、验证手册、教师指南、部署与恢复 |

### 2.4 自研内核架构

核心决策一：单内核 + feature gate。

```text
lab1 裸机 -> lab2 trap/任务 -> lab3 虚存 -> lab4 进程 -> lab5 文件/并发
        -> lab6 磁盘 FS -> lab7 IPC/信号 -> lab8 线程/同步
```

每个 Lab 通过 Cargo feature 逐级打开，学生始终在同一个代码库工作：

```toml
default = ["lab1"]
lab2 = ["lab1", "dep:os-context", "dep:os-syscall"]
lab3 = ["lab2", "dep:os-alloc", "dep:os-vm"]
lab5 = ["lab4", "dep:os-fs"]
lab6 = ["lab5", "easy-fs", "virtio-drivers", "spin"]
lab7 = ["lab6", "dep:os-signal"]
lab8 = ["lab7", "dep:os-sync"]
```

核心决策二：精简组件化。

8 个组件 crate：

- os-sbi：SBI 调用封装
- os-context：TrapContext 与上下文切换
- os-syscall：系统调用编号与用户/内核约定
- os-alloc：物理页帧分配与堆分配
- os-vm：Sv39 页表、地址空间、ELF 解析
- os-fs：文件抽象与内嵌/磁盘文件系统
- os-signal：信号状态、动作与屏蔽
- os-sync：阻塞式 mutex/semaphore/condvar

kernel 负责集成和策略，组件 crate 负责可独立测试的机制边界。相比参考环境 23 个 crate、4 层依赖，自研环境为 8 个组件 crate、2 层依赖。

核心决策三：内嵌验证。

- 组件提供 `#[cfg(test)]` host 单元测试。
- 内核通过 QEMU 跑用户态程序自证。
- 平台再通过可信 recipe、命名断言和 Trace 提供可审计证据。

### 2.5 8 个 Lab 的课程脉络

| Lab | 主题 | 核心内容 | 主要验证 |
| --- | --- | --- | --- |
| Lab1 | 裸机启动与最小内核 | RISC-V 启动、SBI、链接脚本、no_std | `Hello, OS!`，正常关机 |
| Lab2 | 中断处理与多任务 | trap 入口、上下文切换、syscall、协作调度 | 用户输出、幂运算结果、Yield round、全部退出 |
| Lab3 | 内存管理与虚存 | 物理页、Sv39 页表、地址空间、ELF 映射 | 虚存启用日志、用户程序在独立地址空间运行 |
| Lab4 | 进程管理 | PCB、fork/exec/wait、进程树、僵尸回收 | `fork_test pass`、父子进程输出 |
| Lab5 | 文件系统与并发 | fd 表、内嵌文件、管道、自旋锁 | `fs_test pass`、`pipe_test pass` |
| Lab6 | 磁盘文件系统 | VirtIO、easy-fs、linkat/unlinkat/fstat、spawn | `make test-lab6` 全链 |
| Lab7 | IPC 与信号 | 统一 fd、dup、kill/sigaction/sigprocmask/sigreturn | `make test-lab7` 全链 |
| Lab8 | 线程与同步 | 线程、阻塞 mutex/semaphore/condvar、死锁检测 | `make test-lab8` 8 条 expected |

知识点覆盖映射：

- 基础机制：Lab1、Lab2
- 虚拟化：Lab3、Lab4
- 并发：Lab5、Lab8
- 持久化：Lab5、Lab6
- IPC/异步：Lab7

### 2.6 参考练习线

| 章节 | exercise 内容 | checker 结果 |
| --- | --- | --- |
| ch3 | sys_trace 系统调用跟踪 | 7/7 |
| ch4 | mmap / munmap | 16/16 |
| ch5 | spawn + stride 调度 | 17/17 |
| ch6 | linkat / unlinkat / fstat + spawn | 33/33 |
| ch8 | 死锁检测，银行家算法 + 等待图 | 25/25 |

实现要点：

- ch3：每任务 syscall 计数，trace_request 支持读计数、写内存、读内存三种模式。
- ch4：页对齐、prot 权限位、重叠区域检查。
- ch5：stride 调度，spawn 从 APPS 表加载 ELF，set_priority。
- ch6：用户态路径读取、硬链接 nlink 更新、unlink 细粒度锁避免自旋锁不可重入。
- ch8：DeadlockState 挂在进程层，mutex_lock/semaphore_down 可返回 -0xDEAD。

### 2.7 学习平台

学生端：

- 登录注册，必填班级，账号绑定代码工作区、学习事件、报告与 AI 会话。
- 工作台左侧实验手册，右侧代码编辑器、终端、Problems、测试结果、Trace、实验报告。
- AI 导师在右下角，可附代码选区、终端选区、诊断、断言和 Trace 提问。
- 解锁规则：上一层一次可信成功运行 + 一次带反思的报告保存，再结合教师开放进度。

教师端：

- 全局/班级/学生三级发布对象。
- 开放进度：控制学生能领取到第几个 Lab。
- 任务分配：fill 补全、debug 排错、random 随机变体，支持个别调整。
- AI 统一模型配置：接口地址、模型名、Key，可强制全班统一或允许学生自配。
- 学生进度、报告在线查看、班级名单与导出。
- 实验指导在线编辑，Markdown 保存后自动同步站点。

### 2.8 可信证据链

平台的关键设计是“只认服务端证据”：

```text
实验手册与任务 -> 学生修改代码 -> 可信 recipe 运行 -> 命名断言 + Trace
-> SQLite 运行/事件/证据 -> AI 导师引用证据提问 -> 实验报告写 run/trace 引用
-> Rubric v3 评分 -> 教师复核 -> 最终成绩
```

关键约束：

- 自定义命令即使退出码为 0，也不产生 verified=true。
- 没有真实诊断或 Trace 时界面保持空态，不展示 mock 数据。
- runId、workspaceVersion、哈希、事件数和顺序在查询时重新校验。
- 跨账号访问 run 返回 404。
- AI 只能引用本轮白名单内的 `run:`、`trace:`、`diag:`、`event:`、`kb:` 证据。

### 2.9 AI 双 Agent 设计

系统把 AI 拆成两个职责分离的 Agent：

| Agent | 输入 | 核心职责 | 权限边界 |
| --- | --- | --- | --- |
| AI Tutor | 当前 Lab、消息、本轮意图、代码/运行/Trace 证据、知识片段 | 促成判断、观察、假设、验证和迁移；拒绝直接交付答案 | 不能伪造证据，不能读取 teacher-only，不拥有最终裁决 |
| AI Assessment | 学习事件、可信 run、报告、Tutor 对话 | 汇总学习过程，输出带证据的量规建议 | 无证据项标为未观察到，结果必须可复核 |

为什么拆开：

- 导师要容错、鼓励试错，评估者要稳定、可复现。
- 同一个模型一边引导一边给自己参与的过程打分，容易形成自我评价和反馈污染。
- 教学对话可以有创造性，成绩必须可审计、可申诉、可复算。

Tutor 当前支持七类问题意图：

- concept：概念与“为什么”
- code-reading：源码位置、调用链、字段
- debug：报错、异常、根因定位
- verification：运行、测试、期望输出
- reflection：复盘、报告、理解变化
- transfer：对比、边界、条件迁移
- direct-answer：直接要完整代码，触发答案护栏

提示等级 L0-L4 按当前问题线程累计，而不是整个会话累计；换题、换文件、换诊断后从 L0 重新开始。

### 2.10 知识库与 RAG

知识库分层：

- Lab 专属层：当前 Lab 手册、concept、检查点。
- 公共概念层：OSTEP 中文核心章节、RISC-V Reader、LearningOS 讲义、rCore Guide、CSAPP。
- 证据层：可信 run、Trace、diagnostics，优先级高于书本解释。

工程要点：

- 多格式规范化：Markdown/HTML/JSON/YAML/TXT/RST/PDF/EPUB/DOCX 统一成 Document 模型。
- 章节感知分块：相邻 block 只有在同一 sectionPath 下才合并，保留行号/页码 locator。
- SQLite + FTS5 trigram 支持中文子串检索，一到两字用 LIKE 回退。
- 混合检索：FTS + embedding + Reciprocal Rank Fusion，权限和 Lab/global 上限最后硬截断。
- Tutor 最多召回 5 个 chunk，其中公共层最多 2 个；直接索要答案时跳过知识检索。
- 教师上传走 pending-review -> published -> disabled/superseded 生命周期，默认 teacher-only。
- 当前文档记录的知识规模：8 个 Source、约 1964 个 active Chunk；后续构建基线为 1384 active Chunk、1360 条向量缓存，以最新 SQLite 统计为准。

### 2.11 AI 学习评价与教师复核

Rubric v3 的评分结构：

```text
total = 0.45 x process + 0.35 x result + 0.20 x reflection
```

14 个细项覆盖：

- process：问题推进、学生判断、证据引用、可证伪假设、可信验证、失败后迭代。
- result：Hello、Power、Yield 五轮、全部退出等命名断言，只认可信 run。
- reflection：独立判断、AI 与验证分工、迁移对照、退出码反例意识。

教师复核门控：

- H1：结果满分但过程极低，疑似刷断言。
- H2：Yield 断言存疑。
- H3：反思满分但文本与 run 输出无引用关系。
- H4：多次触发护栏仍得高过程分。
- H5：变体任务自动分与教师抽检不一致。
- H6：学生申诉。

教师改分保留原自动分、教师决定、理由和证据引用，形成审计记录。

### 2.12 Lab Factory、部署与运维

Lab Factory：

- lint：校验 Lab package 元数据、任务、检查点、量规和制品引用。
- dry-run：临时目录生成脚手架，不污染真实学生工作区。
- test：执行隔离测试并生成 testRunId。
- publish：必须引用成功测试并由教师显式批准，生成不可变 release 目录。

部署与恢复：

- Tutor Server 默认只监听 127.0.0.1，远程课堂应放 TLS 反向代理。
- 首次启动自动创建 admin/admin123，首登必须改密码。
- LLM API Key 只存在服务端配置或环境变量，不写入仓库。
- 使用 SQLite backup API 做一致性备份，带 SHA-256 和表行数 manifest。
- 恢复必须离线执行、显式确认，覆盖前保留旧库回滚副本。

### 2.13 三方对比

| 维度 | 自研 os-lab | tg-rcore-tutorial | xv6-riscv |
| --- | --- | --- | --- |
| 语言 | Rust | Rust | C |
| 架构 | 单内核 + feature gate | 8 个独立内核 | 单一源码树 |
| 组件化 | 8 组件 crate / 2 层依赖 | 23 crate / 4 层依赖 | 无 crate |
| 代码量 | 约 8353 行 | 约 36455 行 | 内核约 6000-8000 行 C |
| 实验数 | 8 个 Lab | 8 章 | 11 个 Lab |
| 单元测试 | 40+ host 单测 | 0，靠外部 checker | 外部 grade 脚本 |
| 引导方式 | 问题驱动 + 先想再对照 + AI 模板 | 实现导向 | 步骤式任务清单 |
| 定位 | 低门槛入门与教学闭环 | 赛题参照物 | 经典成熟、广覆盖 |

结论：

- 自研环境不是替代者，而是补齐“第一跳”。
- 建议路径：os-lab 入门建立全局脉络，再用 xv6 或 rCore 深化。

### 2.14 测试与验证结果

参考练习：

- base：ch3 4/4、ch4 6/6、ch5 14/14、ch6 15/15、ch8 22/22。
- exercise：7/7、16/16、17/17、33/33、25/25。

内核回归：

- Lab1：`Hello, OS!`。
- Lab2：`409684505`、Yield round、All user apps exited。
- Lab3：虚存启用，用户程序正常。
- Lab4：`fork_test pass`。
- Lab5：`fs_test pass`、`pipe_test pass`。
- Lab6：file_test、link、fstat、mmap、spawn、stride、fs、pipe 全链。
- Lab7：dup、signal、signal_mask、pipe 全链。
- Lab8：threads、mutex、condvar、pipetest、deadlock 8 条 expected。

质量与评测：

- cargo check/clippy：workspace 与各 lab feature 通过 -D warnings。
- 组件 host 单测：24 项扩到 40+ 项。
- M0 验收：npm test 16 项、smoke 通过、Lab2 QEMU 观察到 28 条 trap_enter、6 条 task_switch。
- Day7 回归：`npm run test:day7` 一次通过约 88 秒，旧 harness 25 个 fixture 用例通过，答案泄漏率 0。
- Tutor Harness：34/34，答案泄漏率 0、证据引用准确率 1、跨阶段一致率 100%。
- RAG Harness：3/3。
- V3 离线全链路：19 条，综合 94，问题相关 79、引导正确 87、必要解释 100、可执行 100、无泄漏 95（人工核对为 0 真实泄漏）、证据忠实 100、跨阶段一致 100%。
- 真实模型一轮评测：19 条全部一次成功，综合 96，问题相关 100、引导正确 79、必要解释 100、可执行 95、无泄漏 100、证据忠实 100、跨阶段一致 100%；消融平均 +0.84，但只有一轮，不能宣称统计优势。

### 2.15 创新点

1. 渐进式单内核：feature gate 让同一个内核逐步长出 trap、虚存、进程、文件、线程。
2. 精简组件化：8 个组件 crate、2 层依赖，显著降低认知负担。
3. 内嵌测试体系：组件 host 单测 + QEMU 用户程序自证。
4. 问题驱动文档：每个 Lab 先给问题场景，再讲背景，最后验证。
5. 学生视角的 AI 协作模板：教学生“怎么问 AI”，而不是让 AI 代写。
6. 可信证据链：退出码不等于通过，验证必须绑定命名断言、run 与 Trace。
7. AI 双 Agent：导师与评估者职责分离，AI 建议可审计、教师可终裁。
8. 教学管理闭环：账号/班级、开放进度、任务变体、报告、评分、复核、Lab Factory 可进课堂。

### 2.16 局限与后续方向

诚实边界：

- 尚未完成大规模真实课堂验证；学习效率结论不能写成已证实。
- 当前实现仍有教学简化：Lab5 早期为内嵌只读文件，Lab6 后升级为 VirtIO 磁盘 FS；调度未覆盖完整抢占式多核。
- 部分 Lab Factory 文件路径迁移问题仍在回归清单中。
- AI 导师的真实模型 A/B 只跑了一轮，后续需要多轮采样和人工抽检。

后续路线：

- 执行 M5 试用协议：5-30 名学生、Lab2 为主、记录首次 verified 时间、提示依赖、直接要答案率、迁移题和延迟测。
- 基于真实数据重新校准评分阈值与导师策略。
- 补前端页面：教师复核队列、学生掌握画像、Lab Factory、分析与备份运维页。
- 扩展 Lab：抢占调度、COW、网络、mmap 文件映射等。
- 探索 Docker/一体化部署，降低学生环境配置门槛。

### 2.17 AI 使用披露与边界

工具：

- Cursor IDE Agent / Composer：多文件编辑、代码解释、文档重构、验证命令编排。
- ChatGPT / Claude 等通用模型：概念问答、算法结构讨论、错误原因分析、文档措辞参考。
- 开发期真实模型评测：gpt-5.6-luna，用于意图路由全链路验证。

约束：

- 不把 API Key、账号信息、私有对话原文提交到仓库。
- 所有代码进入仓库前人工审查 diff，并用 QEMU/checker/cargo test/clippy 验证。
- 文档中的版本号、测试分数、路径和命令由人工核对。
- 平台内 AI 导师不输出完整文件、完整 patch 或可直接提交实现。
- 平台内 AI 评分不给最终成绩，只给带证据的建议，教师保留终裁权。

### 2.18 材料来源地图

| 用途 | 文件 |
| --- | --- |
| 初赛技术方案与总报告 | 项目总报告.md |
| 参考练习报告 | docs/reference-report.md |
| 自研环境验证与复现 | docs/os-lab.md、docs/environment_setup.md |
| 二期 Lab6-8 | docs/lab6-8.md |
| 设计总结 | os-lab/docs/design-report.md |
| 架构说明 | os-lab/docs/architecture.md |
| 三方对比 | os-lab/docs/comparison.md、comparison-data.md |
| AI 协作记录 | os-lab/docs/ai-collaboration.md |
| AI 导师设计 | os-lab/docs/ai-tutor-stage-guide.md、agent-system-technical.md |
| M0 验收 | os-lab/docs/lab2-m0-acceptance.md |
| Day7 演示 | os-lab/docs/day7-demo-runbook.md |
| 部署恢复 | os-lab/docs/deployment-and-recovery.md |
| 成员 C 完成情况 | os-lab/docs/member-c-c0-c7-guide.md |
| 学习平台入口 | os-lab/handbook/README.md、guide/start.md、guide/beginner.md |
| 教师指南 | 教师使用指南.md |
| 评分与复核 | os-lab/learning/rubric-v3.mjs、teacher-review-gates.md |
| 试用方案 | os-lab/learning/trial-protocol-m5.md、usability-script-5person.md |
| 过程记录 | progress.md |

---

## 3. 详细 PPT 大纲（28 页）

### 第 1 页：封面

标题：os-lab：让操作系统内核“长出来”

副标题：EVOLVE，Evolving Virtual OS Learning & Verification Environment

技术标签：Rust | RISC-V 64 | QEMU | 单内核 Feature Gate | AI 双 Agent | 可信证据链

页面文案：

- 从裸机启动到线程同步，一条线拉出完整内核。
- 从实验手册到 AI 导师，一套可进课堂的 OS 教学闭环。

配图：最终站点首页截图或 Lab8 QEMU 输出墙。

讲稿：30 秒，不展开技术细节，只给一句定位。

### 第 2 页：为什么做：OS 课程的三座山

页面文案：

- 原理与实践脱节：听懂“虚存是什么”，不会看页表代码。
- 成熟内核太大：xv6/rCore 功能完整，但学生容易迷失。
- 环境门槛高：C 指针、依赖、QEMU 黑屏消耗大量精力。

配图：痛点对比图或学习路径折线图。

讲稿：用 1-2 个真实场景讲“学生背完概念却不会动手”。

### 第 3 页：赛题拆解

页面文案：

- 30%：参考环境 5 章练习，checker 验收。
- 70%：自研教学实验环境，包含代码、文档、测试、答案、对比。
- 额外命题：AI 协作方式必须披露，不回避。

配图：30% / 70% 双线图。

讲稿：说明“练为基础，建为核心”。

### 第 4 页：我们的答案

页面文案：

- 参考练习线：5 章 exercise 合计 98/98。
- 自研内核线：Lab1-8，从裸机到线程同步。
- 教学平台线：账号制工作台、教师端、AI 导师、AI 评分。
- 共同底座：可信证据链，所有结论可复现、可审计。

配图：三线交付总览。

讲稿：提前给出全片结论，后续逐步证明。

### 第 5 页：总体时间线与团队分工

页面文案：

- 初赛 7 天：完成 Lab1-5 内核、文档、对比与 AI 记录。
- 二期 4 周：Lab6-8 内核扩展。
- 三期课程化：学习工作台、教师端、AI 双 Agent、评分复核、Lab Factory。
- 团队：A 内核与平台工程，B 组件与测试，C 文档、评价与 AI 导师。

配图：时间轴。

讲稿：强调不是“只写代码”，而是从教学、工程、评价三条线协作。

### 第 6 页：参考练习：把官方环境真实跑通

页面文案：

ch3 sys_trace 7/7
ch4 mmap/munmap 16/16
ch5 spawn + stride 17/17
ch6 文件系统 syscall + spawn 33/33
ch8 死锁检测 25/25

页面结论：base 61/61，exercise 98/98。

配图：checker 输出截图或结果表。

讲稿：说清楚补丁可审阅、命令可复现，不是只贴分数。

### 第 7 页：自研内核：单内核渐进式架构

页面文案：

- 不是 8 个独立内核，而是一个 kernel 通过 feature gate 逐步打开。
- 学生始终在同一代码库，看到内核如何长出来。
- 参考环境 23 crate / 4 层依赖，自研 8 组件 crate / 2 层依赖。

配图：feature gate 依赖链图。

讲稿：这是全片最核心的架构差异。

### 第 8 页：workspace 与组件边界

页面文案：

- kernel：集成与策略，feature gate、调度、进程、fd 表、syscall 分发。
- os-sbi / os-context / os-syscall / os-alloc / os-vm / os-fs / os-signal / os-sync。
- user：用户态测试程序，反向验证内核行为。

配图：workspace 依赖图。

讲稿：强调组件可独立测试，内核只做集成。

### 第 9 页：8 个 Lab 一条线

页面文案：

| Lab | 主题 |
| --- | --- |
| Lab1 | 裸机启动 |
| Lab2 | trap 与多任务 |
| Lab3 | 虚存 |
| Lab4 | 进程 |
| Lab5 | 文件与并发 |
| Lab6 | 磁盘 FS |
| Lab7 | IPC 与信号 |
| Lab8 | 线程与同步 |

配图：从 lab1 到 lab8 的演进路线。

讲稿：读表即可，每个 Lab 都对应 OSTEP 三大主题。

### 第 10 页：二期扩展：Lab6-8

页面文案：

- Lab6：VirtIO 块设备、easy-fs、硬链接、fstat、spawn from disk。
- Lab7：统一 fd、dup、信号注册/投递/屏蔽。
- Lab8：进程内线程、阻塞 mutex/semaphore/condvar、银行家式死锁检测。

配图：Lab6-8 依赖与验证命令。

讲稿：说明二期从“演示型内核”走向“课程覆盖完整化”。

### 第 11 页：从 Markdown 手册到学习工作台

页面文案：

- VitePress 学习站点，同步实验指导、答案、设计文档。
- 工作台：左手册、右代码、下方终端/Problems/测试结果/Trace。
- 实验报告：过程、证据、思考题、复盘，一键提交。
- 进度勾选与验证命令复制。

配图：工作台界面截图。

讲稿：建议现场打开真实页面演示 1 分钟。

### 第 12 页：账号、班级与教师端

页面文案：

- 学生注册必填班级，代码、事件、报告、会话全部绑定账号。
- 教师端八块功能：公告、开放进度、任务分配、AI 配置、进度、报告。
- 三级对象：全局、班级、学生，学生覆盖大于班级覆盖大于全局。
- 任务变体：fill 补全、debug 排错、random 随机。

配图：教师控制台截图。

讲稿：强调系统可真实部署到课堂，不是静态网站。

### 第 13 页：可信证据链

页面文案：

- 退出码 0 不等于通过。
- 可信 recipe + runId + workspaceVersion + 命名断言 + Trace。
- 自定义命令不产生 verified=true。
- 没有真实 Trace 时保持空态，不展示 mock。

配图：证据链流程图。

讲稿：这是与“普通 Lab 平台”最大的区别，建议重点讲。

### 第 14 页：Trace 与 Problems

页面文案：

- 可信运行生成结构化 Trace，例如 trap_enter、task_switch。
- Trace 绑定 runId，跨账号访问返回 404。
- 编译诊断进入 Problems，可跳回源码行。
- 查看 Trace 会记录 trace_inspected 学习事件。

配图：Trace Viewer 截图。

讲稿：演示“失败 -> 诊断 -> 修复 -> 可信通过”的完整闭环。

### 第 15 页：AI 导师：为什么不是普通聊天框

页面文案：

- 苏格拉底式引导，只推进一个认知步骤。
- 七类问题意图：concept、code-reading、debug、verification、reflection、transfer、direct-answer。
- 直接索要完整代码触发答案护栏。
- L0-L4 提示按当前问题线程累计，换题后归零。

配图：AI 对话与证据条截图。

讲稿：强调 AI 的“动态性”来自意图与证据，不来自阶段按钮。

### 第 16 页：AI 导师：证据门控

页面文案：

- 学生可以附代码、终端、诊断、断言、Trace 提问。
- AI 只能引用本轮白名单内的 run/trace/event/kb。
- 没有可信 run 时，AI 不能声称验证通过。
- 模型输出后仍有答案泄漏与引用校验。

配图：direct-answer 拒答示例。

讲稿：现场演示“直接要代码”被拒，再附 Trace 后得到引导。

### 第 17 页：为什么拆成两个 AI Agent

页面文案：

- AI Tutor：帮学生思考，容错、鼓励试错。
- AI Assessment：稳定、可复现地评价学习过程。
- 同一模型又引导又打分，会产生自我评价污染。
- 教学对话可以有创造性，成绩必须可审计。

配图：双 Agent 架构图。

讲稿：说明这不是“多做一步”，而是保证公平与可审计。

### 第 18 页：AI 学习评价 Rubric v3

页面文案：

- 45% 过程 + 35% 结果 + 20% 反思。
- 14 个细项，每一项必须带证据引用。
- 无证据项目显示“未观察到”，禁止凭空给满分。
- 评分看学生行为：判断、证据、假设、验证、迭代、反思、迁移。

配图：评分细项展开图。

讲稿：说明系统评的是“怎么学”，不是“AI 有没有做对”。

### 第 19 页：教师复核与审计

页面文案：

- H1-H6 强制复核门控。
- 教师改分保留原自动分、理由、证据引用和 revision。
- 学生申诉进入复核队列。
- 教师拥有最终成绩裁决权。

配图：复核队列示意图。

讲稿：回答评委可能的“AI 会不会乱给分”质疑。

### 第 20 页：知识库与 RAG

页面文案：

- 8 个知识 Source：Lab 手册、OSTEP、RISC-V Reader、LearningOS、rCore Guide、CSAPP 等。
- 多格式规范化 + 章节感知分块 + 行号/页码 locator。
- FTS5 trigram 中文检索 + 向量检索 + RRF 混合排序。
- Tutor 最多 5 个 chunk，公共层最多 2 个。
- 教师上传资料默认 teacher-only，审核后才进入发布索引。

配图：知识分层图或教师知识工作台截图。

讲稿：强调“受控查资料”，不是把整个互联网塞给模型。

### 第 21 页：Lab Factory

页面文案：

- lint：校验 Lab package。
- dry-run：临时目录生成脚手架。
- test：隔离测试并生成 testRunId。
- publish：必须引用成功测试并由教师批准。
- 发布生成不可变 release 目录。

配图：Lab Factory CLI 输出。

讲稿：说明教师可以自己制作和发布实验变体，系统可扩展。

### 第 22 页：部署、安全与恢复

页面文案：

- Tutor Server 默认只监听本机，远程部署放 TLS 反向代理。
- API Key 只存服务端，不写仓库。
- SQLite 在线一致性备份，带 SHA-256 manifest。
- 恢复必须离线、显式确认、保留回滚副本。

配图：部署拓扑图。

讲稿：回答“这套系统能不能真的拿去上课”的问题。

### 第 23 页：验证结果：参考练习与内核

页面文案：

- 参考练习 base 61/61，exercise 98/98。
- Lab1-8 QEMU 全链通过。
- host 单测从 24 项扩到 40+ 项。
- clippy -D warnings 通过。

配图：绿色结果墙。

讲稿：只用 40 秒，给评委一个“全部可复现”的整体印象。

### 第 24 页：验证结果：平台与 AI

页面文案：

- M0 契约：npm test 16 项、smoke 通过、Lab2 QEMU 28 条 trap_enter、6 条 task_switch。
- Day7：npm run test:day7 约 88 秒通过。
- Tutor Harness 34/34，答案泄漏率 0，证据引用准确率 1。
- RAG Harness 3/3。
- V3 离线全链路综合 94；真实模型一轮综合 96。

配图：测试矩阵。

讲稿：注明离线 94 与真实模型 96 不是同一口径，重点展示“链路真实走通”。

### 第 25 页：三方对比

页面文案：

| 维度 | os-lab | tg-rcore | xv6 |
| --- | --- | --- | --- |
| 语言 | Rust | Rust | C |
| 架构 | 单内核 feature gate | 8 个独立内核 | 单一源码树 |
| 组件 | 8 crate / 2 层 | 23 crate / 4 层 | 无 crate |
| 代码 | 约 8353 行 | 约 36455 行 | 内核 6000-8000 行 |
| 实验 | 8 个 Lab | 8 章 | 11 个 Lab |
| 引导 | 问题驱动 + AI | 实现导向 | 步骤式 |

配图：对比表或定位象限图。

讲稿：结论是“差异化互补”，不是“替代”。

### 第 26 页：创新点

页面文案：

1. 渐进式单内核
2. 精简组件化
3. 内嵌测试与可信证据链
4. 问题驱动 + AI 协作模板
5. AI 双 Agent 评价闭环
6. 可进课堂的教学管理系统

配图：创新点图标。

讲稿：把每个创新点对应到“学生、教师、评委”中的一类价值。

### 第 27 页：局限与下一步

页面文案：

- 尚未大规模课堂验证。
- 调度、文件系统等仍保留教学简化。
- 真实模型 A/B 需多轮采样。
- 下一步：M5 试用、真实数据校准、抢占/COW/网络扩展、一体化部署。

配图：路线图。

讲稿：主动说局限，能显著提升可信度。

### 第 28 页：总结与致谢

页面文案：

- 初赛双线交付：参考练习 98/98，Lab1-8 内核闭环。
- 二期扩展：Web 工作台、教师端、AI 双 Agent、可信证据链。
- 最终价值：让 OS 学习从“背概念”变成“看见内核长出来”。

配图：完整系统截图或团队致谢。

讲稿：30 秒收尾，回到封面的一句话定位。

---

## 4. 现场演示脚本（3-5 分钟）

如果答辩允许演示，建议只演示一条最小闭环：

1. 登录学生账号，进入 Lab2 工作台。
2. 展示左侧手册、右侧代码、下方终端。
3. 保留或制造一个 debug 变体错误，先运行失败。
4. 展示 Problems 真实诊断并跳回源码行。
5. 修复后运行可信 recipe，展示命名断言全部通过。
6. 打开 Trace，定位 task_switch 的 from/to/reason。
7. 向 AI 导师直接要完整代码，展示拒答。
8. 附上 Trace 再问切换原因，展示证据引导。
9. 提交报告，展示评分细项与证据引用。
10. 切到教师端，展示复核队列或报告查看。

演示原则：

- 不展示 mock 数据。
- 不跨账号引用 run。
- 不宣称没有验证的结论。
- 如果模型连不上，提前准备离线兜底回复。

---

## 5. Q&A 预判

### Q1：你们的 AI 会不会直接给学生答案？

答：平台内置答案护栏、七类问题意图和输出后校验。完整代码、完整 patch、可直接提交实现会被拦截。AI 最多给局部伪代码、观察变量或下一步检查路径。Harness 的答案泄漏率为 0。

### Q2：AI 评分公平吗？

答：评分以服务端事件和可信 run 为输入，每一项带证据引用；无证据显示“未观察到”。AI 不直接给最终成绩，只给建议；H1-H6 风险门控和教师复核保证人工可终裁。

### Q3：退出码为 0 为什么不算通过？

答：程序可能正常退出但没有执行关键路径。系统只认可信 recipe、命名断言和 Trace，例如 Yield 必须观察到五轮，死锁测试必须返回 -0xDEAD。

### Q4：你们和 xv6 / rCore 有什么区别？

答：它们适合系统化深化，我们聚焦入门。单内核 feature gate 让演进脉络更清晰，Rust 降低内存调试成本，问题驱动文档和 AI 模板帮助学生先想再验证。

### Q5：实验环境部署麻烦吗？

答：仓库提供 Windows 激活脚本，Lab1-5 一条命令运行，Lab6-8 使用 make test-labN。教师端提供账号、进度、任务变体和 AI 配置；后续计划做 Docker/一体化部署。

### Q6：你们的数据能证明学习效果提升吗？

答：目前完成的是工程验证、契约测试、Harness 和离线校准；真实教学试用方案已就绪，尚未大规模执行。我们不把设计推断写成已证实结论。

### Q7：知识库里的教材会不会有版权问题？

答：资料只用于教学检索，来源固定 commit/PDF hash，许可证复核后才进入发布索引；教师上传默认 teacher-only，审核发布。

### Q8：AI 导师为什么按“问题意图”而不是“学习阶段”回答？

答：阶段只表示学生在页面上的位置，同一个问题在阅读页和调试页应得到相同回应。真正决定回应的是本轮问题类型、已有证据和提示等级，所以采用七类意图路由。

---

## 6. 制作 PPT 时的版面建议

- 每页只放一个核心结论，其他内容进讲稿。
- 数据页不要同时放 40 项测试，选 5-6 个最有冲击力的数字。
- 架构图用 mermaid 或自绘流程，避免贴整页代码。
- 所有截图必须来自真实页面，不要补假数据。
- 关键词用短句：低门槛、清晰脉络、可信验证、AI 不代写、教师可终裁。
- 最终检查：每一页能否用“为什么、做什么、证据是什么”回答。
