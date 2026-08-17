# EVOLVE 实验报告文档

---
## 1. 总体概述

### 1.1 项目背景

- **操作系统内核教学的结构性困境**

操作系统课程是计算机专业最重要的核心基础课之一，但内核部分的教学长期存在一组结构性矛盾。赛题背景对此有准确概括：学生听同一个老师上课、看同一本教材、参加同样的应试考试，缺少一对一指导。展开来看，困境体现在以下几个层面：

| 层面                       | 具体表现                                                     | 后果                             |
| -------------------------- | ------------------------------------------------------------ | -------------------------------- |
| 原理与实践脱节             | 学生能背诵页表、调度、信号的定义，但完成实践作业的过程中，没法有效地将课上所学与实践需要联系起来 | "知道"与"会做"之间的鸿沟无法跨越 |
| 缺少知识点全局理解         | 各章节知识点（Trap、内存、进程、文件、信号、线程等等）以孤立面目出现，学生难以把它们拼装成"一个完整运行系统"的图景 | 学完即忘，无法迁移到真实工程     |
| 缺少历史发展脉络           | 教材直接呈现"最终形态"的操作系统，学生不知道机制是如何被一步步根据需求提出、创造出来的 | 只见结果不见动机，理解浮于表面   |
| 忽视硬件细节与软件架构设计 | 特权级、寄存器约定、SBI 调用、设备内存映射等硬件事实，与内核模块划分、接口契约等架构能力，在传统作业中均得不到训练 | 遇到真实底层问题束手无策         |

- **传统实验环境的工程性瓶颈**

即便学生有意愿动手，传统实验环境本身还有一组工程性瓶颈：

1. **环境配置成本高**。交叉编译工具链、QEMU、Rust 工具链、磁盘镜像制作环环相扣，任何一环的版本差异都可能让实验无法启动，消耗大量本应用于理解机制的时间。
2. **过程证据缺失**。传统验收只看"代码 + 退出码"，即检验是否正常通过测试。学生是否真的运行过、运行了多少次、失败后如何修正，一律不可见；"抄一份能跑的代码"与"自己调试出来的代码"在提交物上无法区分。
3. **反馈周期长**。从写完代码到得到反馈（编译错误、运行行为、评分等）往往要经过一次完整的手工构建-运行-观察循环，甚至要等到助教批改。
4. **教师核验成本高**。教师面对一个班级的提交物，逐份核对"学生是否真正理解"的成本极高，最终只能退化为抽查或只看结果。

- **AI 浪潮带来的机遇与挑战**

另一方面，AI 辅助编程与 AI 问答的快速演进，对操作系统内核教学同时构成机遇与挑战：

​	**挑战**：学生把作业贴给大模型，直接得到可提交的完整实现，"实验通过"不再能证明"理解发生"；AI 可能编造不存在的运行事实，学生把幻觉当成结论；提问能力本身也需要被训练，否则 AI 会严重削弱学生的思考。

​	**机遇**：如果系统性地约束 AI 的行为边界——让它解释机制、追问判断、给出分级提示，而不是替学生写代码——AI 就可以成为每个学生都负担得起的"一对一助教"；它可以随时在场，结合学生当次的编译诊断与运行证据给出针对性回应，这是人类助教规模无法覆盖的。

本项目团队对于赛题的理解正是在这一背景下完成转变：让学生与 AI 充分合作，设计一套**适合学生本人自学**的操作系统内核教学实验环境，并通过这套环境高效完成学习——既懂理论概念与核心知识点，也具备较强实践开发能力，用什么架构保证 AI 服务于学习而不是替代学习。

### 1.2 项目定义

EVOLVE（**E**volving **V**irtual **OS** **L**earning & **V**erification **E**nvironment）是本团队设计并实现的完整教学实验系统，项目名称中的每个词都分别对应一条设计：

| 词                           | 含义         | 设计承诺                                                     |
| ---------------------------- | ------------ | ------------------------------------------------------------ |
| **Evolving**                 | 演进式       | 一套内核通过 feature 链从最小启动逐层长出 Trap、虚拟内存、进程、文件、信号、线程与同步，学生复现"操作系统如何一步步发展"的历史脉络 |
| **Virtual**                  | 虚拟化       | 全部运行在 QEMU `virt` 虚拟机上，环境零差异、可重复、可回滚，杜绝配置成本 |
| **OS Learning**              | 操作系统学习 | 以学生学习为中心组织一切能力：手册、脚手架、诊断、提示、复盘，全部指向"形成自己的判断" |
| **Verification Environment** | 验证环境     | 一切声称都必须落到可信证据：受控 recipe、行为断言、编译诊断与服务端事件等；Agent Server协作辅助学习 |

系统持续组织的完整实验闭环简单来说可为八个阶段：**发布 → 实践 → 验证 → 辅导 → 复盘 → 评价 → 验收 → 进阶**。

```mermaid
flowchart LR
  A[发布<br/>Lab Package 发放] --> B[实践<br/>源码编辑与受控运行]
  B --> C[验证<br/>Recipe 断言 诊断 Trace]
  C --> D[辅导<br/>AI Tutor 引导不替代]
  D --> E[复盘<br/>3-5 题反问反思]
  E --> F[评价<br/>规则+评分Agent融合]
  F --> G[验收<br/>教师统一终审]
  G --> H[进阶<br/>解锁下一 Lab]
  H -->|新任务| A
```

功能架构图如下：

![EVOLVE 功能架构图](assets/evolve-overall-architecture-final.png){width=94%}


### 1.3 核心理念

EVOLVE 的设计基于以可信证据为中心的学习闭环，收敛于三条核心理念。

**理念一：过程可证据化。** 系统的验收对象不是单一的内核二进制，而是"学生源码 + 可信运行 + 行为证据 + Tutor 对话 + 复盘 transcript + 报告 + 评价与验收记录"的完整学习记录。退出码可以伪造，过程证据链难以伪造。

**理念二：AI 引导而不替代。** Tutor 先识别问题意图，再按答案护栏、知识权限和证据白名单组织回应：模型可以解释机制、提示、引用知识库与学生自己的运行证据，但不能直接给出可提交答案，不能把知识库内容冒充为"你的代码已通过"的事实。AI 的输出被约束为"推动学生形成自己的判断"。

**理念三：门控与可落地性。** 权限判定、可信运行、评分与证据归属全部在服务端完成，前端只做交互展示；下一 Lab 的解锁由"教师开放 + 前一 Lab 可信验证通过 + 报告与复盘联合提交"三重门控决定，形成制度化的自迭代压力，并结合课堂使用实际，具有可落地性。

### 1.4 项目意义

**对学生的意义**：每个学生获得一对一、全程在线、行为可控的 AI 助教与一套零配置的完整实验环境；学习过程从"对着最终代码想象机制"变为"提出判断—设计验证—观察证据—修改复验"的工程师思维训练；复盘机制引导学生学会自我思考与反思复盘。

**对教师的意义**：教师看到的不再是黑箱提交物，而是附带完整证据链的过程记录；统一实验验收界面保留教师最终判断权与审计记录；Lab 变体与知识权限让"统一发放、个性练习、防抄袭"可以同时成立，显著降低核验成本，并可有效地推动教学复盘反馈。

**对课程与工程的意义**：内核以 Rust 组件 crate 形态组织，每个组件可独立单元测试，回应赛题"具备发布到 crates.io 条件"的工程要求；教学边界（进程容量、管道缓冲、同步对象数量等）被显式声明为教学容量，为后续课程复用与社区演进提供清晰的接口。

**对技术范式的意义**：项目探索了一条"LLM + 可信证据 + 制度化评价"的可落地融合路径——答案护栏先于检索、评分 Agent 在证据约束下与规则基线融合、模型超时或引用非法时明确回退等等机制。这一范式可从操作系统一门专业课程出发，可迁移到任何需要"过程可信 + AI 辅导"的实践教学场景。

### 1.5 主要工作

1. **渐进式教学内核**：单一内核通过 `lab1 → lab8` 链式 feature 逐步学习裸机启动、Trap 与系统调用、Sv39 虚拟内存、进程与 fork/exec/wait、文件与管道、VirtIO 磁盘文件系统、信号、线程与阻塞同步及死锁检测，覆盖 Lab1-Lab8 全部核心知识点。
2. **组件化 crate 工程**：Cargo Workspace 组织 kernel、user 与 8 个自研组件 crate（os-sbi、os-context、os-syscall、os-alloc、os-vm、os-fs、os-signal、os-sync），ABI 共享、host 可测、职责单一。
3. **可信证据系统**：受控 Runner、白名单命令、可信 recipe、行为断言、Cargo 诊断解析、Trace 采集与制品哈希，把"运行过"提升为"可信验证通过"。
4. **行为受约束的 AI 导师**：七类服务端权威意图路由、答案护栏先于 RAG、L0-L4 分级提示、证据白名单引用、模型接入与降级策略。
5. **知识库与混合检索**：可追踪的知识生产链、四类内容权限、SQLite FTS5 关键词检索与向量检索经 RRF 融合、发布回滚与审计。
6. **评价与验收闭环**：Assessment 辅助 Tutor 生成复盘反问计划并逐题执行；Rubric v3 规则基线与评分 Agent 有证据约束地融合；掌握画像、异常门控与教师统一验收。
7. **教学平台与教师控制面**：每生隔离源码工作区、Monaco 编辑、xterm 终端、Problems 诊断面板、Trace 可视化、报告与复盘联合提交；教师侧班级管理、实验变体、知识库、报告与期末任务管理；Lab Package 版本化发布与备份恢复机制。


注：基于赛题阶段性要求，初赛完成的实现本次不再赘述，具体内容可查看[初赛实验报告](./docs/初赛项目总报告.md)；赛题要求技术指标1的参考练习总结报告可见**附录A**，原文见[参考练习实现总结报告](./docs/reference-report.md)。


## 2. 比赛题目分析和相关资料调研

### 2.1 赛题问题解读

赛题名称为"AI 合作的操作系统课教学实验环境"（AI-assisted Operating System Teaching Experimental Environment），任务要求学生与 AI 充分合作，参考最新组件化实验代码与参考资料，设计一套**适合学生本人自学**的操作系统内核教学实验环境，其中必须包含四类内容：实验指导文档、实验代码、测试用例/实验答案、文字类习题/文字类答案；并通过完成这套环境的各种教学与练习，高效完成对操作系统内核的学习。

赛题的两项技术指标及其权重与项目应对如下：

| 技术指标                                                     | 权重 | EVOLVE 的应对                                                |
| ------------------------------------------------------------ | ---- | ------------------------------------------------------------ |
| 指标 1：在参考"最新教学实验环境"中完成 5 个基础实验练习，提升理论与实操水平，完成练习实现总结报告 | 30%  | 在参考环境 `tg-rcore-tutorial`（branch `test`，commit `d6330a6`）的 ch3/ch4/ch5/ch6/ch8 完成练习，补丁保存于 `reference-patches/`，复现过程与 checker 结果见 `docs/reference-report.md`。这 30% 同时是自研系统的"需求调研"：亲历参考环境的长处与不足，为 70% 的自研提供第一手输入 |
| 指标 2：设计完成适合自己的教学实验环境，要求改进、扩展、裁剪、重构参考环境并体现个人特点；给出学习效率评估，以及本校已有环境、参考环境、自研环境三者的定性与定量对比分析；给出实验练习答案；完成设计总结报告 | 70%  | 设计和实现 EVOLVE 全部源码；三环境对比框架见本文 2.5 节；Lab1-Lab8 全部练习答案、设计总结报告等随实验材料交付。 |

### 2.2 赛题特征对照

赛题给出了五条硬性特征，EVOLVE 逐条落实如下：

| #    | 赛题特征                                                     | EVOLVE 的落实                                                | 所在位置                                               |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------ |
| 1    | 操作系统内核编程语言为 Rust                                  | 内核、用户库与全部组件 crate 均为 Rust 2021，`#![no_std]` 裸机实现 | `os-lab/kernel/`、`os-lab/os-*/`                       |
| 2    | 硬件环境是 RISC-V 64，在 QEMU 模拟器上运行                   | QEMU `virt` 机器 + OpenSBI 固件 + Sv39 分页 + VirtIO 块设备，全链路 RISC-V 64 | 内核启动链路、`virtio_block.rs`、Makefile QEMU 目标    |
| 3    | 基于 Rust Crate 组件化编程，每个内核主体或内核模块能通过单元测试和系统测试，且具备发布到 crates.io 的条件 | Cargo Workspace 10 成员；syscall ABI、Trap 上下文、页帧/页表、信号状态机、同步原语等下沉为 8 个独立 crate，可在 host 上 `cargo test`，QEMU 系统测试覆盖集成路径；统一 BSD-3-Clause 许可与包元数据 | `os-lab/Cargo.toml`、`os-lab/os-*/`、`os-lab/Makefile` |
| 4    | 文档格式是 Markdown                                          | 实验手册、工程文档、知识库源、Lab 规格全部支持 Markdown      | `os-lab/labs/`、`os-lab/docs/`、`os-lab/lab-packages/` |
| 5    | 用 mermaid 格式等文字方式画图                                | 技术文档与手册中的架构图、时序图、流程图均为 mermaid 文本，可版本化、可 diff | 本文及实验手册等各章                                   |

### 2.3 评审分析自查

赛题公布的考察方向及评审维度，EVOLVE对应设计如下：

| 关键词                     | 解读                                                         | EVOLVE 的对应设计                                            |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| LLM 引导学生思考           | 评审关注 AI 是否被用作"引导思考的教学角色"而非"答案机器"     | 七类意图路由、答案护栏先于 RAG、L0-L4 分级提示：模型解释机制、追问判断，不直接给可提交实现 |
| 交互行为打分（环境的限制） | 在真实环境约束下考察学生与 AI 的交互行为质量，而非理想的对话样本 | Tutor 对话、轮次策略与证据引用全部持久化为事件，成为评价输入；环境明确限制 AI 泄题与伪造运行事实 |
| 完善的方案                 | 方案要覆盖环境、内核、辅导、评价、验收全链条，不留断头路     | 发布-实践-验证-辅导-复盘-评价-验收-进阶八阶段闭环，含部署、备份与恢复 |
| 自迭代                     | 系统能驱动学生自我修正、逐级进阶，而非一次通过               | 失败-诊断-提示-复验循环；下一 Lab 三重门控（教师开放 + 前一 Lab 可信通过 + 报告复盘联合提交） |
| 完整闭环                   | 从任务发放到教师验收形成可审计的完整链路                     | 证据链贯穿：run event、diagnostic、trace、transcript、评价与验收记录 |
| 过程性学习                 | 评价对象是学习过程而不只是最终产物                           | Rubric v3 过程评价、掌握画像、苏格拉底式复盘、Assessment Agent 融合 |

对四个评审维度，EVOLVE 的支撑点分别为：

**创新性**——可信证据接入 Tutor/评价/验收的同一引用契约、答案护栏与知识权限约束下的 AI 辅导、报告与复盘作为联合提交对象、三重解锁门控；

**完整性**——Lab1-Lab8 内核全知识点 + 平台 + 辅导 + 评价 + 教师端 + 部署恢复的端到端覆盖；

**代码质量**——组件化 crate、host 单测 + QEMU 系统测试、显式实现边界声明；

**文档完整性**——实验手册、工程文档、机器可读 Lab 规格、知识库溯源与本技术文档体系。

### 2.4 相关资料与技术调研

- **操作系统理论与教材**

| 资料                            | 调研问题                                     | 对设计的影响                                                 |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| OSTEP（《操作系统导论》中文版） | 各机制的动机叙事与"逐步逼出"的讲解顺序       | Lab 手册的概念目录与误区说明按 OSTEP 的动机线组织；虚拟化/并发/持久化三大篇映射到 Lab3-Lab5、Lab8、Lab6-Lab7 |
| CSAPP（深入理解计算机系统）     | 程序的机器级表示、链接、异常控制流的基础视角 | Trap 与信号部分的概念铺垫；异常控制流统一讲解 Lab2 Trap 与 Lab7 信号 |
| RISC-V Reader 中文版            | 特权架构、CSR、satp/scause/sepc 等硬件事实   | 内核 CSR 操作封装、Trap 上下文布局与地址空间设计直接依据特权规范 |

- **课程讲义与实验体系**

| 资料                                                         | 调研问题                                | 对设计的影响                                                 |
| ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| OS 课程在线讲义（learningos.cn / os-lectures）               | 课程知识点全景与讲义结构                | 知识库与概念目录的上游来源之一，保证教学覆盖面与课程对齐     |
| rCore-Tutorial Book v3 / 实验代码 / 指导文档 / 测试用例      | 渐进式教学内核的组织方式、测试驱动方式  | Lab 划分与"每个 Lab 一个可验证能力"的原则；用户态测试程序的组织方式 |
| tg-rcore-tutorial（rCore-Tutorial-in-single-workspace, branch `test`） | 参考环境（30% 练习对象 + 70% 对比对象） | 组件化 workspace 结构的参照                                  |
| 2025 秋冬季开源操作系统训练营                                | 真实自学者的学习路径与常见卡点          | 复盘题库与误区知识块的现实素材；环境配置零成本目标的依据     |

- **系统与底层技术**

| 技术                                             | 调研问题                                | 设计决策                                                     |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| QEMU `virt` 机器                                 | 如何获得零差异、可重复的 RISC-V 64 环境 | 全部实验运行于 `virt`；受控 Runner 以子进程方式驱动 QEMU 并捕获串口输出 |
| OpenSBI 与 SBI legacy 扩展                       | 裸机下的控制台输出与关机原语            | `os-sbi` crate 封装 putchar/shutdown，隔离固件约定           |
| Sv39 页表与 satp 切换                            | 三级页表、token 编码、sfence.vma 时机   | `os-vm` 实现页表/MapArea/MemorySet；Trap 路径内核/用户页表切换 |
| VirtIO MMIO 块设备                               | 真实块设备驱动与 fs.img 挂载            | Lab6 映射 `0x1000_1000` MMIO 区，easy-fs 挂载 VirtIO 磁盘    |
| easy-fs 教学文件系统                             | 磁盘布局、inode、块缓存                 | Lab6 文件系统底座；link/unlink 在其上做教学化元数据层并显式声明边界 |
| Rust `no_std`、链接脚本、Cargo Workspace/feature | 裸机 Rust 工程的组织与条件编译          | 单一内核 + 链式 feature；组件 crate 化；发布元数据齐备       |

- **前端与交互技术**

| 技术              | 用途                                 | 备注                               |
| ----------------- | ------------------------------------ | ---------------------------------- |
| Monaco Editor     | 浏览器内源码编辑，错误标记与源码定位 | 与 Cargo 诊断联动跳转              |
| xterm.js          | 浏览器终端，对接受控命令执行         | 白名单命令 + recipe 权限           |
| Vue 3 + VitePress | 教学工作台与手册站点、教师端组件     | 前端只做交互展示，权限判定在服务端 |

- **AI 辅导与检索技术**

| 技术/方法                      | 调研问题                                   | 设计决策                                                     |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| LLM API 接入与 Prompt 分层组装 | 如何让模型行为稳定可约束                   | 分层 Prompt（系统策略 + 护栏 + 知识 + 证据 + 学生上下文）；超时/不可用时明确降级 |
| 答案护栏（guardrails）模式     | 防止 AI 泄题与替代实现                     | 护栏先于 RAG：先判定问题意图是否触达答案层，再决定检索范围   |
| 苏格拉底式 AI 教学             | "引导思考"如何工程化                       | L0-L4 分级提示；追问优先于给结论；复盘反问                   |
| 混合检索 RAG                   | 短词、代码标识符与语义三类查询如何同时命中 | FTS5 承担关键词与标识符检索，向量承担语义，RRF 融合排序；引用必须命中知识库才可入 Prompt |

- **参考项目与文献**

  详细参考与设计启发说明可见[参考资料详细说明](./papers/README.md)。

[1] GARMPIS A. Design and development of a web-based interactive software tool for teaching operating systems[J/OL]. Journal of Information Technology Education: Research, 2011, 10: 1-17[2026-08-16]. https://doi.org/10.28945/1357.

[2] AVIV A J, MANNINO V, OWLARN T, et al. Experiences in teaching an educational user-level operating systems implementation project[J/OL]. ACM SIGOPS Operating Systems Review, 2012, 46(2): 80-86[2026-08-16]. https://doi.org/10.1145/2331576.2331588.

[3] KEUNING H, JEURING J, HEEREN B. A systematic literature review of automated feedback generation for programming exercises[J/OL]. ACM Transactions on Computing Education, 2019, 19(1): 1-43[2026-08-16]. https://doi.org/10.1145/3231711.

[4] KASNECI E, SESSLER K, KUCHEMANN S, et al. ChatGPT for good? On opportunities and challenges of large language models for education[J/OL]. Learning and Individual Differences, 2023, 103: 102274[2026-08-16]. https://doi.org/10.1016/j.lindif.2023.102274.

[5] SCHOLL A, SCHIFFNER D, KIESLER N. Analyzing chat protocols of novice programmers solving introductory programming tasks with ChatGPT[EB/OL]. arXiv:2405.19132, 2024[2026-08-16]. https://arxiv.org/abs/2405.19132.

[6] AMOOZADEH M, NAM D, PROL D, et al. Student-AI interaction: A case study of CS1 students[EB/OL]. arXiv:2407.00305, 2024[2026-08-16]. https://arxiv.org/abs/2407.00305.

[7] SHAO T, FEIJOO-GARCIA M, ZHANG Y, et al. Tracing prompt-level trajectories to understand student learning with AI in programming education[EB/OL]. arXiv:2604.10400, 2026[2026-08-16]. https://arxiv.org/abs/2604.10400.

[8] MAURYA K K, SRIVATSA K V A, PETUKHOVA K, et al. Unifying AI tutor evaluation: An evaluation taxonomy for pedagogical ability assessment of LLM-powered AI tutors[EB/OL]. arXiv:2412.09416, 2024[2026-08-16]. https://arxiv.org/abs/2412.09416.

[9] SCARLATOS A, LIU N, LEE J, et al. Training LLM-based tutors to improve student learning outcomes in dialogues[EB/OL]. arXiv:2503.06424, 2025[2026-08-16]. https://arxiv.org/abs/2503.06424.

[10] SHI Y, LIANG R, XU Y. EducationQ: Evaluating LLMs' teaching capabilities through multi-agent dialogue framework[EB/OL]. arXiv:2504.14928, 2025[2026-08-16]. https://arxiv.org/abs/2504.14928.

[11] JIANG M, YUE H, LI B, et al. SID: Benchmarking guided instruction capabilities in STEM education with a Socratic interdisciplinary dialogues dataset[EB/OL]. arXiv:2508.04563, 2025[2026-08-16]. https://arxiv.org/abs/2508.04563.

[12] LEWIS P, PEREZ E, PIKTUS A, et al. Retrieval-augmented generation for knowledge-intensive NLP tasks[C/OL]//Advances in Neural Information Processing Systems 33. 2020: 9459-9474[2026-08-16]. https://arxiv.org/abs/2005.11401.

[13] GAO Y, XIONG Y, GAO X, et al. Retrieval-augmented generation for large language models: A survey[EB/OL]. arXiv:2312.10997, 2023[2026-08-16]. https://arxiv.org/abs/2312.10997.

[14] ZHENG L, CHIANG W L, SHENG Y, et al. Judging LLM-as-a-judge with MT-Bench and Chatbot Arena[C/OL]//Advances in Neural Information Processing Systems 36. 2023[2026-08-16]. https://arxiv.org/abs/2306.05685.

[15] LI H, DONG Q, CHEN J, et al. LLMs-as-judges: A comprehensive survey on LLM-based evaluation methods[EB/OL]. arXiv:2412.05579, 2024[2026-08-16]. https://arxiv.org/abs/2412.05579.

[16] HONG Y, YAO H, SHEN B, et al. From rubrics to reliable scores: Evidence-grounded text evaluation with LLM judges[EB/OL]. arXiv:2601.08654, 2026[2026-08-16]. https://arxiv.org/abs/2601.08654.

### 2.5 环境框架对比

为支撑赛题要求的"三者定性与定量对比分析"，EVOLVE 与参考框架对比如下：

| 维度         | EVOLVE                                                   | tg-rcore-tutorial                       | xv6-riscv                                        |
| ------------ | -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| 定位         | 课程化入门：单内核渐进 + 教务工作台 + AI 协作            | 经典分章教程：章内完整练习 + checker    | 经典深化：最小但完整的 Unix-like 内核 + 教材 lab |
| 语言         | Rust（少量汇编）                                         | Rust（少量汇编）                        | C（少量汇编）                                    |
| 平台         | RISC-V 64 + QEMU `virt` + OpenSBI                        | 同左                                    | RISC-V 64 + QEMU `virt`（无 SBI，自管启动）      |
| 代码组织     | 单内核 + `lab1`–`lab8` feature                           | 多章节独立工程                          | 单一 C 源码树，无 feature gate                   |
| 规模（量级） | 约 9.1k 行 / 73 个源文件 + 8 个 `os-*` crate（实测统计） | 多章合计更大（早期采集约 3.6 万行量级） | 内核约 6k–8k 行 C，加用户态约 10k+               |
| 实验组织     | 8 Lab，同一仓库递进                                      | 多章；练习强度高、继承测例多            | 11 个 6.S081 lab（配置因校而异）                 |
| 验收         | QEMU 关键输出 / `make test-labN` + 40 host 单测          | `tg-rcore-tutorial-checker`             | `make qemu` + `grade-lab-*` / usertests          |
| 课堂形态     | Web 手册 + 隔离工作区 + 教师端 + AI 导师                 | 本地 clone + 终端为主                   | 教材 + 终端 lab；教务多自建                      |

特别是AI时代，生成式 AI 工具普及后，操作系统实验课出现了很多新难题。经典路径（tg-rcore / xv6）并非存在设计缺陷——它们出现时，默认“学生自己读文档、在终端里调试”，AI 尚不在需要考虑的因素之内；今天这一前提发生了变化，课程设计若不做调整，难题会被进一步放大。EVOLVE 的思路是把应对办法做成平台自带的功能，而非要求教师自行拼装工具，或难以避免学生过度使用 AI 工具阻碍自由思考：

| 难题                                   | tg-rcore 的表现                                              | xv6 的表现                                 | EVOLVE 的应对                                                |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| **过程不可见**（教师仅能看到最终结果） | 教师主要看到判题分数，难以区分“真正理解”与“AI 生成后略作修改” | 主要看到评分脚本的结果；过程材料需自行建设 | 学生在独立工作区中实验；平台记录真实运行过程；实验报告与复盘留档，评分时可见代码的完整运行轨迹 |
| **AI 代写绕过思考**                    | 练习题可整段交给外部 AI 完成，教程无法干预                   | 作业补丁同样可由 AI 生成，系统无内建约束   | 内置 AI 助教：回答前先查看学生当前的代码、报错与运行记录，不直接给出完整答案；练习采用“补全代码”与“定位错误”两种形式，整段抄袭无法通过 |
| **反馈慢与两极分化**                   | 首周耗在环境搭建；基础较弱者卡在编译与运行环节，基础较好者借助 AI 快速完成 | C 语言、完整内核加运行期调试，入门门槛更高 | 统一学习平台，免除本地环境搭建；40 项单元测试快速给出结果；教师可分阶段控制开放内容 |
| **评价难公平**（分数相同、理解不同）   | 相同分数下理解深度差异显著，且缺少可复查的材料               | 问题同样存在；教材深入，但不解决过程评价   | 报告采用统一模板；复盘环节通过追问考察“为什么”；AI 回答以课程资料为依据；教师逐份复核并留存记录 |

更多完整对比数据请见**附录B**。


## 3. 系统框架设计


### 3.1 总体架构

![EVOLVE 总体技术架构](assets/evolve-technical-architecture-final.png){width=94%}

如上图所示，系统可大致分为四个部分：

| 组成部分         | 职责定位                                                     | 关键目录 / 技术                                              |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 浏览器教学工作台 | 交互展示                                                     | `os-lab/handbook/.vitepress/theme/`，VitePress + Vue 3、Monaco、xterm |
| 实验运行时       | 被测对象：渐进式 RISC-V 内核 + 用户态程序 + QEMU `virt` + VirtIO 磁盘 | `os-lab/kernel/`、`os-lab/user/`、8 个 `os-*` 组件 crate     |
| Agent Server     | 一切权限、运行、评分与证据归属的判定中枢                     | `os-lab/handbook/tutor-server.mjs` + `os-lab/tutor/` + `os-lab/learning/` |
| 持久化           | 工作区文件、学习主库、大制品、知识库、教师配置               | `student-labs/`、`os-lab.db`、`student-data/`、`knowledge.db`、`teacher.json` |

项目成果的前端部分页面展示请见**附录C**，具体功能演示请查看我们的[演示视频（百度网盘链接）](https://pan.baidu.com/s/1Op4q9HHMIZFf1YBxnh12EQ?pwd=e561)。

接下来，我们从系统框架角度简要介绍我们的架构与技术。其中，Agent Server 相关技术的更详细分析请见**附录D**。

### 3.2 渐进式 RISC-V 教学内核

- **单一内核、逐层 feature**

内核不维护八份复制的代码，而是一个 Cargo Workspace（10 个成员：`kernel`、`user` 与 8 个组件 crate），用**链式 feature** 表达实验递进：

```text
lab1 -> lab2 -> lab3 -> lab4 -> lab5 -> lab6 -> lab7 -> lab8
```

启用 `lab8` 会递归启用前面全部实验能力并额外引入 `os-sync`；`kernel/src/main.rs` 再以 `#[cfg(feature = "labN")]` 控制模块注册和初始化路径。这个设计有三重收益：

1. 回归免费获得——Lab8 的验证天然覆盖此前全部 syscall、文件系统和进程行为；
2. 演进可见——学生始终在同一份系统上叠加机制，"任务管理器（Lab2–3）→ 进程管理器（Lab4 起）→ 进程/线程双层（Lab8）"的切换发生在同一内核入口，diff 清晰可读；
3. 认知负担受控——每个 Lab 只打开该层需要的模块，不用面对全量代码。

- **裸机启动与运行环境**

启动链路为：

```mermaid
sequenceDiagram
  participant Q as QEMU virt
  participant S as OpenSBI
  participant E as entry.asm
  participant M as rust_main
  participant K as Lab 内核子系统

  Q->>S: 启动固件
  S->>E: 跳转到 _start
  E->>E: 设置 boot_stack_top
  E->>M: call rust_main
  M->>M: 清零 .bss 并初始化控制台
  M->>K: 按 feature 初始化内存 Trap FS 进程等
  K-->>S: 实验完成或 panic 后 shutdown
```

启动链路固定为：**QEMU `virt` → OpenSBI → `entry.asm`（设 256 KiB 启动栈）→ `rust_main`（清零 `.bss`、初始化控制台）→ 按 feature 初始化内存 / Trap / FS / 进程等子系统**；实验完成或 panic 后经 SBI 关机。各层机制随 Lab 逐步上线：Lab2 起初始化 Trap 与用户程序，Lab3 起页表，Lab5 起堆、同步与文件系统，Lab6 起 VirtIO MMIO 映射（`0x1000_1000`），Lab8 起线程与阻塞同步状态。

- **内核机制栈**

  - **Trap、特权级与系统调用 ABI**

    - `os-context` 定义的 `TrapContext` 内存布局与 `trap.asm` 严格一致（32 个通用寄存器后跟 `sstatus`、`sepc` 与内核栈信息）。

    - `trap_handler` 的处理顺序是：区分 `scause` → 系统调用先推进 `sepc`（防止返回后重复执行 `ecall`）→ 从 `a7`/`a0–a2` 取编号与参数 → 按 feature 分派到进程/内存/文件/信号/同步模块 → 返回值写回 `a0` → 分页启用时切换内核/用户 `satp` 并 `sfence.vma` → `sret` 返回。

    - syscall 编号与共享结构统一放在 `os-syscall`，用户态封装在 `user/src/syscall.rs`，用户 ABI 不依赖在内核中复制常量。

  - **内存管理。**

    - 三层分工：`os-alloc`（物理页帧 + 内核堆）、`os-vm`（Sv39 三级页表、`MapArea`、`MemorySet`）、`kernel/src/mm.rs`（组织与策略）。

    - 关键路径包括按 ELF `PT_LOAD` 段建立映射、每任务/进程独立 `space_id` 隔离地址空间、`fork_user_space` 重建子进程空间、`replace_user_space*` 服务 `exec`、Lab6 匿名 `mmap/munmap`。

    - 实现边界明确声明：`fork` 为逐页深拷贝（无 COW），`mmap` 不做文件映射。

  - **调度模型的三次演进。**

| 阶段   | 控制块                     | 调度模型                                                     |
| ------ | -------------------------- | ------------------------------------------------------------ |
| Lab2–3 | `TaskControlBlock`         | 固定任务表、Ready/Running/Exited、轮转查找                   |
| Lab4–7 | `ProcessControlBlock`      | 进程表、父子关系、Zombie、wait；Lab6 增加 priority/stride    |
| Lab8   | PCB + `ThreadControlBlock` | 进程拥有地址空间与资源，线程拥有 Trap 上下文、栈与调度状态；`Processor` 管理 ready queue 与线程槽位 |

- **组件化与分层测试**

8 个组件 crate 把**可独立测试的纯逻辑**与**依赖硬件/调度的内核主体**分开：

| crate        | 职责                                      |
| ------------ | ----------------------------------------- |
| `os-sbi`     | SBI 控制台、定时器、关机调用              |
| `os-context` | Trap 上下文布局、汇编入口、用户态恢复     |
| `os-syscall` | 内核/用户共享的 syscall 编号与 ABI 结构   |
| `os-alloc`   | 页帧分配、内核堆、测试钩子                |
| `os-vm`      | Sv39 页表、映射区域、地址空间、ELF 段映射 |
| `os-fs`      | fd 种类与磁盘文件接口抽象                 |
| `os-signal`  | 信号位图、动作、掩码、进程信号状态        |
| `os-sync`    | 等待队列、阻塞互斥锁、信号量、条件变量    |

测试策略随之分层：host Rust 测试覆盖组件纯逻辑（不依赖 QEMU），QEMU 测试覆盖组件与 Trap、地址空间、设备的集成。这使大部分数据结构错误能在本地快速回归，而昂贵的整机验证留给可信 Recipe。

### 3.3 Lab 实验体系与教学编排

**1. 知识地图与递进关系**

EVOLVE共设置 8 个 Lab，覆盖基础机制以及教材《操作系统导论》中的三大主题：虚拟化、并发与持久化，并靠 Cargo feature 链递进启用：

```mermaid
graph LR
    subgraph 基础机制
        B1["lab1 裸机启动"]
        B2["lab2 trap/系统调用"]
    end
    subgraph 虚拟化
        V1["lab3 虚存<br/>地址空间隔离"]
        V2["lab4 进程<br/>fork/exec/wait"]
    end
    subgraph 并发
        C1["lab5 自旋锁<br/>数据竞争"]
        C2["lab7 IPC/信号<br/>管道/dup/信号"]
        C3["lab8 线程<br/>阻塞同步/死锁检测"]
    end
    subgraph 持久化
        P1["lab5/6 文件系统<br/>fd/内嵌文件/VirtIO"]
    end

    B1 --> B2 --> V1 --> V2
    B2 --> C1
    V2 --> P1
    V2 --> C2
    C1 --> C3
    C2 --> C3

    classDef base fill:#e8f5e9,stroke:#2e7d32;
    classDef virt fill:#e3f2fd,stroke:#1565c0;
    classDef conc fill:#fff3e0,stroke:#ef6c00;
    classDef persist fill:#f3e5f5,stroke:#7b1fa2;
    class B1,B2 base;
    class V1,V2 virt;
    class C1,C2,C3 conc;
    class P1 persist;
```

| OS 主题  | 对应 Lab         | 核心知识点                                                 |
| -------- | ---------------- | ---------------------------------------------------------- |
| 基础机制 | Lab1、Lab2       | 裸机启动、SBI、Trap、系统调用、上下文切换                  |
| 虚拟化   | Lab3、Lab4       | Sv39 页表、地址空间、fork/exec/wait、进程树                |
| 并发     | Lab5、Lab7、Lab8 | 自旋锁、管道、信号、阻塞 mutex/semaphore/condvar、死锁检测 |
| 持久化   | Lab5、Lab6       | fd 表、内嵌只读文件系统、VirtIO / easy-fs 磁盘 FS          |

**2. 各 Lab 教学内容与可信验证**

每个 Lab 特别设置了教学目标、实现要点与现网受信 recipe；通过条件均为行为断言（及约定 Trace），而不是仅看 QEMU 退出码。

项目团队结合学习经历、教材参考、AI辅助等为每个lab编写了详细的实验手册。以Lab1为例，实验手册请见**附录E**。

- **Lab1 · 裸机启动与最小内核**
  - **教学目标**：理解 `no_std`、链接地址、启动栈、SBI 与内核入口关系。
  - **实现要点**：`entry.asm` 设栈 → `rust_main` 清 `.bss` 并初始化控制台 → `println!` 经 `os-sbi` 输出 → SBI shutdown。
  - **可信验证**：`lab1.verify.v1` 检查 `Hello, OS!` 与 QEMU `virt` 启动标记。

- **Lab2 · Trap、系统调用与协作式调度**
  - **教学目标**：打通 `ecall`、Trap 上下文保存/恢复与多任务轮转。
  - **实现要点**：`trap.asm` + `TrapContext`；`trap_handler` 分派 write/exit/yield；`task.rs` 轮转 Ready 任务；`trace-edu` 输出 `trap_enter` / `task_switch`。
  - **可信验证**：`lab2.verify-trace.v1` 检查 Hello、Power、至少五次 Yield、全部退出及两类 Trace，防止“进程结束但任务提前退出”的假通过。

- **Lab3 · Sv39 虚存与地址空间隔离**
  - **教学目标**：从物理直跑演进到每任务独立虚拟地址空间。
  - **实现要点**：页帧池与内核恒等映射；Sv39 三级页表与 `satp`；ELF `PT_LOAD` 与用户栈映射；Trap 路径内核/用户页表切换；`U/R/W/X` 权限。
  - **可信验证**：`lab3.verify.v1`（`lab3,trace-edu`）检查用户输出（含 Power）、恰好五次 `Yield round`、全部退出，以及 `address_space`（create）Trace。

- **Lab4 · 进程与 fork/exec/wait**
  - **教学目标**：建立 Unix 风格进程生命周期与父子关系。
  - **实现要点**：PCB/进程表；fork 深拷贝地址空间与 Trap 上下文；execve 重建空间；exit→Zombie；wait4 回收；调度跳过 Zombie。
  - **可信验证**：`lab4.verify.v1` 检查 `I am parent` / `I am child`、`fork_test pass`、全部进程退出，以及 `clone` / `wait4` Trace。

- **Lab5 · 文件描述符、内嵌文件与管道**
  - **教学目标**：把进程、文件与进程间通信连接起来。
  - **实现要点**：内嵌只读文件；进程 fd 表；openat/read/write/close；环形缓冲管道；fork 后 fd 引用共享；内核同步保护共享结构。
  - **可信验证**：`lab5.verify.v1` 检查 `Hello from testfile!`、`fs_test pass`、`pipe_test pass`、全部退出，以及 `openat` / `pipe` Trace。

- **Lab6 · VirtIO 磁盘 FS、mmap、spawn 与 stride**
  - **教学目标**：从内嵌文件升到真实块设备，并引入映射与调度策略实验。
  - **实现要点**：VirtIO MMIO（`0x1000_1000`）与 easy-fs；磁盘文件与 link/unlink/fstat；spawn 从 FS 装 ELF；mmap/munmap；stride 调度（priority/pass）。
  - **可信验证**：`lab6.verify.v1` 挂载磁盘后检查 `file_test` / link / `mmap_test` / `spawn_test` / `stride_test` 及 fs、pipe 回归，并匹配 `linkat` / `mmap` / `spawn` Trace。

- **Lab7 · 统一 fd 与信号**
  - **教学目标**：理解统一 I/O 抽象、描述符复制，以及异步信号对控制流的改变。
  - **实现要点**：fd 统一分派文件/管道；dup；`os-signal` 集合/动作/掩码；kill / sigaction / sigprocmask；投递时改写 Trap 进 handler，sigreturn 恢复。
  - **可信验证**：`lab7.verify.v1` 检查 `dup_test`、`signal_test`、`signal_mask_test`、管道回归，以及 `dup` / `kill` / `sigreturn` Trace。

- **Lab8 · 线程、阻塞同步与死锁检测**
  - **教学目标**：区分进程资源与线程执行上下文；理解阻塞/唤醒、互斥、信号量、条件变量与死锁判定。
  - **实现要点**：PCB 持有地址空间与资源，TCB 持有执行上下文；thread_create / waittid；`os-sync` 的阻塞 mutex / semaphore / condvar；syscall 返回 `-1` 时回退 `sepc` 以便唤醒后重试，返回 `-0xDEAD` 表示检测拒绝；mutex wait-for 链与 semaphore 安全性检查。
  - **可信验证**：`lab8.verify.v1` 检查线程创建与传参、mutex、condvar、管道回归及 mutex/semaphore 死锁用例，并匹配 thread_create / mutex_lock / condvar_wait / enable_deadlock_detect 等 Trace。

**3. 教学编排与设计**

- **教学设计并行原则**

  - **内核演进**：每一层只新开本层机制，更高层验证仍回归前层能力；学生始终在同一内核入口上叠加，复现“先启动与陷入，再隔离与进程，再持久化与并发”的构建顺序。

  - **平台闭环**：实验不是散落的文件包，而是按链路运转：

    **规格定义 → 教师开放与变体发放 → 学生增量领取与实践 → 受信断言/Trace 验证 → 报告复盘联合提交 → 解锁下一 Lab（或期末探索）**

- **机器可读 Lab 规格（Lab Package）** 
  每个实验以 `lab-packages/labN/lab.yaml` 为单一事实源，声明：

  ```text
  schema_version / id / title / version / feature
  prerequisites / manual / answers / tutor_context
  knowledge / tasks / starter_files
  variants / verification / misconceptions / rubric_ref
  ```

  手册正文、Scaffold 发放清单、Tutor 上下文、可信 recipe 与误区说明都从这里对齐，避免多处手改漂移。规格同时服务三类读者：学生（学什么、改哪里）、教师（发什么变体、验什么断言）、平台（如何校验与发布）。

- **渐进式 Scaffold 与三重进阶门控** 
  学生可编辑系统落在 `os-lab/student-labs/<username>/`。文件 API 只暴露教学源码树，拒绝 `..` 与越界路径；浏览器里 Monaco 只是编辑界面，真正落盘以服务端这份工作区为准。。

  发放规则：

  - 首次初始化得到 Lab1 基线；
  - 下一 Lab 须同时满足：教师开放 + 前一 Lab 可信验证通过 + 报告与复盘联合提交；
  - 学生在「系统构建路径」领取后，Scaffold 只增量写入本层文件，不覆盖已有成果；
  - fill / debug 从 `scaffold/exercises/<lab>/<variant>/` 注入任务文件；
  - 每次发放写入基线 hash，并在 `.snapshots/<username>/<labId>/` 保存整树快照，供 `POST /fs/reset` 回到「刚领取」状态。

  文件状态由基线与当前 hash 比较得到：`A` 本层新增、`M` 已修改、`T` 变体待完成、`G` 生成文件、`!` 冲突/过期。

- **任务变体与个性化** 
  Lab2–Lab8 提供 fill（补全）与 debug（排错）变体。变体 manifest 写明替换文件、植入故障或留白、负向断言、提示阶梯与学习目标。教师下发 random 时，服务端为作用域内每名学生固化一个具体变体，学生级 assignment 覆盖班级/全局设置，避免浏览器刷新重抽。

- **期末探索任务** 
  Lab8 通过且命中已发布作用域后，服务端在 `/learning/access` 解锁期末节点。任务书含方向、机制要求、可选验证命令与评分维度；学生复用 Lab8 工作区继续实践。解锁事实来自服务端，不以页面点击代替完成证据。

### 3.4 可信执行、断言与诊断

本节描述一次可信运行如何从命令输入变成可审计的证据。核心原则是：运行由 Tutor Server 启动，行为断言在服务端计算，输出与 Trace 以文件制品落盘，任何下游 UI 都只消费同一份服务端结果。

**1. 为什么不能只看退出码**

QEMU 退出码为 0 只能说明进程正常结束，不能证明指定用户程序都执行、调度发生、输出次数正确或 Trace 存在。os-lab 因此把一次运行拆成“命令来源、进程退出、行为断言、运行制品”四个维度。

只有同时满足以下条件才设置 `verified=true`：

```text
trusted == true
exitCode == 0
assertions.length > 0
所有 assertion.passed == true
```

**2. 运行执行管线**

一次可信运行按以下顺序执行：

1. 校验 Lab，若传入自定义命令则先解析，否则使用该 Lab 的固定 recipe；
2. 先计算当前工作区版本，创建 `running` 状态运行记录并写入开始事件；
3. 通过 SSE 下发运行标识、可信标志和输出流，再逐步执行；
4. 每一步都由服务端直接启动可执行程序，不经过 shell；Cargo 的 JSON 输出实时解析，其他输出流式转发；
5. 任一步失败、用户停止或整体超时都会中断后续步骤并终止整个进程树；
6. 结束后从完整输出提取 Trace，对可信运行计算断言，把原始输出与 Trace 制品落盘，更新运行记录状态并写入完成事件。

Problems 面板、AI 导师和评价 Agent 之后都读取同一个运行标识下的断言、诊断与制品，不再各自解析终端文本。退出码 0 只说明最后一个 step 正常结束；如果没有可信 recipe、行为断言或 Trace，它不会进入学习评价。因此 `verified` 与“能运行”是两件事。

**3. 命令执行边界**

Tutor Server 不启动 shell，而是解析输入后直接调用：

```js
spawn(binary, argv, { cwd, env, windowsHide: true })
```

当前允许的可执行程序只有：

```text
cargo
make
qemu-system-riscv64
rustc
rustup
rust-objcopy
```

解析器拒绝分号、`&`、`|`、`<`、`>`、反引号、`$`、引号、重定向、命令替换和管道等 shell 语法。即使可执行程序在白名单中，学生自定义命令也只被标记为 `trusted=false`，不会生成实验通过断言。

其他执行约束：

- 每名用户同时最多一个活动运行；
- 整体运行超时 300 秒；
- 输出最多保留 262,144 个字符；
- 浏览器断开时终止子进程，避免遗留 QEMU；
- Cargo 命令自动补充 `--message-format=json`；
- 构建和 QEMU 都在当前学生工作区中执行。

命令解析按空白切分 token，不支持任何引号或转义；多行粘贴会按行拆成多个 step，仍归属同一次运行，但整次运行都被视为自定义命令。解析器拒绝 shell 元字符，因此不存在管道、重定向、子 shell 或命令替换。执行环境由服务端构造：构建产物目录固定到当前学生工作区，失效工具链按已知路径回退，最终可执行文件按完整路径解析，而不是把输入交给 shell。

**4. 可信 Recipe**

`tutor/run-recipes.mjs` 为 Lab1-Lab8 定义固定 recipe。Lab1-Lab5 主要通过 `cargo run`，Lab6-Lab8 先构建内核，再以 VirtIO `fs.img` 启动 QEMU。

| Lab | Recipe | 关键断言类型 |
| --- | --- | --- |
| Lab1 | `lab1.verify.v1` | 最小内核启动输出 |
| Lab2 | `lab2.verify-trace.v1` | 输出、次数、Trace 类型 |
| Lab3 | `lab3.verify.v1` | 用户程序、Yield 次数、全部退出 |
| Lab4 | `lab4.verify.v1` | 父子分支、fork、进程退出 |
| Lab5 | `lab5.verify.v1` | 文件读取、文件测试、pipe 回归 |
| Lab6 | `lab6.verify.v1` | VirtIO FS、link、mmap、spawn、stride、pipe |
| Lab7 | `lab7.verify.v1` | dup、signal、mask、pipe |
| Lab8 | `lab8.verify.v1` | thread、mutex、condvar、deadlock、pipe |

断言结果同时保存 `id`、`label`、`passed`、`expected`、`observed` 和针对失败现象的 `hint`。因此 Problems、测试结果、AI 导师和学习评价消费的是同一份服务端结果。

`run-recipes.mjs` 为每个 Lab 定义固定 recipe 和断言。断言目前有四种显式类型：`output-contains`（单段输出）、`output-contains-all`（多段输出全部出现）、`output-count-min`（至少出现 N 次）、`trace-type`（Trace 中至少出现某类事件）。失败提示直接指向常见实现错误，例如 Lab2 的 recipe 单独校验 `trap_enter` 与 `task_switch` 两类 Trace，防止只打印用户输出但没有真正进入 trap/切换的假通过。

**5. 运行记录与工作区版本**

每次运行开始前，服务端遍历源码和构建配置文件，按相对路径与内容计算 SHA-256，生成 `workspaceVersion`。`target`、平台目录和生成数据被排除，避免无关文件改变版本。

一次运行至少记录：

```text
runId
userId / labId / sessionId
recipeId
workspaceVersion
trusted
startedAt / finishedAt / durationMs
exitCode / verified
assertions
diagnostics
output hash / bytes / path
trace version / count / hash / path
```

`workspaceVersion` 只统计源码与构建清单（Rust 源码、清单、链接脚本等），排除构建产物、依赖目录和平台内部数据；目录按名称排序后逐文件计算 SHA-256。

运行记录、断言和诊断分别落库，并以同一运行标识关联；输出与 Trace 制品按用户和 Lab 归档，`output.log` 是完整原始输出，`trace.jsonl` 仅在存在合法事件时生成。历史与 Trace 读取都按账号归属过滤，跨账号访问不会返回数据。

**6. Cargo 诊断与 Problems **

服务端从 Cargo JSON 流中解析结构化诊断，保留级别、错误码、消息、文件、起止行列和渲染文本，并按 `runId` 存储。前端 Problems 面板只查询当前运行的诊断：

1. 点击诊断条目打开对应工作区文件；
2. Monaco 跳转到具体行；
3. 上报 `diagnostic_opened` 事件；
4. 导师可引用 `diag:` 证据，但不能捏造不存在的诊断。

服务端只消费 Cargo JSON 流中的 `compiler-message`，取主 span，剥除 ANSI 转义，并把 Windows 长路径或短路径恢复为工作区相对路径。最终每条诊断保存级别、错误码、消息、文件、起止行列和渲染文本，按账号归属取回。

**Trace 采集与完整性**

Trace 是可信运行产生的后端证据制品，不再是一项面向学生的前端可视化功能。服务端预设的 Lab2–Lab8 可信验证命令都会启用 `trace-edu`：

- Lab2 输出 `TRACE_V1`，记录 `trap_enter`、`task_switch`。
- Lab3–Lab8 使用扩展的 `TRACE_V2`，增加 `syscall`、`address_space`，并检查各实验对应的关键行为，例如地址空间创建、`clone/wait4`、`openat/pipe`、`mmap/spawn`、信号处理以及线程同步等。

运行过程中，服务端保留完整原始输出并保存为 `output.log`，同时从中提取合法的 `TRACE_V1`/`TRACE_V2` 机器帧。只有版本、事件类型及字段结构符合 Trace 契约的帧才会进入 `trace.jsonl`；格式错误的帧不会导致运行中断，但不会被计为有效证据，也不能满足 Trace 断言。

每次运行记录会保存 Trace 制品的路径、事件数量和 SHA-256。这里的“制品哈希”是根据文件完整内容计算出的固定长度摘要，用来确认之后读取的文件仍是运行结束时保存的那一份；它不是文件内容本身，也不是用于加密，而是用于发现文件被修改、替换或损坏。

通过 `GET /runs/:runId/trace` 获取 Trace 时，服务端会校验：

- `runId` 是否存在，且运行是否属于当前登录用户；
- 分页及事件序号范围参数是否合法；
- Trace 路径是否严格位于学生数据目录内，防止路径越界；
- Trace 文件是否超过 16 MiB 上限；
- 文件 SHA-256 是否与运行记录一致；
- 每行是否为合法 JSON，并符合 `trace-v1` 或 `trace-v2` 事件契约；
- 事件 `seq` 是否严格递增；
- 实际事件数量是否与运行记录中的 `trace.count` 一致。

任一完整性检查失败时，接口返回完整性错误，不把该 Trace 用作可信证据。只有使用服务端预设 recipe 的可信运行，并同时满足退出码、普通输出断言和实验要求的 Trace 断言，才会得到 `verified=true`。学生自行输入的自定义命令即使产生了 Trace，也只作为调试记录，不会被提升为可信通过结果。缺少真实 Trace 时返回空结果；若当前实验要求 Trace，相应断言会失败，系统不会生成预设事件或动画冒充运行轨迹。

学生终端的显示层会过滤 `TRACE_V1` 和 `TRACE_V2` 机器帧，避免调试协议污染普通程序输出，但这不会改变服务端保存的原始 `output.log`。当前学生端已移除 Trace 页签、时间线、播放和单步组件，也不再新增 `trace_inspected` 事件；服务端仍保留 Trace 接口、哈希校验、可信断言以及 Tutor/Assessment 的证据引用能力。历史记录中的 `trace:<runId>` 仍可关联到相应测试结果或终端运行，历史 `trace_inspected` 事件也继续兼容。

### 3.5 Tutor Agent：行为受约束的教学助手

![Tutor 对话链路](assets/agent-system-tutor-chat-final.png){width=92%}

`POST /chat` 的完整处理顺序如图：校验 Lab/会话/消息与证据引用 → 读取 Tutor 状态与证据摘要 → 意图识别与轮次规划 → **护栏先行** → 受限 RAG → 分层 Prompt → 模型调用（多重降级）→ 输出护栏 → 权威落库。几个关键设计：

**双轴路由：意图 × 回应模式。** 服务端用显式规则识别七类意图（`concept` / `code-reading` / `debug` / `verification` / `reflection` / `transfer` / `direct-answer`），同时独立决定四种首轮回应模式（`answer-first` / `definition-first` / `evidence-first` / `guardrail`）。两轴分离避免把"概念意图"等同于"先反问学生"："`fd` 是什么"是 `concept` + `definition-first`（先给定义）；"怎样证明任务切换真的发生"是 `verification` + `evidence-first`（先给最小验证动作）。旧的 UI 阶段（stage）路由保留为兼容模式，不再决定回答策略。

**提示按问题线程递进（L0–L4）。** 提示等级不是全局计数，而是按键 `(userId, sessionId, labId, topicKey) -> hintLevel` 保存；`topicKey` 由机制词、源码路径和诊断键生成。学生在 Trap 问题上用到 L3 后转问文件系统，新线程从 L0 重新开始——高等级辅助不会跨主题泄漏。等级与使用次数本身作为学习轨迹被记录，进入评价输入。

**护栏先于 RAG。** 消息命中"完整代码、最终答案、替我写完、可提交 patch"等模式时，服务端直接返回受限引导，**不检索、不向模型发送任何可能拼装完整答案的片段**。输出侧的护栏同样具体：引用必须属于证据白名单或本轮召回 chunk；代码 fence 超 12 行触发护栏；回复上限 4000 字符；不得声称执行过工具摘要中不存在的运行/诊断/Trace。

**1. 服务端权威的七类意图**

当前默认路由不再以 UI 阶段决定回答策略，而是根据本轮问题识别七类意图：

| 意图 | 目标动作 |
| --- | --- |
| `concept` | 解释当前机制，并要求学生给出自己的判断 |
| `code-reading` | 根据源码上下文梳理控制流或数据流 |
| `debug` | 承认已观察到的失败，要求形成可证伪假设 |
| `verification` | 定义可观察证据，给出最小验证步骤 |
| `reflection` | 把结论连接到证据，并追问限制 |
| `transfer` | 区分不变量和变化条件，要求迁移预测 |
| `direct-answer` | 触发答案护栏，拒绝交付可直接提交的完整实现 |

`turn-policy.mjs` 使用显式规则识别意图，并返回服务端权威的 `intent`、`responseMode`、`actions`、`gate`、`topicKey`、`hintLevel` 和可引用证据。UI 仍保存 `activeStage` 用于导航、历史会话和分析，但默认 `intent` 模式下阶段不会选择回答策略，也不直接增加学习评分。

旧的 stage 路由仍可通过兼容配置启用，主要用于历史会话回放和对照测试。

**2. 意图与首轮回应模式分离**

意图说明学生正在完成什么学习任务，`responseMode` 则说明回答的第一步应该怎么组织。当前有四种回应模式：

| 回应模式 | 触发与行为 |
| --- | --- |
| `answer-first` | 一般问题先回应当前问题，再追加至多一个引导动作 |
| `definition-first` | “X 是什么/有什么作用/怎么理解”先直接给出定义或作用，再补一个实验边界 |
| `evidence-first` | debug 或 verification 问题先回应现象或验证目标，再给一个最小证据动作 |
| `guardrail` | 完整实现请求先说明不能代写，但仍回答其中可以解释的机制问题 |

这种双轴设计避免把“概念意图”等同于“先反问学生”。例如“fd 是什么”仍属于 `concept`，但会进入 `definition-first`；“怎样证明 task switch 真的发生”属于 `verification`，进入 `evidence-first`。服务端将 `responseMode` 一并写入 Tutor 状态和 Prompt 框架，离线回退也为 fd、inode、sepc、sscratch、pipe、offset、satp 等常见定义提供直接回答。

**3. 按问题线程递进的 L0-L4 提示**

提示等级不是整场会话共用的全局计数。系统先从消息中的机制词、源码路径和诊断键生成稳定 `topicKey`，再按用户、会话、Lab、topic 保存提示状态：

```text
(userId, sessionId, labId, topicKey) -> hintLevel
```

学生在同一问题线程中继续请求提示时，等级最多递进到 L4；切换到不同机制或不同诊断后生成新的 `topicKey`，提示从该问题自己的状态开始。这样可以避免学生在 Trap 问题上用到 L3 后，转问文件系统时被错误地直接推到高等级答案。

**4. 答案护栏先于 RAG**

当消息命中“完整代码、最终答案、替我写完、可提交 patch”等直接答案请求时，服务端先执行护栏，再决定是否检索知识。默认回复要求学生提供局部代码、自己的判断或失败现象，不向模型发送可能用于拼装完整答案的检索片段。

顺序是：

```mermaid
flowchart LR
  Q[学生消息] --> I[意图与 topic 识别]
  I --> G{direct-answer?}
  G -->|是| R[记录 guardrail 并返回受限引导]
  G -->|否| E[汇总可信证据]
  E --> K[受限 RAG]
  K --> P[组装 Prompt]
  P --> M[模型或离线回退]
  M --> V[证据与引用白名单校验]
  V --> O[返回导师状态与回答]
```

**5. Prompt 分层组装**

服务端按层组装 Prompt，而不是把所有上下文拼成一段无边界文本：

1. 系统教学原则和答案边界；
2. 当前 Lab 的机制上下文；
3. 当前意图的回答策略；
4. 手册阅读选段；
5. 工作区代码、终端、诊断或测试附件；
6. 本轮服务端策略与可信证据摘要；
7. 经过权限过滤的知识块。

知识块使用带 `citation` 和 `contentClass` 的结构化边界包裹。模型只能引用本轮召回的 `kb:` 标识，以及当前用户拥有的 `run:`、`trace:`、`diag:` 证据。输出后服务端再次检查引用，不允许模型凭空声明“已运行”“已通过”或引用未召回材料。

### 3.6 知识库与混合 RAG

**1. 可追踪的知识生产链**

知识数据采用以下权威关系：

```text
Source -> Version -> Document -> Block -> Chunk -> FTS / Embedding
```

- Source 表示稳定来源；
- Version 由内容 hash 和版本号标识，历史版本不可就地覆盖；
- Document 保存规范化文本和原始定位信息；
- Block 保留章节结构；
- Chunk 不跨 `sectionPath` 合并，并携带权限、Lab 范围、概念、答案风险和可索引状态；
- FTS 与向量只是可重建派生索引，不改变 Source/Version/Chunk 的权威关系。

**2. 来源选择和内容规范化**

当前内置来源包括本项目 Lab 手册、Lab Package、OSTEP 章节、RISC-V 资料、课程讲义和 rCore 教程等。来源选择规则优先使用可哈希、可审计、文本层质量可靠的版本，并禁止学生 Tutor 索引答案、参考补丁和完整参考实现。

教师上传支持：

```text
PDF / EPUB / Markdown / TXT / DOCX
```

旧式二进制 `.doc` 因缺少稳定解析器被明确拒绝。上传文件先保存原件，再经过与内置来源相同的规范化、章节感知分块、质量过滤和审核流程；自动建议的 Lab 范围不会直接发布。

**3. 四类内容权限**

| 内容类 | Tutor 行为 |
| --- | --- |
| `student-safe` | 可检索并可按 citation 引用 |
| `guided-hint` | 可用于形成提示，但不能直接作为答案引用 |
| `teacher-only` | 学生 Tutor 不可访问 |
| `system-metadata` | 服务端控制器可用，不进入学生全文检索 |

教师上传默认进入 `teacher-only` 和待审核状态。教师必须确认范围、许可状态、内容类和风险后发布，才能改变 Tutor 可检索集合。

**4. SQLite FTS5 与短词检索**

知识库独立存储在：

```text
os-lab/learning/knowledge/knowledge.db
```

中文全文检索使用 FTS5 `trigram` tokenizer。长度不足三个 Unicode 字符的查询无法稳定形成 trigram，因此使用带同等权限、版本、active 和 scope 过滤的 `LIKE` 回退。检索不会因为换用短词路径而绕过权限条件。

当前数据库实测状态为：

| 指标 | 数量 |
| --- | ---: |
| Source | 8 |
| Version | 35 |
| Document | 1,129 |
| 历史 Chunk | 16,099 |
| 当前 active Chunk | 1,384 |
| 当前已索引 Chunk | 1,360 |
| 本地 embedding | 1,360 |

**5. 向量与混合排序**

默认向量提供者是确定性的离线模型：

```text
local-feature-hash-v1-384
```

它把中文 trigram、代码标识符和操作系统概念别名映射为 384 维向量，适合离线教学环境和可重复测试。也可以配置 OpenAI 兼容 `/embeddings` 服务；远程向量失败时降级为 FTS，并把降级原因写入检索诊断。

混合检索流程为：

```mermaid
flowchart LR
  Q[查询] --> L[FTS 或 LIKE 候选]
  Q --> E[Embedding]
  E --> C[余弦相似候选]
  L --> F[RRF 融合]
  C --> F
  F --> B[来源权威度与精确 Lab 小幅加权]
  B --> P[权限 当前版本 active indexable 再过滤]
  P --> R[最多 5 块 其中 global-only 最多 2 块]
```

RRF 让词法命中和语义相似可以互补，同时避免把两种分数直接粗暴归一化。最终权限过滤仍在融合后执行，排序算法不能提升越权内容。

### 3.7 Assessment Agent：规则基线与评分 Agent 的约束融合

**1. 事件和运行证据**

评价输入不是聊天次数或页面停留时长，而是结构化学习事件与运行记录。关键事件包括：

```text
student_message
code_open / code_save
run_started / run_finished
verification_attempt
diagnostic_opened
trace_inspected
hint_requested
guardrail_triggered
review_question_asked
review_answer_submitted
review_answer_evaluated
review_completed
review_reflection_assessed
report_submitted
```

事件带 `userId`、`sessionId`、`labId`、时间、阶段和可选 `runId`。运行断言、诊断和 Trace 通过引用接入评价，不把 AI 文本判断直接当成实验事实。

**2. 规则基线Rubric v3**

当前评价版本为 `rubric-v3.3.0`。规则基线由 6 个固定过程项和 3-5 个动态复盘题项组成：

| 维度 | 细项 | 含义 |
| --- | --- | --- |
| 过程 | `P2` | 用分析推进，而不是只索要答案 |
| 过程 | `J1` | 提出自己的判断 |
| 过程 | `E1` | 引用可检查证据 |
| 过程 | `H1` | 形成可证伪假设 |
| 过程 | `V1` | 完成可信验证 |
| 过程 | `I1` | 失败后修改并复验 |
| 收获与反思 | `RQ1-RQn` | 每道苏格拉底复盘主问题的完成表现，`n` 为 3-5 |

每个 `RQ` 项按同一条主问题链评分：首答完成为 2 分，经过一次追问后完成为 1 分，已经作答但仍可完善为 0 分。回答质量影响反思分，但不影响复盘完成、报告提交或下一 Lab 解锁。

规则基线和最终融合分为：

```text
ruleScore = round(process * 0.75 + reflection * 0.25)
total = round(ruleScore * 0.60 + agentScore * 0.40)  # Agent 成功评分时
total = ruleScore                                    # Agent 不可用或证据不足时
```

每次答案护栏事件从过程分扣 5 分，累计最多扣 25 分。该扣分不是惩罚使用 AI，而是约束持续索要可直接提交答案的行为。

没有观察到的项保持 `score=null`、`status=unobserved`。

**3. 过程评价如何形成**

- `J1` 在学生消息中寻找明确判断，并检查是否带因果或可观察后果；
- `E1` 检查学生是否提到源码、输出、诊断、Trace 或断言，并与真实工作台事件或可信 run 连接；
- `H1` 要求假设包含可以被实验区分的预测；
- `V1` 只有可信运行才能达到完整验证；
- `I1` 查找“可信失败 -> 保存修改 -> 后续可信通过”的时间顺序；
- `RQ1-RQn` 从服务端复盘评价事件中读取每道主问题的题面、首答、追问修正、评价与证据引用。

因此，单次最终通过和经过定位、修改、复验后通过，会形成不同的过程证据；复盘题也能区分首答完成、追问后完成和仍可完善三种表现。

**4. 评分 Agent 融合与可信验证边界**

`POST /assessment` 先计算可复现的规则基线，再把学生行为轨迹、规则细项、可信证据引用和逐题复盘表现交给独立评分 Agent。Agent 必须返回结构化分数、评价理由、优势、待改进点、评分依据及合法 `evidenceRefs`；伪造引用、结构不合法、模型不可用或证据不足时，接口明确返回 `fusion.mode = rule-only`，不会把降级结果伪装成 Agent 已参与。

评分请求只发送经过压缩和采样的行为时间线，同时保留轨迹首尾与关键证据，避免长会话挤占模型响应窗口。默认超时为 120 秒，可通过 `OS_LAB_ASSESSMENT_TIMEOUT_MS` 配置；超时会以 `status=timeout` 和“响应超时”单独展示，综合分明确回退到规则基线。该降级路径只保证评价可用性，不会伪造 Agent 分数。

可信运行和命名断言只证明学生完成了可核查验证。它们通过 `V1` 和 `I1` 进入过程分，不再单列“结果”维度，也不按某个 Lab 的断言数量重复加分。这样避免了旧 `R1-R4` 只覆盖 Lab2 输出、其他 Lab 无法对应的问题，并保持 Lab1-Lab8 的评分口径一致。

### 3.8 证据驱动的苏格拉底式复盘

![Assessment Agent 与 Tutor Agent 协同关系](assets/Assessment-Tutor.png){width=82%}

复盘要同时达到两个目标：问题必须**由证据驱动**（问在薄弱处，而不是随机抽题），过程必须**像教学**（学生面对的是连续、自然的引导，而不是一张考卷）。为此我们把复盘拆成三个正交问题，并按职责分离原则分配给两个 Agent：

- **测什么**（Assessment）：根据全过程行为证据识别薄弱概念、证据缺口和评价目标，产出**结构化复盘简报（brief）**，而不是完整题面。
- **怎么问**（Tutor）：利用日常答疑已有的分层 Prompt、受限 RAG、上下文构造与追问策略，把简报具象化为面向学生的苏格拉底问题，并动态追问。
- **怎么判**（Assessment）：独立读取复盘 transcript、可信运行和行为证据，逐题给出 verdict，更新反思分与掌握度。

这一分工避免了同一个 Agent 一边向学生提示答案、一边给自己的教学结果打分。完整协作链路为：

```
学生过程行为（事件 · 可信运行 · 对话 · 报告）
    ↓
Assessment Agent
证据分析、规则+Agent 融合评分、生成结构化复盘简报
    ↓ review brief（conceptId/objective/passCriteria/evidenceRefs/requiresRunEvidence + 种子题面）
Tutor Agent
以同一 Tutor 身份把简报转为面向学生的反问；verdict 未通过时生成一次有边界追问
    ↓ transcript（逐题作答、追问修正、评价事件）
Assessment Agent
独立逐题评价（verdict/缺失点/参考因果链），RQ 计分与掌握度更新
    ↓
报告与复盘联合提交 → 教师统一验收
```

复盘只有在当前实验存在 `trusted && verified` 的可信运行后才能开始。Assessment 根据规则评分与 Agent 判断生成 3–5 个结构化复盘目标，每题包含考查概念、评价目标、通过标准、证据引用及可信运行要求。模型不可用、超时或输出不符合契约时，系统会根据失败断言、证据匹配和历史概念频次生成确定性计划，保证复盘流程稳定可用。

Tutor 只负责教学表达，不接触或泄露内部评分标准。它根据复盘简报、近期答疑记录和受限知识库生成面向学生的问题，同时受到题目数量、问题标识、证据白名单、知识引用和历史题目去重等约束。Tutor 输出不合规时，系统自动回退到 Assessment 提供的种子题面。

学生作答后，由 Assessment 独立读取回答、复盘 transcript 和可信运行证据，给出 `passed`、`partial`、`needs-evidence`、`misconception` 或 `defer` 等结论，并记录具体缺失点、缺失证据和正确因果链。即使模型认为回答正确，只要题目要求可信运行而证据不足，服务端仍会强制降级为 `needs-evidence`，防止口头解释替代真实实验结果。

对于部分正确、存在误解或缺少证据的回答，Assessment 先生成追问目标，再由 Tutor 结合本次回答和评价反馈提出针对性追问。每个主问题最多追问一次，整次复盘最多 5 题，避免无边界循环。需要补充运行证据时可暂停并在完成可信运行后恢复；延期状态保留完整记录，但不生成虚假掌握证据，也不自动解锁下一实验。

复盘完成后，系统生成结构化评价事件，并按“首答完成、追问后完成、仍需完善”形成分层计分，更新反思维度和概念掌握度。问题去重同时作用于 Assessment 的计划层和 Tutor 的题面层，因此不同复盘可以继续关注同一薄弱概念，但会改变题型、情境或引用证据，避免退化为固定题库。

### 3.9 数据持久化与运行保障

**1. 存储划分**

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| 学生源码 | `student-labs/<username>/` | 每名学生独立工作区 |
| Lab 快照 | `student-labs/.snapshots/...` | 发放后的完整重置点 |
| 账号和学习主库 | `learning/os-lab.db` | 用户、会话、run、断言、事件、评价、复核、报告索引 |
| 学生大制品 | `learning/student-data/<userId>/` | output、trace、对话、报告和附件 |
| 知识库 | `learning/knowledge/knowledge.db` | Source/Version/Document/Chunk/FTS/Embedding/审计 |
| 教师发布配置 | `scaffold/teacher.json` | 全局、班级、学生开放范围和任务配置 |
| 教师上传 | `learning/uploads/` | 材料、知识源等原文件 |

**2. 账号和会话**

`learning/db.mjs` 使用随机 16 字节 salt 和 `scryptSync` 生成 32 字节密码 hash，比较时使用 `timingSafeEqual`。登录成功后生成随机 UUID token，会话有效期为 30 天；过期 token 在解析时删除。

注册入口只创建学生账号，并要求从教师已创建的班级中选择。

首次启动会创建 `admin/admin123` 教师账号，部署后请修改默认密码。

**3. 服务端安全控制**

- Tutor Server 默认监听本机地址，远程部署应置于 TLS 反向代理之后；
- `OS_LAB_TUTOR_ORIGIN` 应配置明确前端来源；
- `/teacher/`、学生评价、报告和工作区接口均进行会话/角色校验；
- 文件路径解析防止绝对路径和目录逃逸；
- 运行通道没有 shell，命令和输出均有限制；
- API Key 不应写入仓库、前端包、日志或分析导出；
- 运行、Trace、报告附件和知识文件按用户或角色检查归属；
- 匿名分析默认移除用户名、班级、消息正文、报告正文、命令、文件路径和原始时间戳。

**4. 在线备份与离线恢复**

学习主库在线备份使用 Node SQLite backup API，而不是直接复制正在写入的数据库。备份流程：

1. 对源库执行 `PRAGMA integrity_check`；
2. 创建一致性 SQLite 快照；
3. 对备份再次执行完整性检查；
4. 生成 manifest，记录 SHA-256、schema migration 和关键表行数；
5. 返回备份数据库和 manifest 路径。

恢复必须在 Tutor Server 停止后执行，并显式传入 `allowOverwrite: true`。工具先校验 manifest hash 和数据库完整性，再把旧库移动为 `.pre-restore-*.bak`，最后安装新库并再次检查。恢复后应运行 Node 测试、smoke、站点构建，并抽查账号、run、assessment 和 review 历史。

恢复函数不会暴露为在线覆盖数据库的普通 API，这是防止在数据库仍被服务使用时破坏一致性的有意限制。



## 4. 开发计划与版本更迭

- **总体开发路线**

初赛版本主要完成参考练习验证、Lab1-Lab5 教学内核和静态 VitePress 手册。当前版本在保留这条内核主线的基础上，主要计划了三方面扩展：

1. **内核能力扩展**：由 Lab1-Lab5 推进到 Lab1-Lab8，补齐 VirtIO 磁盘、easy-fs、信号、线程、阻塞同步和死锁检测等知识与实验；
2. **教学平台扩展**：由静态手册推进到双端教学/学习区、账号控制、可信运行、诊断、Trace、报告和期末任务；
3. **智能教学扩展**：由开发过程中的 AI 协作记录推进到受策略、证据、RAG 权限和统一教师验收约束的 Tutor Agent、Assessment Agent与融合评价系统，扩展对学生学习过程的辅助多样性与学习效果的评价多元性。

基于以上优化扩展方向，项目开发采用“冻结契约——并行实现——真实链路收口”的路线：

1. **内核与 Lab 基础**：完成 Lab1-Lab8 的渐进式 feature、组件职责、用户态测试和 QEMU 运行路径。
2. **工作区与可信执行**：完成基础前端搭建，账号、学生隔离目录、Scaffold、受控命令、recipe、断言、诊断、Trace 和运行制品。
3. **Tutor 与知识库**：完成服务端意图、答案护栏、提示等级、证据引用、知识来源、权限过滤和混合检索。
4. **评价与复盘**：完成 Rubric v3、行为评分 Agent、Assessment 复盘计划、逐题评价、复盘数据库和报告联合提交。
5. **教师验收与进阶**：完成报告/复盘联合队列、教师最终分和验收建议、审计记录以及下一 Lab 服务端门控。
6. **回归与交付**：完成 Node、Rust、Python、Tutor Harness、Assessment Harness、QEMU、Smoke、生产构建和文档交付。

- **重点版本更迭概览**

| 阶段 | 进展 | 升级优化 |
| --- | --- | --- |
| M1 | Lab Package 与渐进式内核 | Lab1-Lab8 基础文档编写、feature 链、构建和基础 QEMU 路径一致 |
| M2 | 工作台升级与可信验证 | 增加账号、隔离源码、Monaco、xterm、Problems和快照；增加 recipe、命名断言、事件和证据引用 |
| M3 | Tutor、RAG 与证据链 | 意图、护栏、知识权限、证据引用和服务端事件通过 Harness |
| M4 | 规则评价与Assessment Agent | 规则基线兜底解释；Assessment Agent 结合学生行为证据进行评分 |
| M5 | 苏格拉底复盘升级 | 由 Assessment 辅助 Tutor 进行个性化复盘反问；报告、附件和复盘 transcript 同步可见 |
| M6 | 教师验收与教学调整 | 教师统一验收可读证据并最终评价，基于历史支持灵活调整教学内容与节奏 |
| M7 | 全量回归与文档 | 自动测试、Smoke、全流程测试和实验文档 |

注：每阶段修改均以机器可读契约作为接口边界，以测试 fixture 和真实 HTTP/SQLite Smoke 作为验收依据。文档以源码、`lab.yaml`、数据库统计和实际测试结果为事实来源。新增功能同步更新对应测试、过程文档和总体文档，避免手册、Scaffold、Prompt、验证命令和前端显示各自漂移。

## 5. 系统测试情况（最后测试改）

### 5.1 **分层测试策略**

| 层次 | 验证内容 |
| --- | --- |
| Rust host tests | 页帧、页表、文件抽象、信号、等待队列、mutex、semaphore、condvar 等纯逻辑 |
| Node unit/contract tests | 运行 recipe、断言、诊断、Trace、Tutor 策略、RAG、评价、复核、数据库、Factory |
| Python tests | 文档规范化、章节分块、质量过滤、Lab 知识投影 |
| Tutor harness | 答案泄漏、证据门控、错误假设、冲突、长上下文和引用准确性 |
| Smoke tests | Tutor Server 登录、接口、工作区和关键业务链 |
| QEMU tests | RISC-V 内核、用户程序、VirtIO 磁盘和各 Lab 行为断言 |
| VitePress build | 内容同步、Vue 编译、依赖解析和静态站点生成 |

### 5.2 **最新复核测试结果**

| 检查 | 结果 |
| --- | --- |
| Handbook/Tutor/Learning Node tests | 144/144 通过 |
| 8 个组件 crate 的 host Rust tests | 42/42 通过 |
| VitePress production build | 通过 |
| Python knowledge tests | 32/32 通过 |
| Tutor Harness | 34 个用例通过；答案泄漏率 0，问题相关性、引导动作、证据引用、阶段不变性均为 1.0 |
| Assessment Harness | 5 个用例通过；计划有效性、题目新颖性、叙事中立性、判定准确性和可行动反馈率均为 1.0 |
| Lab1 QEMU 可信验证 | 2/2 行为断言通过；裸机启动、内核入口与 QEMU 运行标识均通过 |
| Lab2 QEMU 可信验证 | 6/6 行为断言通过；28 条 `trap_enter`、6 条 `task_switch` |
| Lab3 QEMU 可信验证 | 3/3 行为断言通过；幂运算自检、5 轮 `Yield round` 与全部用户程序退出均通过 |
| Lab4 QEMU 可信验证 | 4/4 行为断言通过；父子进程、`fork_test` 与全部进程退出均通过 |
| Lab5 QEMU 可信验证 | 4/4 行为断言通过；内嵌文件、文件系统、管道与全部进程退出均通过 |
| Lab6 QEMU 可信验证 | 8/8 行为断言通过；VirtIO 文件、硬链接、`mmap`、`spawn`、stride、文件系统、管道与全部进程退出均通过 |
| Lab7 QEMU 可信验证 | 4/4 行为断言通过；`dup`、信号、信号屏蔽与管道均通过 |
| Lab8 QEMU 可信验证 | 8/8 行为断言通过；线程、mutex、condvar、pipe、两类死锁检测均通过 |

本轮自动/契约测试合计 `218/218`（144 Node + 42 Rust + 32 Python）通过。QEMU 断言不计入该数，单独记录为 14 项端到端行为证据。知识库当前包含 8 个来源、35 个版本、1129 个文档、16099 个历史 Chunk，其中 1384 个活跃、1360 个已索引且具有 384 维本地确定性向量；这些数量会随重新摄取、发布和回滚变化。

### 5.3 Prompt Eval 实验结果与分析

Prompt Eval 用于检验 AI 导师在“学生提问意图识别、引导动作、答案护栏、证据引用、跨阶段稳定性”上的表现，而不是只检查回复是否包含某个阶段关键词。实验覆盖 V2 阶段路由口径与 V3 意图路由口径，并分别对“有/无阶段 Prompt”和“完整意图策略/无意图基线”进行对比。

**实验目标与对比口径**

- V2 阶段路由口径：使用 Lab/stage 构造的 48 条历史语料，对比“有阶段 Prompt”与“无阶段 Prompt”。
- V3 意图路由口径：使用 19 条意图语料，对比“完整意图策略”与“移除意图策略层、保留 system/Lab/证据/RAG 的基线”。
- V3 语料覆盖 Lab1-Lab8 和七类本轮意图：`concept`、`code-reading`、`debug`、`verification`、`reflection`、`transfer`、`direct-answer`；同时包含错误假设、直接索要补丁、换题、无证据、可信通过证据、学生说法与失败运行冲突等场景。

**实验配置**

| 运行            | 语料               | 模式    | 模型                                    | 有效条数                         | 用途                              |
| --------------- | ------------------ | ------- | --------------------------------------- | -------------------------------- | --------------------------------- |
| V2 历史真实 A/B | legacy-stage 48 条 | remote  | gpt-5.6-luna                            | 45 条 remote，3 条 offline       | 阶段 Prompt 与无阶段 Prompt 对比  |
| V3 离线链路     | cases-v3 19 条     | offline | qwen2.5:7b（回复为 offline-tutor 兜底） | 19 条                            | 验证意图路由、RAG、护栏与降级链路 |
| V3 真实模型     | cases-v3 19 条     | remote  | gpt-5.6-luna                            | 18 条 remote，1 条由答案护栏拦截 | 完整意图策略与无意图基线对比      |

V3 单条综合分为六项等权平均：`questionRelevance`、`guidanceCorrectness`、`necessaryExplanation`、`actionability`、`noLeak`、`evidenceFidelity`。问号数量、回复长度和代码行数只作为诊断项，不参与主分。

**V3 真实模型结果**

数据源：`os-lab/tutor/prompt-eval/records/current-intent-remote-gpt56-retry-final-rescored/`，模型 `gpt-5.6-luna`，温度 0.3，19 条用例。

| 指标     | 完整意图策略 | 无意图基线 |
| -------- | ------------ | ---------- |
| 综合     | 96           | 95         |
| 引导正确 | 79           | 74         |

基线综合分按同一 V3 规则对冻结回复重算，其余指标两侧相同，不再逐一列出。`questionRelevance=100` 表示 19 条均识别为期望本轮意图；三组同题跨阶段用例的 `intent + actions + guardrail class` 全部一致，说明存储阶段没有重新参与回答策略。

![V3 真实模型评测主指标与逐用例消融差值](../../../Users/Jane%2520Aurora/Documents/xwechat_files/wxid_jrytn992mh3112_d069/msg/file/2026-08/assets/prompt-eval-v3-results.png){width=96%}

图中 (a) 为完整意图策略与无意图基线存在差值的 V3 主指标，(b) 为非零逐用例综合分差值；其余 15 条持平，完整策略更好 3 条，基线更好 1 条。

**消融结果**

完整意图策略与无意图基线在 19 条用例上的综合分差值为：平均 +0.84，完整策略更好 3 条、持平 15 条、基线更好 1 条。

非零差值用例：

| 用例                 | 完整策略 | 基线 | 差值 |
| -------------------- | -------- | ---- | ---- |
| concept-sepc-debug   | 92       | 75   | +17  |
| debug-panic-transfer | 100      | 92   | +8   |
| transfer-multicore   | 100      | 92   | +8   |
| concept-sepc-reflect | 75       | 92   | -17  |

按意图汇总：

| 意图     | 用例数 | 完整策略综合 | 无意图基线综合 |
| -------- | ------ | ------------ | -------------- |
| debug    | 4      | 94           | 92             |
| transfer | 1      | 100          | 92             |

其余五类意图持平，不再列出。完整策略的优势集中在 `concept-sepc-debug`、`debug-panic-transfer` 和 `transfer-multicore`，主要体现在调试/迁移类问题上给出更明确的引导动作；唯一负向的 `concept-sepc-reflect` 为单条采样差异，不影响整体正向结论。

**V3 离线链路结果**

数据源：`os-lab/tutor/prompt-eval/records/current-intent-offline-2026-08-10/`。

| 综合 | 问题相关 | 引导正确 | 无泄漏（原始评分） |
| ---- | -------- | -------- | ------------------ |
| 94   | 79       | 87       | 95                 |

![V3 离线链路关键分项](../../../Users/Jane%2520Aurora/Documents/xwechat_files/wxid_jrytn992mh3112_d069/msg/file/2026-08/assets/prompt-eval-v3-offline.png){width=82%}

图中仅展示综合、问题相关、引导正确和无泄漏原始评分四个关键分项；其余分项均为 100。

其余达标项均为 100，不再重复列出。离线结果完整验证意图路由、RAG、护栏与降级链路；无泄漏 95 为原始评分口径下的保守标记，经人工核对并修正规则后为 100，不构成真实泄漏。

**V2 历史阶段 Prompt 对照**

数据源：`os-lab/tutor/prompt-eval/records/remote-stu/`，48 条 legacy-stage 语料，真实模型 `gpt-5.6-luna`。

| 统计项                     | 全部 48 条     | 仅 remote 45 条 |
| -------------------------- | -------------- | --------------- |
| 平均差值（有阶段减无阶段） | +5.08          | +5.56           |
| 95% CI                     | -0.81 .. 11.48 | -0.60 .. 12.11  |
| 有阶段更好                 | 17             | 16              |
| 持平                       | 18             | 17              |
| 无阶段更好                 | 13             | 12              |

逐项检查（remote 45 条）：

| 检查项                 | 有阶段更好 | 无阶段更好 |
| ---------------------- | ---------- | ---------- |
| 提问质量 questionScore | 7          | 10         |
| 长度 lengthScore       | 10         | 7          |
| 阶段贴合 stageScore    | 11         | 1          |

![V2 历史阶段 Prompt A/B 对照](../../../Users/Jane%2520Aurora/Documents/xwechat_files/wxid_jrytn992mh3112_d069/msg/file/2026-08/assets/prompt-eval-v2-ablation.png){width=96%}

图中 (a) 为 48 条和仅 remote 45 条的正/平/负分布，(b) 为逐检查项有/无阶段更好的条数；无泄漏两侧均为 0，未绘制。

无泄漏两侧均为 0 条差异，不再列入。历史 V2 对照的 95% CI 跨 0，说明阶段关键词本身不能稳定提升真实教学表现；V3 改为直接检查是否回应当前问题、是否采取正确引导、是否泄漏答案、是否忠实使用证据、是否不受存储阶段干扰，评测口径更贴近真实教学质量。

**实验结论与优势**

1. 意图路由在真实模型上表现稳定：19 条全部识别为期望本轮意图，三组跨阶段同题 100% 保持同一回复类别，说明存储阶段不会干扰回答策略。
2. 安全与证据边界达标：完整策略无答案泄漏 100、证据忠实 100，直接索要补丁由护栏拦截，未向模型发送可拼装完整答案的内容。
3. 核心质量指标整体优秀：综合 96，问题相关、必要解释、无泄漏、证据忠实均 100，可执行 95。
4. 意图策略层带来正向收益：debug 综合 94（基线 92）、transfer 综合 100（基线 92），非零差值中 3 条正向、15 条持平，整体平均 +0.84。
5. 离线链路稳定可用：19 条全链路跑通，综合 94，必要解释、可执行、证据忠实和跨阶段一致均为 100，可用于上游不可用时的降级兜底。

## 6. 未来优化方向

1. **深化内核机制**

当前实现优先保证教学过程清晰、核心路径可运行，部分机制采用了简化模型；下一阶段可逐步补充 COW、文件映射、持久化元数据和崩溃一致性，使各实验模块从相对独立的功能验证进一步形成完整、连续的系统语义。

在此基础上，资源管理可由固定容量走向可配置和动态分配，并完善资源耗尽时的错误处理与回收机制；线程、同步和死锁检测则可从单核、有限对象的教学模型扩展到更通用的对象生命周期和多核调度，更好实现和推动学生的个性化学习。

2. **扩展验证与落地观测**

后续验证应从关键事件扩展到覆盖内存、进程、文件系统和并发机制的统一观测体系，并加强跨模块行为关联，在提升可解释性的同时控制观测开销。

当前学习效果证据主要来自项目设置 Harness 工程与有限人工流程试用。为真正实现教学环境的投入使用，后续应开展匿名化的多班级真人对照实验，预注册指标并报告样本量、效应量和失败案例，进一步完善工程缺陷并持续观测落地效果。

3. **提升平台部署与执行安全**

平台部署方面，由当前单机受控模式逐步演进为标准化、隔离化和可扩展的运行环境，完善计算资源限制、数据隔离、任务调度、运行监控与异常恢复，满足公开部署和多班级并发使用的需要。

执行能力应继续遵循最小权限原则，在可靠隔离和角色授权基础上逐步增强交互式调试能力。同时完善统一开发环境、服务部署、健康检查和数据恢复方案，并将 Lab Factory 已具备的质量校验、审批、发布与回滚能力更完整地整合到教师工作台中。

## 7. 分工与协作

### **7.1 团队分工与协作**


| 成员 | 主要分工 |
| --- | --- |
| **AM-SuSh** | 负责系统总体集成和服务端证据链建设：<br />推进渐进式内核与学生工作区联调；<br />完成可信验证、Cargo 诊断、用户隔离和学生学习数据持久化；<br />建设版本化知识库、中文 FTS、向量混合检索，搭建教师知识工作台；<br />构建 Tutor Agent及Assessment Agent，实现引导式教学、证据驱动评价、复盘逻辑优化等平台闭环。 |
| **SIZN** | 负责教学 IDE 和教师端主要交互：<br />实现学生端 Monaco/xterm 工作区与相关功能、教师端教学服务功能设计与构建；<br />完善双端交互逻辑与流程性能优化；<br />参与编写Lab Tutor Prompt、标准示例、技术文档等并进行 Prompt 评测。 |
| **RnTs1002** | 负责教学内容标准化和实验任务设计：<br />建立 Lab Package 样板、概念规格、检查点、量规与 OPRE/知识路径材料；<br />系统重写和校准 Lab1-Lab8 实验手册及基础教学设计；<br />重点迁移实验代码到真实内核实现文件，同步 Scaffold、上下文和前端文件列表并进行人工测评。 |

**协作更新记录**

团队成员的协作更新记录文档请见：[progress文档](./progress.md)

团队成员的仓库commit协作记录完整请见：[Commits · AM-SuSh/Or2-1-OS](https://github.com/AM-SuSh/Or2-1-OS/commits/main/)

### 7.2 AI协作说明

- 使用工具

| 工具                        | 用途                                               |
| --------------------------- | -------------------------------------------------- |
| Cursor IDE Agent / Composer | 多文件编辑、代码解释、文档重构、验证命令编排       |
| ChatGPT / Claude 等通用模型 | 概念问答、算法结构讨论、错误原因分析、文档措辞参考 |

未将 API 密钥、账号信息、私有对话原文提交到仓库。

- 协作说明

| **环节**             | **AI 参与协作**                                              | **团队成员把关**                                             |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 需求与架构设计       | 根据多轮对话整理需求，将“过程答疑、行为评分、苏格拉底复盘”等设想转化为 Tutor、Assessment、事件系统和可信运行之间的职责边界 | 确定教学目标和产品取舍，例如明确 Assessment 负责证据评分、Tutor 负责提问引导 |
| Agent 协作设计       | 实施设计并补充 Prompt、RAG、证据白名单、降级与追问边界       | 设计 Assessment 生成复盘简报、Tutor 具象化问题、Assessment 独立评价的闭环 |
| 操作系统代码与概念   | 辅助理解 trap、虚拟内存、进程、文件系统、信号和线程同步等机制，分析 Rust、汇编、位运算及编译诊断 | 结合实验目标、源码和 OSTEP 等资料确认机制解释与实现方向，编写实验手册 |
| Lab 初始化与运行排障 | 追踪脚手架同步、工作区初始化、Lab 发放状态、运行 recipe 和前后端接口，定位 Lab3 等阶段出现的初始化或状态问题 | 提供真实操作路径和异常现象，并在实际学生工作区中确认修复结果 |
| 行为证据与评分       | 将运行、诊断、代码保存、复验和复盘记录组织为可审计证据链；修复人工核查发现的缺口 | 设计与审查评分规则是否符合教学意图，指出正常操作只能获得部分分等契约缺口 |
| 测试与质量验证       | 补充单元测试和 smoke 流程，覆盖伪造事件拒绝、Trace 归属与完整性、失败后复验、Agent 降级及评分结果，并执行构建检查 | 关注测试是否对应真实学习行为，必要时进行 QEMU 和完整 Lab 流程验收 |
| 文档与论文整理       | 协助统一技术文档、参考文献、流程说明和图表结构               | 确定研究叙事、教学定位、引用范围；检索和整理相关论文，归纳核心思想与项目启发 |
| Handbook 维护        | 检查删除或调整 Markdown 后产生的断链、导航残留和接口引用错误，删除指向失效内容的入口 | 决定哪些教学内容应保留或删除，避免 AI 擅自改变课程材料       |
| 版本与发布           | 精确控制提交范围，通过隔离工作树只挑选必要代码，运行测试和生产构建后推送 GitHub | 决定发布内容；未授权的 Markdown、PPT、DOCX、PDF 等材料不进入提交 |

### 7.3 非本队来源说明

**1. 参考、依赖与对比来源**

| 来源                                              | 当前用途                                                |
| ------------------------------------------------- | ------------------------------------------------------- |
| `tg-rcore-tutorial`                               | 赛题 30% 参考练习基线                                   |
| `tg-rcore-tutorial-easy-fs`                       | Lab6–Lab8 磁盘文件系统依赖                              |
| rCore Tutorial、LearningOS 课程讲义               | 架构设计、实验路径对比和 Tutor 知识来源                 |
| MIT 6.S081 / xv6-riscv                            | 框架对比                                                |
| OSTEP、CSAPP、RISC-V Reader                       | 概念学习、实验手册背景和受限 RAG 知识来源               |
| 相关学术论文                                      | AI Tutor、学习评价、RAG、可信证据和苏格拉底教学设计参考 |
| OpenSBI、QEMU、Rust 工具链及 Cargo crates         | 编译、启动、硬件模拟和运行依赖                          |
| VitePress、Vue、Monaco、xterm、Mermaid、Lucide 等 | Web 学习手册、代码编辑器、终端和图表呈现                |
| 外部大模型服务                                    | Tutor、Assessment、知识检索和评价的可选推理能力         |

**2. 团队自研范围**

本队自研内容主要包括：

- `os-lab/` 中除明确第三方依赖外的 RISC-V 教学内核、组件 crate、用户态程序及 Lab1–Lab8 渐进式实现；
- Lab1–Lab8 实验手册、习题与答案、概念目录、检查点、调试/填空变体、发布规格及教师验收流程；
- 学生隔离工作区、实验发放与初始化脚手架、代码编辑器、终端、诊断、实验报告和教师管理功能；
- Tutor Agent、Assessment Agent、受限 RAG、行为事件、可信运行、Trace、评分 Rubric、苏格拉底复盘和掌握度更新机制；
- host 单元测试、QEMU 验证 recipe、Trace 断言、Node/Python 测试、Tutor smoke 测试及 CI 配置；
- 系统架构、实验设计、AI 协作记录、对比分析、部署恢复说明和答辩材料；
- 团队自行制作并确认来源的界面截图、录屏、流程图和演示素材。

**3. 许可、数据与发布边界**

本仓库属于多许可证项目：

- 本队独立编写的源码采用 BSD-3-Clause；
- 本队原创技术文档采用 CC BY-SA 4.0；
- `reference-patches/` 及其他源自 `tg-rcore-tutorial` 的派生内容遵循上游 GPLv3；
- 链接 `tg-rcore-tutorial-easy-fs` 后形成的内核组合制品按 GPL-3.0 要求分发；
- 其他第三方依赖继续保留各自许可证和版权归属，不因进入构建链而变成本队自研成果。

`reference/`、`target/`、QEMU 输出、临时日志、知识库构建缓存、学生工作区、账号数据库、报告附件和 API Key 不作为正式源码提交内容。AI 生成的代码、题目、评价和文档草稿只有经过人工审查、证据校验和自动化测试后才能进入仓库或教学流程。

## 8. 提交仓库目录和文件描述（改）

### 8.1 仓库目录总览

| 目录 | 内容与职责 |
| --- | --- |
| `os-lab/kernel/` | 内核入口、Trap、调度、内存、进程、文件、信号、同步 |
| `os-lab/user/` | 用户态运行库、syscall 封装和 Lab 验证程序 |
| `os-lab/os-*` | SBI、上下文、系统调用 ABI、分配器、虚存、文件、信号、同步组件 |
| `os-lab/labs/` | Lab1-Lab8 学生手册与教师答案材料 |
| `os-lab/lab-packages/` | `lab.yaml`、概念规格、任务变体、可信验证和发布目录 |
| `os-lab/scaffold/` | 学生初始工作区、fill/debug/remedial 变体和教师配置 |
| `os-lab/handbook/` | VitePress 前端、Vue 组件、Tutor Server、前端测试和运行入口 |
| `os-lab/tutor/` | 运行 recipe、Tutor 状态、轮次策略、证据契约和 Prompt 评测 |
| `os-lab/learning/` | 账号、学习数据库、复盘、评价、掌握画像、教师验收和知识库 |
| `os-lab/docs/` | 架构、AI、部署、验收和过程记录 |

### 8.2 关键入口与提交说明

提交时应保留源码、Lab Package、Scaffold、handbook、Tutor、Learning、测试、CI 和文档；`node_modules`、构建产物、真实学生数据、知识库缓存和临时渲染产物不作为普通源码资产分发。总体技术文档以 `EVOLVE总体实验技术文档.md` 为可编辑源，Word 版由 `scripts/build_evolve_documents.py` 生成。


以下文件是本文主要事实来源，后续维护文档时应优先核对：

| 主题 | 源码或规格入口 |
| --- | --- |
| Cargo Workspace 与 feature 链 | `os-lab/Cargo.toml`、`os-lab/kernel/Cargo.toml` |
| 启动与初始化 | `kernel/src/entry.asm`、`kernel/src/main.rs` |
| Trap 与 syscall 分派 | `kernel/src/trap.rs`、`os-context/src/lib.rs`、`os-context/src/trap.asm` |
| 任务调度 | `kernel/src/task.rs` |
| 内存与 Sv39 | `kernel/src/mm.rs`、`os-alloc/src/lib.rs`、`os-vm/src/lib.rs` |
| 进程 | `kernel/src/process.rs` |
| 文件与 VirtIO | `kernel/src/fs/embedded.rs`、`kernel/src/fs/disk.rs`、`kernel/src/virtio_block.rs` |
| 信号 | `kernel/src/signal.rs`、`os-signal/src/lib.rs` |
| 线程与同步 | `kernel/src/processor.rs`、`kernel/src/sync_syscall.rs`、`kernel/src/deadlock.rs`、`os-sync/src/` |
| 用户态 ABI 和测试 | `user/src/syscall.rs`、`user/src/bin/` |
| 学生主工作台 | `handbook/.vitepress/theme/components/LabWorkspace.vue` |
| Tutor Server | `handbook/tutor-server.mjs` |
| 可信 recipe | `tutor/run-recipes.mjs` |
| Tutor 意图与提示策略 | `tutor/turn-policy.mjs` |
| 证据与 Trace 契约 | `tutor/contracts.mjs`、`tutor/trace-store.mjs` |
| 账号和学习数据 | `learning/db.mjs`、`learning/student-data-store.mjs` |
| Rubric 与掌握画像 | `learning/rubric-v3.mjs`、`learning/mastery.mjs` |
| 异常评价门控与统一教师验收 | `learning/review-gates.mjs`、`learning/db.mjs`、`handbook/.vitepress/theme/components/TeacherReview.vue` |
| 知识库 | `learning/knowledge/knowledge-store.mjs`、`hybrid-retriever.mjs`、`knowledge-schema.sql` |
| Lab 规格与发布 | `lab-packages/labN/lab.yaml`、`lab-packages/published.json` |
| CI | `.github/workflows/os-lab-ci.yml` |

配套技术说明可继续参考：

- `os-lab/docs/architecture.md`
- `os-lab/docs/agent-system-technical.md`
- `os-lab/docs/ai-tutor-stage-guide.md`
- `os-lab/docs/deployment-and-recovery.md`
- `os-lab/handbook/docs/workbench-ui.md`
- `os-lab/learning/knowledge/README.md`
- `os-lab/lab-packages/README.md`

## 9. 比赛收获

**AM-SuSh**:

这次比赛对我而言，不只是一次项目开发经历，更是一次把操作系统、AI 与教学场景真正结合起来的实践。作为组长，我主要负责系统总体集成和服务端证据链建设，需要将渐进式内核、学生工作区、知识库、Tutor Agent 和 Assessment Agent 等模块连接起来。起初这些内容更像分散的功能点，但随着项目推进，我逐渐认识到，真正有价值的不是功能数量，而是能否形成从学生实践、运行验证、智能辅导到学习评价的完整闭环。

团队协作也让我对工程分工有了更深的理解。队友分别聚焦前端交互和教学内容，我则需要保证不同模块之间的契约一致、数据能够贯通、结果可以复现。很多问题并不出现在单个功能内部，而是发生在内核、服务端、前端和实验材料的连接处。因此，我学会了从整体视角审视系统，同时把握好每位成员的专业边界，通过统一接口、测试和文档降低协作成本。与 AI 协作的过程同样如此：AI 可以提高开发和分析效率，但关键判断仍需要人去验证、修正和负责。这次比赛最终提升的，不只是我的编码能力，更是我统筹复杂系统、坚持证据意识、协调团队协作并推动方案真正落地的能力。

最后，我们希望打造 EVOLVE，它不只是一个帮助学生完成实验的平台，更是一个鼓励学生主动观察、独立思考、勇于验证的学习环境。学生获得的不应只有“运行成功”的结果，还应真正理解自己看到了什么、为什么作出判断；教师看到的也不应只是一份最终代码，而应是学生探索和成长的完整过程。我们会拿出百分的认真和负责继续优化，争取EVOLVE 得到更多认可与真正落地实现。

**SIZN**:

这次参赛，我负责教学 IDE 和教师端的主要交互：学生端围绕 Monaco 与 xterm 搭建在线工作区，把手册、编辑、终端、Problems 和测试结果串成一条可回跳的证据链路；教师端则实现班级注册与实验开放、快照重置、随机任务分发、名单导出和批量下发等教学服务。两端的交互逻辑与流程性能由我持续收口，另外还参与编写 Lab Tutor Prompt、标准示例与技术文档，并用一组评测语料反复检验 AI 辅导的回复质量。

整个比赛过程中，我最大的体会是测试演示和实际投入使用之间隔着很多细节。窄屏布局、多终端状态、教师改分留痕、证据定位，单看都不复杂，但组合在一起就要求每个环节都稳定可预期。为了让学生把注意力放在内核原理上，我们把大量时间花在看不见的地方，比如面板行为、异常兜底和反馈路径，而不是前端功能表面。

和队友协作的过程也让我收获不少。前端交互、服务端逻辑、实验内容与 AI 辅导彼此耦合，改一处常要牵动多处，方案只能靠反复讨论和验证来收敛。这段经历也让我更清楚自己擅长什么、需要在哪些地方补课。今后的学习实践中，我将以更成熟的方式，做出更多经得起检验的产品。

**RnTs1002**：

参加本次操作系统大赛，对我来说是一次十分宝贵的实践锻炼。在团队中，我主要负责教学内容规范化和实验任务体系设计。工作期间搭建实验包样板、制定实验检查点与评价标准，梳理知识学习路径；完整修订校准 Lab1 至 Lab8 全套实验手册，完成基础教学设计。同时负责实验代码迁移，同步适配代码脚手架、运行上下文与前端文件结构，并持续开展人工测评，检验整套实验流程。

在推进工作的过程中，我不再只是被动学习操作系统理论，而是站在学习者的视角思考实验该如何循序渐进进行。在反复打磨实验任务、调整验证标准的过程中我深刻体会到，一套优质的操作系统实验不能只追求代码可以运行，更要贴合学习规律，帮助学习者真正理解内核底层原理。和团队成员协同开发的经历也锻炼了我的沟通能力，为了让实验内容、任务规则和平台前后端、AI 辅导功能保持统一，我们需要不断沟通、反复调整方案。

这次参赛也让我产生更深的感悟：我们钻研底层技术、埋头完成代码开发，并不只是单纯完成一个项目作品。技术最终要落地服务于人，我们搭建这套操作系统实验平台，就是希望改善广大学生的学习体验，降低内核实验的上手门槛。技术的价值，最终体现在解决现实需求、实实在在改善人们的学习与生活。今后我也会带着这份思考继续学习操作系统，让技术更好地服务生活。



# 附录A：参考练习实现总结报告

对应赛题第 1 条技术指标：在官方参考教学环境中完成 5 个基础实验练习（exercise）。本文同时记录锁定基线下的 base 模式测试结果。

| 项       | 说明                                                         |
| -------- | ------------------------------------------------------------ |
| 参考仓库 | `reference/tg-rcore-tutorial`（branch `test`，commit `d6330a6`） |
| 练习补丁 | [reference-patches/](./reference-patches/)（已纳入 Git，可审阅 diff） |
| 环境配置 | [environment_setup.md](./docs/environment_setup.md)          |

## 1. 参考仓库基线

```text
repo:   https://github.com/rcore-os/tg-rcore-tutorial.git
branch: test
commit: d6330a6db1f81c8c1cfba5ec3db9923199398f24
local:  reference/tg-rcore-tutorial
```

赛题要求的五个基础实验章节：

```text
tg-rcore-tutorial-ch3
tg-rcore-tutorial-ch4
tg-rcore-tutorial-ch5
tg-rcore-tutorial-ch6
tg-rcore-tutorial-ch8
```

## 2. 测试环境

```text
rustc:   1.96.0
cargo:   1.96.0
QEMU:    11.0.50
checker: tg-rcore-tutorial-checker 0.4.8
```

## 3. base 模式测试结果

| 章节 | 测试类型 | 结果 | checker |
| ---- | -------- | ---- | ------- |
| ch3  | base     | 通过 | 4/4     |
| ch4  | base     | 通过 | 6/6     |
| ch5  | base     | 通过 | 14/14   |
| ch6  | base     | 通过 | 15/15   |
| ch8  | base     | 通过 | 22/22   |

各章关键通过项：ch3 `write A/B/C`；ch4 含 `sbrk`；ch5 `forktest` 与子进程退出码；ch6 `file_test`；ch8 `pipetest` 及同步原语相关测例。

## 4. exercise 验收总览

| 章节 | 练习内容                                | checker（exercise） |
| ---- | --------------------------------------- | ------------------- |
| ch3  | `sys_trace` 系统调用                    | **7/7**             |
| ch4  | `mmap` / `munmap`                       | **16/16**           |
| ch5  | `spawn` + stride 调度                   | **17/17**           |
| ch6  | `linkat` / `unlinkat` / `fstat` + spawn | **33/33**           |
| ch8  | 死锁检测（银行家 + 等待图）             | **25/25**           |

**环境变量说明（exercise）**

exercise 模式下 `initproc` 通过编译期环境变量 `CHAPTER` 选择 usertest，而非交互式 shell。须 **`cargo clean` 后** 带 `CHAPTER` 重新编译用户程序，否则可能进入 `user_shell` 导致 QEMU 挂起。

| 章节     | `CHAPTER` 取值                  |
| -------- | ------------------------------- |
| ch3、ch4 | 任意非负整数（如 `"3"`、`"4"`） |
| ch5      | `"5"`                           |
| ch6      | `"6"`                           |
| ch8      | `"8"`                           |

## 5. 分章实现摘要

**ch3：sys_trace**

- 实现：在 `task.rs` 维护每任务 syscall 计数；在 `main.rs` 实现 `trace_request` 三种模式（读计数、写内存、读内存）。
- 验证：`tg-rcore-tutorial-checker --ch 3 --exercise` → 7/7。

**ch4：mmap / munmap**

- 实现：在 `Process` 上实现 `mmap`/`munmap`；处理页对齐、`prot` 权限位与区域重叠检查。
- 验证：checker 16/16（含 ch3 继承测例）。

**ch5：spawn + stride**

- 实现：`processor.rs` stride 调度；`spawn` 从 APPS 表加载 ELF；`set_priority`。
- 环境要求：须 `CHAPTER=5` 且 `cargo clean` 后重编；`CHAPTER` 由编译期 `option_env!` 读取。
- 验证：checker 17/17。

**ch6：硬链接 + spawn**

- 实现：`read_cstr` 读取用户态路径；`linkat`/`unlinkat`/`fstat` 对接 `easy-fs`；`spawn` 从 `fs.img` 加载 ELF；从 ch5 迁移 `mmap`/`munmap`。
- 实现注意：`unlink` 路径避免在持有 `fs.lock()` 时再次加锁（自旋锁不可重入）。
- 验证：checker 33/33。

**ch8：死锁检测**

- 实现：在 `process.rs` 增加 `DeadlockState`（信号量银行家算法 + 互斥锁等待图）；在 `mutex_lock`/`semaphore_down` 等路径返回 `-0xDEAD`；`enable_deadlock_detect` 开关。检测状态挂在进程层，未修改 `tg-sync` crate。
- 验证：`CHAPTER=8` + exercise → checker 25/25。

## 6. base 与 exercise 的关系

base 测试验证参考框架自带内核行为（见上文 §3）。exercise 在 base 之上增加编程题；checker 会检查继承章节的输出是否仍正确。ch8 exercise 可与前期章节解耦实现，但验收时仍检查继承输出。

## 7. 结论

五章 base 测试与 exercise checker 全部通过（base：4/4、6/6、14/14、15/15、22/22；exercise：7/7、16/16、17/17、33/33、25/25）。练习实现补丁已提交至 `reference-patches/`。

# 附录B：三方环境框架对比

## 1. 代码组织与演进方式

### 1.1 三方对照总览


| 维度           | EVOLVE                                                       | tg-rcore-tutorial                                            | xv6-riscv                                      |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------- |
| 演进方式       | 同一二进制上 `labN` feature 逐级打开；Lab6 打开后才链接 `easy-fs` / `virtio-drivers` | **换章节目录 / 换工程**                                      | 始终完整内核；靠 lab 指导与 git diff 感知增量  |
| 学生看到的增量 | 切 feature 重编译即可见：Lab4 起 `fork_test`，Lab5 起 `fs_test pass` / `pipe_test pass`，Lab6 起落盘版 fs_test | 新目录 + 新 checker 题面                                     | lab 补丁改 `proc.c` / `vm.c` 等，diff 自行对照 |
| 模块边界       | 8 个 `os-*` crate，可独立 host 单测                          | 机制在 15 个共享 crate，章节 crate 是集成层（path + version 引用） | 按 C 文件边界清晰，无独立包/单测               |
| 工程切换成本   | 低（同一工作区，scaffold 按 lab 下发）                       | 较高（`CHAPTER` / `cargo clean` 等约定）                     | 中（同一树，但 lab 间改动需自行对照）          |


### 1.2 EVOLVE：单内核 + feature gate

`kernel/Cargo.toml` 定义严格递进的 feature：

```toml
lab1 = ["dep:os-sbi"]
lab2 = ["lab1", "dep:os-context", "dep:os-syscall"]
lab3 = ["lab2", "dep:os-alloc", "dep:os-vm"]
lab4 = ["lab3"]
lab5 = ["lab4", "dep:os-fs"]
lab6 = ["lab5", "dep:easy-fs", "dep:virtio-drivers", "dep:spin"]
lab7 = ["lab6", "dep:os-signal"]
lab8 = ["lab7", "dep:os-sync"]
```

内核主体由模块按 feature 编译，组件 crate 职责如下：


| crate        | 引入时机 | 职责                               |
| ------------ | -------- | ---------------------------------- |
| `os-sbi`     | lab1     | SBI console / shutdown 封装        |
| `os-context` | lab2     | `TrapContext` 与 trap 汇编         |
| `os-syscall` | lab2     | 系统调用编号与共享结构             |
| `os-alloc`   | lab3     | 物理帧分配与内核堆                 |
| `os-vm`      | lab3     | Sv39 页表、地址空间、ELF 映射      |
| `os-fs`      | lab5     | 内嵌文件、磁盘 inode 语义、fd 规则 |
| `os-signal`  | lab7     | 信号集、动作、屏蔽字               |
| `os-sync`    | lab8     | 阻塞 mutex / semaphore / condvar   |


组织特点：**演进写在依赖声明里**——上一级 feature 是下一级的前置，组件在哪个 Lab 进入主线一目了然。学生切换 feature 即可看到内核从裸机启动逐步演进到虚存、进程、文件系统、磁盘 FS、信号、线程同步。

### 1.3 tg-rcore-tutorial：分章独立工程 + 共享组件 crate

仓库为 23 个平铺的独立 crate（对照树 `test` 分支实测统计）：

```text
tg-rcore-tutorial/
├── tg-rcore-tutorial-ch1 … ch8     # 8 个章节 crate：每章一个完整内核工程
├── tg-rcore-tutorial-sbi / linker / console / kernel-context /
│   kernel-vm / kernel-alloc / syscall / task-manage / easy-fs /
│   signal / signal-defs / signal-impl / sync / user / checker   # 15 个共享组件 crate
└── Cargo.toml                       # meta crate（bundle 打包用，非 workspace）
```

- **章节 crate**：每章自带 Cargo.toml（含 version / repository / keywords 等 crates.io 发布元信息）、build.rs、src、test.sh、exercise.md（练习题面）与内嵌的 `tg-rcore-tutorial-user` 用户态子工程。以 ch6 为例，内核 src 仅 5 个文件（`fs.rs` / `main.rs` / `process.rs` / `processor.rs` / `virtio_block.rs`），机制主体在共享 crate 中，章节 crate 扮演集成层；用户态测试程序 73 个。
- **共享组件引用**：章节以 path + version 双声明引用组件，例如 ch3 的
  `tg-sbi = { package = "tg-rcore-tutorial-sbi", path = "../tg-rcore-tutorial-sbi", version = "0.4.9", features = ["nobios"] }`
  ——组件按可独立发布 crates.io 的标准维护。
- **CHAPTER 编译期开关**：`user/src/bin/initproc.rs` 通过 `option_env!("CHAPTER")` 在**编译期**选择测试目标；切章测试须 `cargo clean` 后带环境变量重新编译，即由此而来。
- **章节内 feature**：如 ch3 定义 `coop` / `exercise` 两档，exercise 档启用练习测例。

组织特点：**演进写在目录边界里**——章节之间靠“换工程 + 共享组件升级”衔接，同一机制（如任务管理）随章节推进在共享 crate 中逐步增强，章节 crate 负责把当章练习集成进来。

### 1.4 xv6：单一成熟源码树

xv6 没有 feature gate，所有模块始终编译进内核：`start.c` / `entry.S` / `main.c` 负责启动，`trap.c` / `trampoline.S` 负责 trap，`vm.c` 负责虚存，`proc.c` 负责进程，`fs.c` / `bio.c` / `log.c` 负责文件系统，`virtio_disk.c` 负责磁盘驱动。学生完成 lab 时修改同一份代码，靠 lab 指导或 git diff 理解每章新增内容。

组织特点：**演进不体现在工程结构里**——增量靠 6.S081 lab 指导文档与版本对照呈现，换来的是代码始终代表一个完整、自洽的系统。

## 2. 知识分布

### 2.1 Lab / 章 / xv6 概念映射


| EVOLVE | 主题要点                                 | tg-rcore 对照                  | xv6 对照                                         |
| ------ | ---------------------------------------- | ------------------------------ | ------------------------------------------------ |
| Lab1   | 裸机、SBI、链接脚本                      | 早期启动章                     | `start.c`、`entry.S`、`main.c`                   |
| Lab2   | trap、syscall、yield                     | ch3                            | `trap.c`、trampoline、`syscall.c`、调度入口      |
| Lab3   | Sv39、用户空间、U 位                     | ch4 基础                       | `vm.c`、pgtbl lab                                |
| Lab4   | PCB、fork/exec/wait                      | ch5 进程基础                   | `proc.c`、`sysproc.c`                            |
| Lab5   | fd、内嵌 FS、管道、自旋锁                | 通向 ch6/ch7 的过渡            | `file.c`、`pipe.c`、`spinlock.c`                 |
| Lab6   | 磁盘 FS、link/fstat、spawn、mmap、stride | ch6 + 继承的 spawn/mmap/stride | `fs.c`/`bio.c`/`log.c`/`virtio_disk.c`、相关 lab |
| Lab7   | 统一 fd、dup、信号                       | ch7                            | dup/重定向；信号多在 lab                         |
| Lab8   | 线程、阻塞同步、死锁                     | ch8                            | uthread / locks；`sleep`/`wakeup` 范式           |


### 2.2 机制对照：同一机制的三种形态


| 机制       | EVOLVE                                                       | tg-rcore                         | xv6                                                 |
| ---------- | ------------------------------------------------------------ | -------------------------------- | --------------------------------------------------- |
| 启动       | Lab1：SBI“固件交权”显式教学                                  | 早期章分散带过                   | 自管 M-mode → S-mode，路径最完整                    |
| Trap       | Lab2 统一 `__alltraps`；用户页表含内核 trap 区恒等映射（教学简化） | ch3 章内完整实现                 | trampoline / trapframe 严格隔离，隔离本身即教学重点 |
| 虚存       | Lab3 Sv39 最小可用；mmap 推迟到 Lab6                         | ch4；exercise 附 mmap/munmap     | `vm.c` per-process 页表 + 内核切换，语义最严        |
| 进程       | Lab4 fork/exec/wait；协作式 `wait4`（yield 轮询）            | ch5；spawn/stride 在 exercise    | 完整 fork/exec/wait + sleep/wakeup 语义             |
| 调度       | Lab6+ stride + `set_priority`                                | ch5 exercise                     | 基础轮转；策略扩展在 lab                            |
| 文件系统   | 两步：Lab5 内嵌抽象 → Lab6 easy-fs + VirtIO 落盘             | ch6 一步到位磁盘 FS              | 五层 FS（bcache/log/inode/目录/设备）始终在场       |
| 信号 / IPC | Lab7 统一 fd + dup + 通用信号                                | ch7                              | kill 标记；通用信号在 lab                           |
| 线程同步   | Lab8 TCB + 阻塞原语 + 死锁检测（银行家 + 等待图）            | ch8 exercise 聚焦死锁            | `sleep`/`wakeup` 范式；uthread / locks lab          |
| 系统调用   | 约 36 个，教学精简 ABI（`exec` 以 `a1` 传路径长度）          | 随章扩展，重可观测性（trace 等） | 基础约 21 个，最接近 Unix 语义                      |


**三个重点机制的展开：**

**trap 与隔离——简化与严格的取舍。** EVOLVE 在用户页表中保留内核 trap 区的恒等映射，牺牲隔离严格性换取 Lab2 即可跑通用户态的平缓起点；xv6 的 trampoline 高地址映射 + trapframe 是教科书级严格隔离，但也是入门最陡的坎之一；tg-rcore 居中，随章节从简单走向完整。这不是对错问题，是“何时把隔离的完整代价摆到学生面前”的时机选择。

**文件系统——削峰哲学最集中的体现。** EVOLVE 拆成两步：Lab5 只建 fd / 内嵌只读文件 / 管道的抽象层（纯内存、无设备），Lab6 才引入 VirtIO 块设备与 easy-fs 磁盘语义，link/fstat/spawn/mmap 在落盘之后才出现；tg-rcore 在 ch6 一章内完成从块设备到 inode 的全部内容，exercise 强度高；xv6 的五层 FS 与 log 从第一天就在场，journal 一致性留给深化。同一终点，三种爬坡曲线。

**线程与同步——检测口径的对齐。** EVOLVE Lab8 的死锁检测同时实现银行家算法与互斥锁等待图，与 tg-rcore ch8 exercise 的 checker 口径直接对齐（本仓库参考练习的实测记录即以此验收）；xv6 不做死锁检测，其 `sleep`/`wakeup` 条件同步是工程范式的经典教学。两种取向分别代表“可判定的练习目标”与“真实系统的惯用法”。

**边界与衔接：** 网络、完整 COW、多核、FS journal 等深水区未进入 EVOLVE 入门主线——tg-rcore 社区路径可继续延伸，xv6 进阶 lab 可覆盖。衔接路径建议：**EVOLVE 建脉络 →（可选）tg-rcore 对读强化 → xv6 建高楼**，三者互补而非替代。

## 3. AI 时代的操作系统教学难题与应对

生成式 AI 工具普及后，操作系统实验课出现了很多新难题。经典路径（tg-rcore / xv6）并非存在设计缺陷——它们出现时，默认“学生自己读文档、在终端里调试”，AI 尚不在需要考虑的因素之内；今天这一前提发生了变化，课程设计若不做调整，难题会被进一步放大。EVOLVE 的思路是把应对办法做成平台自带的功能，而非要求教师自行拼装工具。

### 3.1 四类教学难题与三方应对


| 难题                                   | tg-rcore 的表现                                              | xv6 的表现                                 | EVOLVE 的应对                                                |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| **过程不可见**（教师仅能看到最终结果） | 教师主要看到判题分数，难以区分“真正理解”与“AI 生成后略作修改” | 主要看到评分脚本的结果；过程材料需自行建设 | 学生在独立工作区中实验；平台记录真实运行过程；实验报告与复盘留档，评分时可见代码的完整运行轨迹 |
| **AI 代写绕过思考**                    | 练习题可整段交给外部 AI 完成，教程无法干预                   | 作业补丁同样可由 AI 生成，系统无内建约束   | 内置 AI 助教：回答前先查看学生当前的代码、报错与运行记录，不直接给出完整答案；练习采用“补全代码”与“定位错误”两种形式，整段抄袭无法通过 |
| **反馈慢与两极分化**                   | 首周耗在环境搭建；基础较弱者卡在编译与运行环节，基础较好者借助 AI 快速完成 | C 语言、完整内核加运行期调试，入门门槛更高 | 统一学习平台，免除本地环境搭建；40 项单元测试快速给出结果；教师可分阶段控制开放内容 |
| **评价难公平**（分数相同、理解不同）   | 相同分数下理解深度差异显著，且缺少可复查的材料               | 问题同样存在；教材深入，但不解决过程评价   | 报告采用统一模板；复盘环节通过追问考察“为什么”；AI 回答以课程资料为依据；教师逐份复核并留存记录 |


四类难题存在一个共同点：**均发生在教学系统之外**——学习过程记录、环境搭建、反馈渠道与评价依据，本不在 tg-rcore / xv6 这类教学内核的职责范围内，课程需要时须自行建设；EVOLVE 将这些纳入了平台。

### 3.2 学生自用 AI 与 EVOLVE 自带 AI 的差别


| 对比项    | EVOLVE                                                       | tg-rcore / xv6                               |
| --------- | ------------------------------------------------------------ | -------------------------------------------- |
| AI 的角色 | 平台内建 AI 助教与自动评分，回答前先核对学生的实际代码与运行记录 | 学生自行选择 AI 工具，课程无法约束           |
| 任务形式  | 教师可下发“补全代码”“定位错误”类题目，并可随机变换           | 以完整的编程练习题为主                       |
| 教学管理  | 班级、学生账号、内容开放节奏、公告、课程资料、报告批改集成于一个平台 | 班级管理与过程记录需要课程自行搭建           |
| 文档策略  | 实验文档以问题引导，答案与正文分离，附 AI 提问示范           | 教程步骤清晰，但“防止 AI 代写”并非其设计目标 |


经典路径中，AI 是学生自行引入的外部变量，课程无法约束其使用方式；EVOLVE 中，AI 是平台的组成部分——回答前先核对学生的实际情况，教师可控制其能力范围与开放程度。

## 4. 总结对比

### 4.1 三维度对照


| 维度           | 一句话                                                       |
| -------------- | ------------------------------------------------------------ |
| 代码组织与演进 | EVOLVE 用单内核 feature + 组件 crate 服务“可见演进与可测单元”；tg-rcore 用分章工程服务标准化练习；xv6 用完整源码树服务成熟工程范式 |
| 知识分布与映射 | EVOLVE 削峰铺轨（先抽象后落盘、先主线后隔离）；tg-rcore 章内做透；xv6 适合概念后的广覆盖深化 |
| AI 时代的课堂  | 经典路径强在内容与判题；EVOLVE 强在过程可见、AI 回答前先核对证据、任务形式多样、班级开放节奏可控——针对代写与“只见分数不见理解”问题 |


### 4.2 EVOLVE 增量

1. **演进方式：把系统演进过程写进工程结构。** EVOLVE 在同一工作区内用一条命令切换阶段，feature 链即演进史，学生每次升级都能直接看到新增能力的运行效果；tg-rcore 依靠换章节工程与 `CHAPTER` 编译期开关衔接（切章须 `cargo clean` 重编），xv6 始终编译完整内核、增量依赖 lab 指导与版本对照。三者中，只有 EVOLVE 让“演进本身”成为可操作、可观察的学习对象。
2. **知识节奏：从入门到精通。** EVOLVE 把文件系统拆成“抽象（Lab5）→ 落盘（Lab6）”两步、将 mmap 移出虚存章，并以可观察证据呈现阶段差异（yield 从 1 轮到 5 轮）；tg-rcore 在一章内一次做透（如 ch6 集中 33 项练习），强度高、峰值陡；xv6 的完整系统从第一天就在场，适合概念建立后的深化。EVOLVE 承担的是两条经典路径都不占的位置：**为初学者建立脉络**。
3. **课堂形态：把 AI 与教学管理纳入系统边界。** 经典路径中，AI 是学生自行引入的外部变量，过程记录与班级管理需要课程另行搭建；EVOLVE 中，AI 助教回答前先核对学生的实际代码与运行记录，练习可采用“补全”“定位错误”等形式并随机变换，教师可分阶段控制开放内容，过程材料直接参与评分。这针对的是经典路径未曾面对的问题：代写与“只见分数不见理解”。

# 附录C：项目前端页面展示

![项目首页](assets/%E5%89%8D%E7%AB%AF%E9%A6%96%E9%A1%B5.png)

![学生工作台](assets/%E5%AD%A6%E7%94%9F%E5%B7%A5%E4%BD%9C%E5%8F%B0.png)



# 附录D：Agent Server详细说明

## 1. Tutor Agent：实验时的教学辅助

### 1.1 请求入口和完整顺序

Tutor 的一次非流式请求大致经过以下顺序：

```mermaid
sequenceDiagram
  participant U as LabWorkspace
  participant S as Tutor Server
  participant P as Turn Policy
  participant K as Hybrid Retriever
  participant M as Tutor LLM
  participant D as os-lab.db
  U->>S: labId/sessionId/message/history/evidenceRefs
  S->>S: 校验 Lab、会话、消息和证据引用
  S->>D: 读取 Tutor state、学习事件、运行摘要
  S->>P: identify topic + planTutorTurn
  alt 直接索要完整实现
    S->>S: 先执行 guardrail，不检索 RAG
    S-->>U: guardrail JSON
  else 普通教学问题
    S->>K: Lab 范围 + student-safe/guided-hint
    K-->>S: 最多 5 个 chunk + retrieval diagnostics
    S->>M: system Prompt + 最近历史 + 当前问题
    M-->>S: 候选回复
    S->>S: 引用白名单和答案泄漏检查
    S->>D: 写入权威 Tutor 对话事件
    S-->>U: JSON 或 SSE meta/done
  end
```

具体步骤如下：

1. 检查 `labId` 是否为 `lab1`--`lab8`，检查 `sessionId`，并限制当前消息为 1--4000 字符。
2. 对学生提交的 `evidenceRefs` 调用 `validateChatEvidenceRefs()`，服务端不会接受任意 `run:` 或 `event:` 引用。
3. 从服务端读取该学生、该学习会话和该 Lab 的 Tutor 状态，以及学习证据摘要。
4. 将浏览器传来的历史规范化为最近 10 条消息，每条内容最多 2000 字符，作为模型上下文来源之一。
5. 根据用户提问识别主题和意图，生成 `planTutorTurn()`。
6. 按主题读取提示级别和理解检查状态，保存新的 Tutor session state，并记录阶段进入或提示升级事件。
7. 先执行完整答案 Guardrail。命中时直接启动护栏，禁止直接返回实验答案，不检索知识库、不调用上游模型。
8. 未命中 Guardrail 时才检索 Tutor 可用知识，生成受限的知识 Prompt。
9. 解析模型配置，调用 OpenAI Chat Completions；空回复时尝试 `/responses` 或非流式 Chat Completions；失败时生成离线 Tutor 回复。
10. 对模型文本进行证据引用和答案泄漏检查，保存最终实际回复为权威 `ai_response` 事件，再返回给前端。

### 1.2 提问意图与提示等级

基于用户提问文段进行提问意图的识别，包括：

| 意图            | 适用问题                               | 本轮主要动作                               |
| --------------- | -------------------------------------- | ------------------------------------------ |
| `concept`       | 询问机制、概念或“为什么”               | 先用必要解释回应，再让学生说出自己的判断   |
| `code-reading`  | 询问源码位置、调用链、字段或控制流     | 从当前代码上下文解释，要求学生指出源码证据 |
| `debug`         | 报错、异常、失败现象或根因定位         | 承认已观察现象，要求一个可证伪假设         |
| `verification`  | 运行、测试、预期输出和断言             | 定义可观察证据，要求最小验证               |
| `reflection`    | 复盘、报告、答辩和理解变化             | 把结论连接到证据，区分自己的判断与 AI 提醒 |
| `transfer`      | 对比、改变条件、边界和迁移             | 指出不变量与变化量，要求先预测再验证       |
| `direct-answer` | 直接要完整代码、最终答案或可提交 patch | 触发答案护栏，要求学生先提交尝试或定位     |

为确保Tutor实现引导式的教学，我们设置不同提示等级，逐级提高辅助水平，只有学生明确请求提示时才递增，最高为 L4。“再给一点提示”等省略式追问沿用上一问题线程；切换意图、源码文件、阅读位置、诊断含义或核心机制后，新线程从 L0 开始。提示使用次数和等级变化作为学习轨迹信息被记录。

| 等级 | 目标               | 可采用的帮助                                 |
| ---- | ------------------ | -------------------------------------------- |
| L0   | 观察现象和已有材料 | 要求学生先描述现象或定位对象                 |
| L1   | 提出假设           | 帮助形成可检查的假设                         |
| L2   | 设计最小验证       | 给出观察点、预期差异和恢复方法               |
| L3   | 对照路径           | 指向相关调用链、状态写入或证据关系           |
| L4   | 边界辅助           | 停止继续泄漏实现，必要时转教师或要求提交尝试 |

### 1.3 日常即时追问规则

Tutor 的理解检查由 `shouldAskUnderstandingCheck()` 控制，不是每轮自动追问。必须同时满足：

- 当前主题已经有过 Assistant 回答。
- 学生出现“明白了”“所以我理解”等确认信号。
- 当前不是 `reflection`，也不是直接索要完整答案。
- 学生没有明确表示要继续跑实验或继续操作。
- 当前 topic 还没有进行过理解检查。
- 追问冷却轮数满足要求。

触发后只问一个与刚才问题直接相关的问题；学生回答这次检查后，本轮不再追加新问题。每个主题最多一次理解检查，兜底实现“先解决疑惑，再确认是否真正理解”的目的。

### **1.4 Prompt 的组成及来源**

学生向 Tutor 提问时，服务端会补充教学规则、当前 Lab、学生正在查看的内容、可信运行证据和相关知识片段，再将它们组合成完整提示词。具体由以下几部分组成。

**1. 系统教学边界**

最基础的提示词来自我们预设的Tutor Agent 角色提示词，用于规定 Tutor 的身份和基本原则。例如，Tutor 的任务是帮助学生理解和验证，而不是直接完成实验；不能提供可以直接提交的完整代码；不能把未经验证的内容说成事实；不能声称执行过实际上没有发生的测试。

这部分对所有 Lab 和所有学生都相同，优先级最高。后面加入的 Lab 资料、学生代码或 RAG 知识片段都不能改变这些基本规则。

**2. 当前 Lab 的教学上下文**

系统会根据学生所在的 Lab，加载对应的实验手册的上下文。这部分告诉模型当前实验正在学习什么、涉及哪些核心概念、实现范围到哪里，以及哪些内容暂时不属于本 Lab。例如，Lab2 主要讨论 Trap 和任务切换，Lab6 才进一步涉及 VirtIO 和磁盘文件系统。这样可以避免 Tutor 给出超出当前实验阶段的回答。

**3. 当前问题的回答策略**

服务端会先识别学生问题的意图，再加载对应的策略。例如，概念问题会优先解释术语和机制；代码阅读问题会结合调用路径分析；调试问题会引导学生区分可能原因；验证问题会要求明确可观察结果；迁移问题会讨论条件变化后结论是否仍然成立；如果学生直接索要完整答案，则进入答案保护策略，启动护栏拒绝回复。

因此，同一句知识内容会根据学生提问目的采用不同的回答方式，而不是统一使用固定模板。

**4. 学生当前阅读的手册位置**

前端会把学生正在阅读的手册二级标题和三级标题发送给服务端，再转换成简短的上下文。这使 Tutor 能够知道学生正在看哪一节。例如，学生问“这里为什么要保存”，系统可以结合他当前正在阅读的“任务上下文切换”章节解释，而不是猜测“这里”具体指什么。阅读位置只用于理解学生的问题，不能证明学生已经掌握了这部分内容，也不能作为实验通过的证据。

**5. 学生当前查看的代码**

`workspaceContextLayer()` 会提供学生当前打开的文件、光标所在行，以及主动选中的代码片段。Tutor 因此可以回答“这一行有什么作用”或者“这个函数为什么会出错”等需要具体代码上下文的问题。

**6. 服务端生成的本轮教学策略**

服务端还会通过 `tutorTurnPolicyPrompt()` 生成本轮的具体教学计划，其中包括问题意图、回答模式、当前讨论主题、提示层级、建议教学动作、可引用的证据以及可信工具摘要。

这部分信息由服务端根据数据库中的运行、诊断、Trace 和历史行为生成。例如，服务端可以明确告诉模型“当前存在一次失败运行”“还没有可信通过记录”或者“可以引用 `run:xxx`”。

模型只能根据这些事实组织回答，不能自行修改运行状态，也不能虚构不存在的测试、诊断或 Trace。旧的 `stage` 路由模式下，这部分由 `tutorPolicyPrompt()` 提供，并额外包含当前学习阶段和门控结果。

**7. RAG 检索得到的知识片段**

如果问题没有触发答案保护，系统会从知识库中检索与当前问题和 Lab 有关的知识片段，加入到提示词中，具体实现可见下一节。

普通的 `student-safe` 片段可以用于解释概念；`guided-hint` 片段只能转化为提示或观察目标，不能直接泄露答案。每个片段都带有来源和 `kb:` 引用，方便检查回答依据。

RAG 内容属于辅助资料，不属于系统命令，也不能证明学生代码已经正确。如果教材内容与真实运行、Trace 或诊断结果冲突，应以服务端记录的可信证据为准。

**实际发送给模型的内容**

上述内容会先组合成完整的 `framework.prompt`，作为系统提示词发送。随后加入最近最多 10 条学生与 Tutor 的对话历史，最后加入学生本轮提出的问题。

因此，模型实际看到的内容可以分成三类：系统教学边界和回答策略规定“应该怎样回答”；阅读位置、代码选区和历史对话说明“学生现在在问什么”；RAG 和服务端证据说明“回答可以依据什么”。

### 1.5 Tutor 输出护栏

输出护栏主要由 `tutor/state-machine.mjs` 的 `enforceTutorOutput()` 和服务器端的 Guardrail 组成：

1. 扫描 `run:`、`trace:`、`diag:`、`event:`、`kb:` 引用。
2. 引用必须属于当前服务端证据白名单或本轮实际召回的知识 chunk 白名单。
3. 发现非法引用时，返回不能引用未经验证证据的安全回复。
4. 检查“完整代码”“完整文件”“可直接提交 patch”“diff --git”等泄漏信号。
5. 代码 fence 超过 12 行也会触发护栏。
6. 正常模型回复最长 4000 字符。
7. Tutor 不能声称自己执行了工具摘要中不存在的运行、诊断或 Trace。

### 1.6 模型调用、流式协议和降级

Agent 的配置优先级为：学生请求携带的配置（前提是教师允许自配） -> 教师统一配置 -> 环境默认值。

项目开发时所使用模型为 gpt-5.5。

服务器支持：

- OpenAI-compatible `/chat/completions`。
- `/responses` 兼容回退。
- JSON 非流式响应。
- SSE 流式响应，客户端通过 `meta` 和 `done` 合并知识元数据、Tutor state 和最终回复。
- 流式空响应时重试 Responses API；老网关不支持时再尝试非流式 Chat Completions。
- 连接建立前的连接超时；连接建立后不会把本地慢模型的正常生成误判为连接失败。
- 连接失败、超时、错误响应或空响应时的离线 Tutor 回复。

## 2. Tutor RAG

### 2.1 RAG 在 Tutor 中的实际位置

Tutor 的 RAG 不是在前端做，也不是把整个知识库直接放进 Prompt。`retrieveTutorKnowledge()` 在服务器端执行：

1. 先接收当前学生问题和目标 Lab。
2. 允许内容类只有 `student-safe`、`guided-hint`。
3. 先召回候选，再按目标 Lab/global 范围和数量上限选择。
4. 最多向 Prompt 注入 5 个 chunk；不属于当前 Lab 的 global-only chunk 最多 2 个。
5. 直接答案 Guardrail 在此之前执行，因此直接索要完整实现时 RAG 为空。
6. 学生端只得到安全元数据，不得到内部 chunk 全文、数据库路径、异常堆栈或教师元数据。

### 2.2 知识库生命周期

知识库位于独立 SQLite `learning/knowledge/knowledge.db`，`knowledge-store.mjs` 维护：

- Source、Source Version、Document、Chunk。
- `knowledge_chunk_labs` 的 Lab 绑定。
- FTS 索引和 embedding 表。
- ingestion、retrieval、audit 日志。

知识源通常经过“导入 -> 解析/规范化 -> 分块 -> 质量和答案风险检查 -> 待审核 -> 发布”的生命周期。发布不是简单把文件复制到目录：

- 当前 source 旧版本的 chunk 会失活。
- 新版本 chunk 被激活并建立 FTS/embedding 索引。
- 教师上传默认是 `pending-review`，发布前需要许可证、范围、内容类别和答案风险复核。
- 禁用或人工移除会将 `active/indexable` 置为 0，删除其 embedding，并写入审计日志。
- 发布、禁用、回滚均保留 source version 和审计信息。

Tutor 的权限边界：

| content class     | Tutor 可取 | 学生可见/可逐字引用                            |
| ----------------- | ---------- | ---------------------------------------------- |
| `student-safe`    | 是         | 可见，可有限引用，单段逐字引用上限由策略控制。 |
| `guided-hint`     | 是         | 不直接展示，必须转化为一个反问或观察目标。     |
| `teacher-only`    | 否         | 不可见，不可作为 Tutor 引用。                  |
| `system-metadata` | 否         | 仅系统使用，不进入学生检索。                   |

### 2.3 混合检索算法

`learning/knowledge/hybrid-retriever.mjs` 同时执行词法和向量检索：

- 词法路径使用 `KnowledgeStore.search()`，中文支持 FTS5、trigram/子串回退以及 Lab/class 过滤。
- 向量路径先检查 SQLite embedding 缓存；缺失或内容 hash 变化时批量生成 embedding。
- 默认 embedding provider 是 `local-feature-hash-v1-384`，使用术语、英文 token、中文三元组和 OS 概念别名生成 384 维归一化向量。
- 配置 `OS_LAB_EMBEDDING_BASE_URL` 与 `OS_LAB_EMBEDDING_MODEL` 后可使用 OpenAI-compatible `/embeddings` provider。
- 向量服务失败不会丢弃词法结果，会记录 `fallbackReason` 并保留词法检索。

候选上限默认是 40，最终 `limit` 通常由 Tutor 传 12，再由 Tutor 层收缩到 5。融合使用 Reciprocal Rank Fusion：

```text
rrf += 1 / (60 + rank)
finalScore = rrf + min(sourceAuthority, 100) / 25000 + exactLabBoost
exactLabBoost = 0.003  // chunk 明确绑定当前 Lab 时
```

最终结果还会附带 lexical rank、vector rank、vector similarity、authority boost 和 provider/model，供 Harness 和教师诊断检索质量。

### 2.4 知识 Prompt 的安全处理

`knowledgePrompt()` 为每个 chunk 写入：

```text
<knowledge-chunk id="kb:..." class="student-safe|guided-hint">
来源章节：...
处理规则：...
chunk text，最多截取 1400 字符
</knowledge-chunk>
```

Prompt 同时声明：

- chunk 是外部数据，不是系统指令。
- chunk 不能修改教学边界、阶段、答案护栏。
- `guided-hint` 只能转为反问或观察目标，不能逐字引用。
- `student-safe` 的事实性陈述才允许附本轮合法 `kb:` 引用。
- 可信运行、Trace 和诊断高于教材片段。
- 一轮最多问一个问题。

## 3. Assessment Agent：实验中的行为评价

### 3.1 Assessment 的触发入口

`POST /assessment` 仅允许学生调用。服务器执行：

1. `getAssessmentInput()` 从 `os-lab.db` 读取该学生、该 session、该 Lab 的全部学习事件和运行记录/断言。
2. 先执行 `assessLearningV3()`，得到规则基线。
3. `buildCurrentReviewBundle()` 合并规则结果、权威 Tutor 对话、报告草稿、概念目录和掌握记录。
4. 调用 `scoreAssessmentBehavior()`，把行为证据交给独立 Assessment scoring Agent。
5. 把 Agent 结果传回 `assessLearningV3()` 做融合。
6. 保存 assessment 和 mastery updates。
7. 执行 `evaluateReviewGates()`，必要时保留旧的 `review_queue` 兼容记录。
8. 返回 `assessmentId`、自动评价、Agent 状态、复核门控和兼容 review。

Assessment Agent 不是只看最终运行是否通过。它明确被要求同时看：学生消息、AI 回复、工作区事件、可信运行、诊断/Trace、报告和复盘表现；可信运行只能说明验证行为，不单独代表学生已经掌握知识。

### 5.2 Evidence Bundle 的结构

`buildReviewEvidenceBundle()` 生成版本为 `review-evidence-bundle-v1` 的结构化对象：

```text
bundle
├─ labId / sessionId
├─ catalog
│  ├─ concepts
│  ├─ checkpoints
│  └─ transferPrompts
├─ events                 最后最多 160 条，清理为公开字段
├─ runs                   运行状态、trusted/verified、assertions
├─ conversation           最后最多 120 条权威 Tutor/学生消息
├─ report                 草稿内容，reflection 字段不作为普通报告正文重复拼接
├─ rubricAssessment       当前规则评分（若已有）
├─ mastery                掌握度和历史观察
└─ validEvidenceRefs      event:/run:/report: 白名单
```

其中：

- 事件会保留类型、阶段、时间、分类、内容、路径、文件、代码、提示级别和 runId。
- 运行会保留可信/通过状态、断言 id/label、期望值和观察值。
- Tutor 对话优先使用服务端 `student_message` 和 `ai_response` 权威事件；无权威快照时才回退到会话快照。
- 报告草稿用于判断学生表达和结论，不把报告里的文字转成可信运行。
- 评分 Agent 的输入进一步压缩为最多 80 个事件、20 个运行和 48 条消息，以控制模型输入规模。

该 bundle 同时是行为评分与复盘简报生成的共同输入。

### 5.3 规则评分 rubric-v3.3.0

当前实现里，前四项主要依赖学生与 AI 导师的对话内容。

| 评分项              | 当前如何被观察                                               | 学生可以怎样表达                                             |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| P2:用问题或分析推进 | AI 导师收到非“直接给完整代码”类消息                          | “为什么这里切换任务前要保存 `sepc`？我准备对照上下文切换路径检查。” |
| J1:提出自己的判断   | 消息中出现自己的判断，并包含原因或预测                       | “我认为问题出在任务状态更新过晚，因为调度器再次选中了原任务。” |
| E1:引用可检查证据   | 消息提到源码、函数、输出、日志、Trace、诊断、QEMU、测试等，同时系统存在运行或诊断事件 | “依据 `kernel/src/task.rs` 的 `__switch` 调用和本次 QEMU 输出，我认为……” |
| H1:形成可证伪假设   | 消息包含假设和可观察预测                                     | “假设 `sepc` 没有正确递增，如果成立，再次运行时应该重复触发同一个 syscall；否则该假设不成立。” |
| V1:完成可信验证     | 可信 recipe/QEMU 运行通过                                    | 点击工作台的可信验证并通过断言                               |
| I1:失败后迭代并复验 | 可信失败 → 保存修改 → 再次可信运行通过                       | 先保留一次失败记录，修改并保存代码，再重新运行通过           |

这些判断具体写在 [rubric-v3.mjs (line 17)](D:/rrproject/OS/project3136859-389070/os-lab/learning/rubric-v3.mjs:17) 中。例如“提出自己的判断”目前识别“我认为、我的判断、我观察到、可能是”等表达；“形成假设”识别“假设、如果、预期”等表达。

规则层的细节包括：

- 只有观察到对应行为才计分，没有证据的项为 `unobserved`，不会凭空给满分。
- 可信运行、失败后的保存、再次可信通过会组成迭代证据链。
- 多次 Guardrail 会记录为过程风险，不能仅靠最终通过抵消。
- 规则分为 `process * 0.75 + reflection * 0.25`。
- `validEvidenceRefs` 约束规则项的 evidence refs，避免把客户端声称当成服务端事实。

### 5.4 独立 Assessment scoring Agent

`learning/assessment-agent.mjs` 中的 `scoreAssessmentBehavior()` 使用独立 Prompt 版本 `assessment-behavior-score-v1`，默认超时 120 秒，最多 300 秒。它要求输出 JSON：

```json
{
  "score": 0,
  "rationale": "...",
  "strengths": [],
  "improvements": [],
  "evidenceRefs": ["event:...", "run:..."],
  "criteria": [
    { "id": "B1", "status": "met|partial|not-met|unobserved", "rationale": "...", "evidenceRefs": [] }
  ]
}
```

行为标准 B1--B6 为：

| 标准 | 含义                                               |
| ---- | -------------------------------------------------- |
| B1   | 用自己的话提出判断、假设或机制解释。               |
| B2   | 通过概念、现象或调试问题推进，而不是索要完整答案。 |
| B3   | AI 给出提示后继续追问、检查代码或修改实现。        |
| B4   | 推进到可信运行、诊断或失败后的再次验证。           |
| B5   | 减少没有证据时重复索要完整答案。                   |
| B6   | 区分自己的判断、AI 的帮助和实际验证证据。          |

服务端规范化输出时会：

- 把 score 限制在 0--100。
- 检查所有 evidence refs 是否存在于 bundle 白名单。
- 要求有证据时至少提供有效总体引用。
- 将 criteria 固定补齐 B1--B6，缺项置为 `unobserved`。
- 限制 rationale、strengths、improvements 和 criteria 的长度/数量。
- Agent 异常、超时、非法 JSON 或非法引用时返回 `unavailable`/`timeout`，并使用规则基线。

### 5.5 分数融合

`learning/rubric-v3.mjs` 的融合权重是：

```text
ruleWeight  = 0.6
agentWeight = 0.4

Agent 有效时：
  total = round(ruleScore * 0.6 + agentScore * 0.4)

Agent 不可用时：
  total = ruleScore
```

Assessment Agent 不能改变实验验证事实，也不能单独把“口头说通过”变成可信运行。`evaluateReviewGates()` 会在规则分与 Agent 分差异大、反思满分却没有运行引用、多次答案护栏等情况下产生硬门控，供教师关注。

### 5.6 Mastery 如何更新

`learning/mastery.mjs` 将 rubric 项映射到概念：

- `os.trap.syscall-abi` 主要观察 `V1`。
- `os.sched.context-switch` 观察 `V1`、`I1`。
- `os.debug.evidence-chain` 观察 `E1`、`H1`、`V1`、`I1`。
- `os.learning.transfer` 使用 reflection 维度。

根据观察项平均分和独立成功情况生成 `proficient`、`developing` 或 `needs-support`，同时保存 evidence refs、提示级别、误解项和 confidence。当前 mastery 主要服务于后续复盘和学习访问控制；它还没有自动成为每轮 Tutor Prompt 的专门“薄弱点系统层”。

### 5.7 评价结果处理

**掌握画像**

评价结果进一步投影为概念掌握状态：

```text
proficient
developing
needs-support
```

状态综合相关 Rubric 项平均值、是否独立完成可信验证、使用过的最高提示等级、误区和证据数量，并生成置信度。当前概念投影主要覆盖 syscall ABI、上下文切换、调试证据链和迁移能力。

**异常门控与统一教师验收**

系统定义五个硬门控和三个软门控：

| 类型 | 代码 | 触发示例                              |
| ---- | ---- | ------------------------------------- |
| 硬   | `H1` | 规则基线与 Agent 评价相差 30 分及以上 |
| 硬   | `H3` | 反思满分但没有直接运行引用            |
| 硬   | `H4` | 多次触发答案护栏但过程分仍异常偏高    |
| 硬   | `H5` | 任务变体自动分与教师抽检不一致        |
| 硬   | `H6` | 学生提出错判申诉                      |
| 软   | `S1` | 迁移回答与本 Lab 证据冲突             |
| 软   | `S2` | 长期停滞后突然满分                    |
| 软   | `S3` | 报告与同班样本高度相似                |

硬门控决定 `requiresReview`，并将异常评价写入可审计队列；旧 `/teacher/reviews` 与 `review_decisions` 接口继续保留历史记录兼容。当前教师前端不再提供第二套独立“评分复核”流程，而是在“实验验收”中统一查看学生正式提交的报告、复盘记录、自动融合分和证据细项，再填写教师最终分与验收建议。自动结果保持只读，教师验收通过 `report_acceptances` 追加保存，不覆盖原始评价；教师是否已验收不参与下一 Lab 解锁。

## 4. 苏格拉底复盘：Assessment & Tutor

复盘要同时达到两个目标：问题必须**由证据驱动**（问在薄弱处，而不是随机抽题），过程必须**像教学**（学生面对的是连续、自然的引导，而不是一张考卷）。为此我们把复盘拆成三个正交问题，并按职责分离原则分配给两个 Agent：

- **测什么**（Assessment）：根据全过程行为证据识别薄弱概念、证据缺口和评价目标，产出**结构化复盘简报（brief）**，而不是完整题面。
- **怎么问**（Tutor）：利用日常答疑已有的分层 Prompt、受限 RAG、上下文构造与追问策略，把简报具象化为面向学生的苏格拉底问题，并动态追问。
- **怎么判**（Assessment）：独立读取复盘 transcript、可信运行和行为证据，逐题给出 verdict，更新反思分与掌握度。

这一分工避免了同一个 Agent 一边向学生提示答案、一边给自己的教学结果打分。完整协作链路为：

```
学生过程行为（事件 · 可信运行 · 对话 · 报告）
    ↓
Assessment Agent
证据分析、规则+Agent 融合评分、生成结构化复盘简报
    ↓ review brief（conceptId/objective/passCriteria/evidenceRefs/requiresRunEvidence + 种子题面）
Tutor Agent
以同一 Tutor 身份把简报转为面向学生的反问；verdict 未通过时生成一次有边界追问
    ↓ transcript（逐题作答、追问修正、评价事件）
Assessment Agent
独立逐题评价（verdict/缺失点/参考因果链），RQ 计分与掌握度更新
    ↓
报告与复盘联合提交 → 教师统一验收
```

### 4.1 Assessment 评估

`POST /learning/review/start` 的前置条件是当前 Lab 存在可信且通过的运行——没有验证事实就没有复盘资格。教师已完成验收的 Lab 不再复盘；存在未完成（非 `review_completed`/`deferred`）的复盘时直接恢复，不重新生成。

启动时服务端重新构建证据包（权威 Tutor 对话优先于会话快照）、重跑规则 + Agent 融合评分，然后读取最近 5 次复盘、最多 25 个历史问题交给计划生成器，产出 3--5 题的**复盘简报**。

简报可由两种模式生成：

- 有可用 Assessment Agent 时，调用 `createAssessmentReviewPlan()` 的远程 JSON Agent。
- 没有模型、模型超时或远程输出不合约时，使用 `generateDeterministicReviewPlan()`——按"证据文本匹配 + 失败断言 + 历史概念频次"排序概念目录，确定性构造同等结构的简报。

无论哪种模式，每题简报的字段契约一致：

| 字段                  | 含义             | 约束                                                         |
| --------------------- | ---------------- | ------------------------------------------------------------ |
| `questionId`          | 不可变锚点       | Tutor 不得改动；追问生成新 id（`review-followup-*`）         |
| `conceptId`           | 考查概念         | 必须属于当前 Lab 概念目录                                    |
| `kind`                | 题型             | `evidence-reflection` / `concept-explanation` / `counterexample` / `transfer` |
| `objective`           | 考查目标         | 如"确认 X 的机制理解与证据对应"                              |
| `prompt`              | **种子题面**     | 内部初稿，供 Tutor 改写；Tutor 降级时直接作为题面兜底        |
| `reason`              | 为何问           | 如"该概念关联过失败断言，需要确认学生能解释从失败到通过的证据链" |
| `passCriteria`        | 通过标准         | ≤8 条**知识要点**，不得是表达格式或叙事结构要求；只供评价使用，Tutor 不得泄露 |
| `evidenceRefs`        | 证据引用         | 必须逐字来自 `validEvidenceRefs` 白名单，≤8 条               |
| `requiresRunEvidence` | 是否要求可信运行 | 服务端强制执行（§4.2）                                       |

`normalizeReviewPlan()` 统一校验：题数 3--5、conceptId 属于当前目录、每题至少一个有效 evidence ref、questionId 唯一、远程问题不得逐字重复近期问题。

默认计划通常是 3 题，常见组成是：

1. `evidence-reflection`：让学生把机制和本次代码/运行证据对应起来。
2. `concept-explanation` 或 `counterexample`：针对薄弱概念、误解或边界解释。
3. `transfer`：改变输入、权限、调度或前置条件，要求预测哪些不变量保留、哪些实现必须变化。

面向学生的最终措辞由下一节的 Tutor 决定。

### 4.2 Tutor 出题与 Assessment 评价

**Tutor 把简报转为面向学生的问题。** 简报生成后，服务端调用 `buildReviewTutorContext()` 组装出题上下文，再由 `tutor/review-tutor.mjs` 的 `materializeTutorReviewPlan()` 完成具象化。

出题上下文直接复用日常答疑的机制栈：

- **受限 RAG**：检索词由 Lab 标签 + conceptId + objective + 种子题面构造（追问时再加入学生作答与评价缺失点），走 `retrieveTutorKnowledge()`，同样受内容类、Lab 范围与数量上限约束；
- **同一套分层 Prompt**：`frameworkFor()` 以 `reflection` 意图构建框架，策略层写明"你仍是过程答疑阶段的 Tutor Agent，沿用当前 Lab、反思策略、近期对话和受限知识上下文；只负责把内部简报转成一个面向学生的问题"；
- **身份连续**：系统提示要求"以同一个 EVOLVE Tutor Agent 的身份主持终期苏格拉底复盘"，题目应承接近期 Tutor 对话，避免重复历史题目；
- **白名单**：可信证据标识仅限简报中的 `evidenceRefs`，知识引用仅限本轮召回 chunk 的 citation，并附最近对话作为改写参考。

Tutor 的改写受四条硬约束，任一违反都会整体回退到 Assessment 种子题面：

1. **不得增删换题**：返回题数必须等于简报数，`questionId` 必须一一对应；
2. **不得泄露评分标准**：系统提示禁止泄露 `passCriteria`、评分标准、得分点或 Assessment 内部推理，输出再经正则检测；
3. **输出受教学护栏**：题面过 `enforceTutorOutput()` 的证据/知识引用白名单校验（同 §1.5）；
4. **题面不得重复**：题面规范化（空白折叠 + 小写）后与历史题集合比对，重复即回退。

**学生作答与 Assessment 独立评价。** `POST /learning/review/answer` 要求学生回答当前显示的第一个未回答问题（≤8000 字符）；已提交的回答不能被覆盖。

服务端重建证据包后调用 `evaluateAssessmentReviewAnswer()`：

- 远程 Agent 有效时使用 JSON 评价；没有 Agent 时使用确定性评价：按 `passCriteria` 关键词匹配、检查证据要求、生成缺失点和参考因果链。
- verdict 只能是 `passed`、`partial`、`needs-evidence`、`misconception`、`defer`。
- 只根据回答是否体现正确的**机制理解**判定，不评价表达方式或叙事顺序；学生不需要先复述自己曾经的错误判断。
- 未通过不能只返回"缺少关键因果"：评价必须给出具体缺失点（`missingPoints`）、缺失证据（`missingEvidence`）和完整的参考因果链（`correctReasoning`/`correctiveExplanation`）。
- `evidenceRefs` 必须在白名单内；口头回答不能覆盖可信运行。
- **`requiresRunEvidence` 由服务端强制执行**：即使模型判 `passed`，若题目要求可信运行而证据中没有 `trusted && verified` 的 run，强制降级为 `needs-evidence`（"模型判断不能覆盖本题要求的可信运行证据"）。

### 4.3 追问和 5 题上限

若 verdict 为 `partial`、`misconception` 或 `needs-evidence`，进入追问链路：

1. **Assessment 先生成追问简报**：`reviewFollowupQuestion()` 基于原题与评价构造新简报——继承原题的 `objective`（或评价给出的 `followUpObjective`）、`passCriteria` 与 `evidenceRefs`；`needs-evidence` 时把 `requiresRunEvidence` 升级为真，并把题型换为 `evidence-reflection`，引导学生把已有可信运行与判断对应起来。
2. **Tutor 再具象化追问**：`materializeTutorReviewQuestion()` 的上下文额外包含学生本次作答与 Assessment 评价反馈（缺失点、缺失证据、追问目标），使追问直指刚才的回答，而不是另起一个新话题。追问同样受 §4.2 的四条硬约束。

追问边界由服务端规则决定，不依赖 Agent 自觉：

- 当前主问题最多生成一次澄清/补证据追问（有 `parentTurnId` 的追问不再追问）。
- 追问计入同一个复盘的总题数；`updated.turns.length < updated.maxQuestions` 且 `< 5` 时才允许插入追问。
- 追问仍然必须复用有效概念和 evidence refs。
- 一次追问失败后，系统会继续处理下一个主问题或在达到上限后结束，不会无限循环。

当所有问题都回答且至少完成 3 次作答时，服务器生成 `review_completed` 和 `review_reflection_assessed` 事件。复盘表现会按首答通过、追问后通过、已回答但仍可完善等状态形成结构化链条，进入 Rubric 的 `RQ1--RQn` 计分（首答完成 2 分、一次追问后完成 1 分、仍可完善 0 分），供教师端查看。

若答案需要可信运行但当前只有口头解释，状态会进入 `awaiting_evidence`，可通过 `/learning/review/resume` 在补充可信运行后继续；没有办法补证据时可以 `deferred`。`deferred` 保留完整 transcript，可以提交报告，但不会凭空生成掌握证据，也不会自动解锁下一实验。

### 4.4 复盘是否会重复

复盘问题不是固定三题模板，去重发生在两层：

**计划层（Assessment 简报）**

- 概念排序会参考历史已问概念的频次，优先覆盖未问概念；
- 同一概念可在 evidence reflection、counterexample、transfer 等题型之间轮换（`questionVariant` 按历史选择变体）；
- 远程 Agent 生成的原题若命中历史原文，`validatePlanNovelty()` 直接拒绝并退回确定性计划。

**题面层（Tutor 改写）**

- Tutor 改写后的题面同样做规范化去重，命中即回退种子题面——即使 Assessment 换了措辞，Tutor 也不会产出与历史逐字相同的题面。

因此，两次复盘可能命中同一薄弱概念，但题型、情境或具体证据应发生变化；如果实际界面仍显示逐字相同问题，应检查服务端读取的 `reviewHistory`、sessionId 是否复用，以及前端是否错误复用了旧 review，而不是把固定问题当成设计目标。

## 5. Harness 工程体系

Harness 的作用是验证契约和安全边界，不是替代真实大模型，也不把一条测试回复当成教学质量的全部证明。当前 `handbook/package.json` 将主要 Harness 纳入 `npm test`，并提供独立 CLI。

### 5.1 Tutor Harness

实现：`tutor/harness.mjs`、`tutor/harness-cli.mjs`、`tutor/harness.test.mjs`、`tutor/fixtures/harness-cases-v1.json`。

当前 fixture 为 34 个跨类别用例，覆盖答案安全、证据门控、错误假设、冲突、失败模式、阶段边界、学习轨迹、长上下文和阶段不变性。

Harness 对每个适配器结果检查：

- 返回意图是否与预期相关。
- 必需教学动作是否存在。
- 是否出现完整答案或 patch 泄漏。
- 引用是否属于测试用例证据白名单。
- `mastered`、`passed`、`correct`、`incorrect` 等判断是否有证据。
- 一轮是否最多一个问题。
- 同一个 `invarianceGroup` 在不同存储阶段下是否保持同一响应类别。

默认阈值为：答案泄漏率不超过 0.05，问题相关性至少 0.85，指导动作准确率至少 0.85，证据引用准确率至少 0.90，阶段不变性至少 0.95，无证据判断率为 0，单问题率至少 0.90。

这里的 `stageInvarianceRate` 不是旧意义上的“阶段回答准确率”。它专门用来防止同一个学生问题因为客户端携带了不同 stage 就产生完全不同的教学意图。

**复盘出题（Tutor 侧）契约**由 `tutor/review-tutor.test.mjs` 固化，当前 4 个用例分别验证：

- Tutor 具象化不得改变 Assessment 简报的评分契约（题数与 questionId 一一对应）；
- Tutor 擅改 id 或伪造证据引用时，整体回退到 Assessment 种子题面；
- 追问必须基于学生本次作答与**独立** Assessment 反馈生成；
- 拒绝与历史重复的题面，以及泄漏评分用语（passCriteria/评分标准/得分点）的题面。

HTTP Smoke（§5.5）进一步在真实链路上断言复盘响应的 `agents.assessment.role === 'assessment'`、`agents.tutor.role === 'tutor'` 及其运行模式，保证双 Agent 归因不回退。

### 5.2 RAG Harness

实现：`tutor/rag-harness.mjs`、`tutor/rag-harness-cli.mjs`、`tutor/rag-harness.test.mjs`、`tutor/fixtures/rag-harness-cases-v1.json`。

当前 fixture 为 6 个用例，覆盖 Lab2 Trap、Lab3 SV39、直接答案 Guardrail、embedding 失败降级、Lab1 启动和 Lab4 fork/wait 等检索情境。

它不要求模型写出某个固定答案，而检查：

- stage 是否在允许集合内。
- chunk 数量满足 min/max，最多 5 个。
- 当前 Lab 之外的 global-only chunk 最多 2 个。
- 只出现允许的 content class。
- citation、sourceId、sourceTitle、sectionPath、contentClass、labScopes 元数据完整。
- 必需/禁止来源、Lab scope 和内容类是否满足。
- 有 chunk 时 Prompt 是否包含 `<knowledge-chunk>`。
- 直接答案场景是否保持空知识上下文。
- lexicalCandidates、vectorCandidates、eligibleChunks 和 fallbackReason 是否与检索诊断一致。

默认 RAG 上限是 `maxKnowledgeCount=5`、`maxGlobalCount=2`。Embedding 服务不可用时，Harness 要求有明确 `fallbackReason`，并验证词法结果仍然可用。

### 5.3 Assessment Harness

实现：`learning/assessment-harness.mjs`、`learning/assessment-harness-cli.mjs`、`learning/assessment-harness.test.mjs`、`learning/fixtures/assessment-harness-cases-v1.json`。

当前 fixture 包含两个证据 bundle：`lab2-full` 和 `lab2-no-verified`，共 5 个用例：3 个 plan/answer 方向的计划与评价契约，另有不同答案情形用于验证。Harness 将用例分为两类：

**计划用例检查：**

- 题数为 3--5。
- 包含要求的题型。
- conceptId 属于当前目录。
- 每题有合法 evidence refs。
- 不强迫固定回顾叙事。
- 不复用历史逐字问题。

**答案用例检查：**

- verdict 是否落在预期集合。
- evidence refs 是否真实存在。
- 没有可信运行时不能判 `passed`。
- 未通过时必须给出 missing point/evidence 和 corrective explanation。

阈值全部是硬契约：计划有效率、计划新颖率、叙事中立率、verdict 准确率和可操作反馈率为 1；非法引用率和无依据通过率为 0。

### 5.4 Prompt Eval V2/V3

实现：`tutor/prompt-eval/scoring-v2.mjs`、`scoring-v3.mjs`、`run-eval.mjs`。它会临时创建数据库和学生工作区，启动 Tutor Server，按 Lab/stage 或 V3 intent corpus 回放，然后保存 JSON/Markdown scorecard。

- V2 更偏向流水线、答案安全、回复质量和 RAG 质量，权重为 pipeline 0.20、safety 0.20、replyQuality 0.35、ragQuality 0.25。
- V3 默认使用 `cases-v3.json` 的 19 个用例，覆盖 8 个 Lab 的 intent/stage 组合和证据冲突场景。
- V3 维度为 `questionRelevance`、`guidanceCorrectness`、`necessaryExplanation`、`actionability`、`noLeak`、`evidenceFidelity`，综合分取维度平均值。
- V3 的问题数、文本长度、代码行数只作为诊断项；V3 不再把“必须说出某个阶段关键词”当作主要质量指标。
- `--ablate` 可生成完整 Prompt 与基线 Prompt 的差值；`--replay` 可对已有原始记录重新评分。

默认运行目标是不可达上游，以检验离线 Tutor fallback；要评估真实模型链路必须显式传入可访问的 OpenAI-compatible upstream。

### 5.5 HTTP Smoke、Node test 和构建

`handbook/tutor-server.smoke.mjs` 覆盖真实 HTTP/SQLite 链路，包括：登录、工作区运行、Trace、Tutor 对话、知识上传/发布、复盘、报告提交、教师验收、备份以及跨用户访问控制。它还验证：

- 报告未完成复盘时被拒绝。
- 复盘完成或 deferred 后可以提交。
- 复盘总题数不超过 5。
- 教师能看到学生提交后的报告和复盘。
- 自动分和教师最终验收分同时保留。
- 可信运行和 evidence refs 不能由客户端伪造。

常用命令：

```powershell
cd os-lab/handbook
npm test
npm run test:harness
npm run test:assessment-harness
npm run test:rag-harness
npm run test:rag-harness:cli
npm run test:smoke
npm run build
```

`npm run build` 同时验证 VitePress 前端和服务端代码所需的文档/静态资源构建；`git diff --check` 用于检查文档和代码的空白错误。

# 附录E：Lab1实验手册

## 实验 1：裸机启动与最小内核

> 相关教材理论：
>
> [第 2 章 · 操作系统介绍（P16）](/downloads/ostep-zh.pdf#page=16)
>
> [第 6 章 · 机制：受限直接执行（P49）开头引言部分](/downloads/ostep-zh.pdf#page=49)

## 一、问题场景

OSTEP 从**虚拟化、并发和持久性**三条主线展开操作系统原理，但这些内容都隐含了一个基本前提：**内核已经被加载到内存，并且正在正常运行**。

那么，在操作系统尚未运行时，内核本身是如何启动的？内核映像由谁放入内存？处理器从哪条指令开始执行？没有现成的标准库和系统调用，内核又如何输出字符并结束运行？

在编写普通 Rust/C 应用程序时，我们通常只关注如下过程：

```
main → 输出信息 → 程序退出
```

但在这条看似简单的执行路径背后，操作系统、程序加载器和语言运行时已经完成了大量工作：

```
操作系统加载程序
→ 语言运行时初始化执行环境
→ 运行时调用 main
→ 程序通过系统调用请求输出
→ 操作系统回收进程资源
```

因此，`main`、标准输出和程序退出都不是程序天然具备的能力，而是建立在既有操作系统和运行时环境之上的抽象。内核启动时其实不存在一个更高层的操作系统来提供这些服务。

本实验希望你借助 QEMU 和 OpenSBI，显式建立一条属于你自己的最小内核运行链路。

普通应用程序与本实验内核的运行过程可以对照如下：


| 执行环节   | 普通应用程序                                         | 本实验中的内核                                         |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------ |
| 程序装载   | 操作系统加载器将程序装入进程地址空间                 | QEMU 按启动约定将内核映像放置到 `0x80200000`           |
| 控制权移交 | 语言运行时完成初始化后调用 `main`                    | OpenSBI 完成固件初始化后跳转到内核入口 `_start`        |
| 字符输出   | `println!` 最终通过系统调用请求操作系统输出          | 内核执行 `ecall`，通过 SBI 控制台服务请求 OpenSBI 输出 |
| 程序结束   | 程序调用 `exit` 或从 `main` 返回，由操作系统回收资源 | 内核通过 SBI System Reset 服务请求 QEMU 关机           |


也即本实验需要解决的**四个核心问题**：

- 内核映像如何装入内存？
- 处理器如何进入内核入口？
- 内核如何输出字符？
- 内核如何结束运行？

**实验目标**：在 QEMU RISC-V 平台上启动一个最小内核，使其输出 `Hello, OS!`，随后通过 SBI 正常关闭虚拟机。实验将由此建立最基本的内核启动和固件调用路径，为后续 Lab2–8 中的异常与中断、虚拟内存、进程管理和文件系统等内容提供统一的运行基础。

## 二、背景知识

上节列出的本实验需要解决的四个核心问题共同构成了一个最小内核从固件获得控制权，到完成第一次输出并主动关机的完整启动链。后续实验中的异常处理、虚拟内存、进程管理和文件系统，都是在这条启动链已经建立的基础上继续扩展的。

### 2.1 内核映像如何装入内存

在 OSTEP 中，“程序由操作系统加载到内存”通常描述的是操作系统已经运行之后的场景。对于 Lab1我们想要实现的内核本身就是第一个需要被加载和启动的程序，因此不能假设已经存在一个更高层的操作系统来完成这项工作。

本实验使用 QEMU 模拟 RISC-V `virt` 平台，并由 OpenSBI 提供机器模式下的固件环境。在当前启动配置中，QEMU 按约定将内核映像放置到物理地址 `0x80200000`，OpenSBI 完成必要的固件初始化后，将控制权移交给该地址处的内核入口。

这里需要区分不同角色：


| 组件         | 主要职责                                                     |
| ------------ | ------------------------------------------------------------ |
| QEMU         | 模拟处理器、内存和外设，并按照启动参数放置内核映像           |
| OpenSBI      | 在 M-mode 中运行，初始化平台，提供 SBI 服务，并将控制权移交给内核 |
| 操作系统内核 | 在 S-mode 中运行，建立自身的执行环境并实现后续操作系统功能   |


因此，`0x80200000` 是固件、QEMU 和内核之间的启动约定，而不是 RISC-V 架构规定的唯一地址。内核必须通过链接脚本使用相同的地址：

```
BASE_ADDRESS = 0x80200000;
```

### 2.2 处理器如何进入内核入口

RISC-V 使用特权级区分不同软件组件能够执行的操作。本实验涉及以下三个特权级：


| 特权级 | 名称     | 本实验中的执行者     | 作用                             |
| ------ | -------- | -------------------- | -------------------------------- |
| U-mode | 用户模式 | 后续实验中的用户程序 | 执行受限制的用户代码             |
| S-mode | 监督模式 | 操作系统内核         | 管理用户程序和系统资源           |
| M-mode | 机器模式 | OpenSBI 固件         | 执行最底层的平台初始化和固件服务 |


处理器复位后首先在 M-mode 中执行 OpenSBI，而不会直接从 Rust 的 `main` 函数开始运行。OpenSBI 完成初始化后，按照启动约定跳转到 `0x80200000`，此时内核在 S-mode 中开始执行。

```mermaid
graph TD
    ROM["复位入口 M-mode"] --> OpenSBI["OpenSBI 固件"]
    OpenSBI -->|"加载并跳转到 0x80200000"| Kernel["内核 S-mode"]
    OpenSBI -.->|"SBI 调用 ecall"| Kernel
```



内核从 `_start` 运行：首先完成启动栈设置，然后调用Rust函数 `rust_main`，此时已在 S-mode。

设置栈是进入高级语言代码之前的**必要步骤**，因为函数调用、局部变量和寄存器保存都依赖有效的栈空间。（kernel/src/entry.asm）

```asm
_start:
    la sp, boot_stack_top
    call rust_main
```

但是，拥有栈并不意味着 Rust 所依赖的全部初始条件都已经满足。普通 Rust 应用程序启动时，语言运行时和操作系统加载器通常已经完成了内存段初始化；裸机内核不能直接假设这些工作已经完成。

内核通过以下 crate 级属性声明自己的运行环境（kernel/src/main.rs）：

```rust
#![no_std]
#![no_main]
```

- `#![no_std]` 表示不链接依赖操作系统的 Rust 标准库，只使用 `core` 等不依赖 OS 的基础功能；
- `#![no_main]` 表示不使用编译器默认的 `main` 入口，而是由链接脚本指定汇编入口 `_start` 建立执行环境后，显式调用 `rust_main`。

除此之外，内核还必须初始化 `.bss` 段。

`.bss` 段保存未显式初始化，或者初始值为零的全局变量和静态变量。例如：

```
static mut COUNTER: usize = 0;
```

这类变量的初始值通常不会作为大量零字节直接存储在内核映像中。链接脚本只记录相应内存区域的位置和大小，程序启动时再由加载器或启动代码将其清零。

在普通应用程序中，这项工作通常由操作系统加载器完成；在本实验中，内核需要自行完成。Rust 假定静态变量初值合法。BSS 未清零就读，可能乱码、死循环或 panic。`println!` 的实现可能间接用到 BSS 中的静态状态，因此 `rust_main` 第一件事是 `clear_bss()`——把 `[sbss, ebss)` 逐字节写 0，等价于加载器在进程启动时做的初始化。

```rust
pub extern "C" fn rust_main() -> ! {
    clear_bss();
    console::init();
}
```

`clear_bss()` 使用链接脚本导出的 `sbss` 和 `ebss` 符号，将下面的内存区间清零：

```
[sbss, ebss) → 0
```

需要注意，BSS 清零并不是为了专门支持 `println!`。它是在执行一般 Rust 内核代码之前建立正确的全局和静态变量初始状态。本实验的控制台实现即使没有直接使用 BSS，后续模块仍可能依赖其中的静态数据，因此内核应当在其他初始化和功能代码之前完成这一工作。

于是，从汇编入口进入 Rust 环境的过程可以概括为：

```
_start
→ 设置启动栈
→ 调用 rust_main
→ 清零 BSS
→ 初始化内核模块
→ 执行内核功能
```

### 2.3 内核如何输出字符

普通 Rust 程序中的 `println!` 依赖标准库和操作系统提供的标准输出。内核使用 `#![no_std]` 后，不再拥有由 `std` 提供的文件 I/O、终端和内置标准输出，因此必须自行实现最小的输出路径。此外，本实验调用的 SBI 控制台服务 `console_putchar` 一次只能传递一个字符参数，而不能直接传递一个字符串。

因此本实验的输出链实现如下：

首先`kernel/src/console.rs` 使用 `core::fmt::Write` 完成格式化，将格式化后的字符串拆分为一个个字节，再调用 `os_sbi::console_putchar` 输出：

```
for byte in s.bytes() {
    os_sbi::console_putchar(byte);
}
```

由于`console_putchar` 并不是由硬件直接提供的普通 Rust 函数。OpenSBI 对外提供的是一套基于寄存器和 `ecall` 指令的调用约定。内核必须先把服务编号和参数放入指定寄存器，再执行 `ecall`，OpenSBI 才能识别并处理该请求。

所以为了避免控制台代码直接处理内联汇编、寄存器分配和 SBI 功能号，本实验在 `os-sbi/src/lib.rs` 中将这套底层协议封装成普通 Rust 函数：

```rust
pub fn console_putchar(ch: u8) {
    unsafe {
        core::arch::asm!(
            "ecall",
            in("a7") SBI_LEGACY_CONSOLE_PUTCHAR,
            in("a0") ch as usize,
            in("a6") 0usize,
            lateout("a0") _,
        );
    }
}
```

这样，上层控制台模块只需要调用`os_sbi::console_putchar(byte)`而不需要关心 `a0`、`a6`、`a7` 分别保存什么，也不需要在多处重复编写 `unsafe` 汇编代码。

请仔细理解这里“对 SBI 调用进行封装”的含义：**将底层的寄存器调用约定转换成上层可以直接使用的 Rust 函数接口**。

本实验使用的是传统的 Legacy SBI 控制台输出服务。执行调用时：


| 寄存器或指令 | 本实验中的作用                                    |
| ------------ | ------------------------------------------------- |
| `a7`         | 保存 Legacy SBI 功能号；控制台输出的功能号为 `1`  |
| `a0`         | 保存待输出的字符字节                              |
| `a6`         | Legacy 调用不使用该寄存器；本实验将其显式置为 `0` |
| `ecall`      | 产生环境调用异常，使处理器进入固件的异常处理流程  |


需要特别注意，`ecall` 本身并不表示“输出字符”，处理器也不理解 SBI 的功能号。对处理器而言，`ecall` 只是一次环境调用异常。真正解释寄存器内容的是 OpenSBI。

在本实验的启动环境中，执行过程如下：

```
S-mode 内核准备寄存器
→ 在 a7 中写入控制台功能号
→ 在 a0 中写入待输出字节
→ 执行 ecall
→ 处理器产生来自 S-mode 的环境调用异常
→ OpenSBI 在 M-mode 中接管该异常
→ OpenSBI 读取 a7 和 a0
→ OpenSBI 识别出控制台输出请求
→ OpenSBI 调用平台控制台实现
→ QEMU 将字符显示到宿主机终端
→ OpenSBI 返回 S-mode
→ 内核继续输出下一个字节
```

因此，内核不是通过 `ecall` 直接写入 UART 寄存器。`ecall` 只负责把控制权交给 OpenSBI；实际的平台控制台访问由 OpenSBI 完成。

本实验实现的是“通过 SBI 请求固件输出”，尚未实现 UART 设备驱动。如果后续内核直接读写 UART 的 MMIO 寄存器，输出路径会变成：

```
内核
→ 读写 UART MMIO 寄存器
→ QEMU 模拟 UART
→ 宿主机终端
```

此时 UART 输出不再需要通过 SBI 和 OpenSBI，进一步减少对固件服务的依赖。

### 2.4 内核如何结束运行

普通应用程序从 `main` 返回，或者调用 `exit` 后，由操作系统负责回收进程资源。裸机内核没有更高层的操作系统负责回收，因此必须显式请求虚拟机结束运行。

本实验通过 SBI 的关机服务完成这一操作：

```
os_sbi::shutdown();
```

该函数执行 `ecall`，将关机功能号传递给 OpenSBI。OpenSBI 处理请求后，QEMU 退出，终端命令正常返回。

由于关机调用不会返回，`rust_main` 被声明为：

```
pub extern "C" fn rust_main() -> !
```

其中 `!` 表示该函数永不返回。内核启动完成后只有两种预期结果：

```
正常运行 → 输出信息 → 请求关机
异常发生 → panic 处理 → 请求关机
```

如果 `rust_main` 在没有明确后继执行路径的情况下返回，内核就无法像普通应用程序那样回到一个由操作系统提供的调用者。

### 2.5 从上电到关机的完整执行链

```mermaid
sequenceDiagram
    participant QEMU
    participant SBI as OpenSBI
    participant ASM as _start
    participant Rust as rust_main
    participant Console as console.rs
    participant OSBI as os-sbi

    QEMU->>SBI: 处理器复位，进入 M-mode
    QEMU->>SBI: 按启动约定放置内核映像
    SBI->>ASM: 跳转到 0x80200000，进入 S-mode
    ASM->>ASM: 设置 sp = boot_stack_top
    ASM->>Rust: call rust_main
    Rust->>Rust: clear_bss()
    Rust->>Console: println!("Hello, OS!")
    Console->>OSBI: 逐字节调用 console_putchar
    OSBI->>SBI: ecall 请求 SBI 控制台服务
    SBI-->>QEMU: 输出字符到虚拟控制台
    Rust->>OSBI: shutdown()
    OSBI->>SBI: ecall 请求关机
    SBI-->>QEMU: 结束虚拟机运行读代码时可对照三个问题：
```



本实验的意义不只是输出一行字符串，而是建立了后续操作系统实验所依赖的几项基本约定：

```
内核装载地址
→ 入口符号
→ 启动栈
→ BSS 初始化
→ 特权级之间的服务请求
→ 内核主动结束运行
```

后续 Lab2 及之后的系统调用，仍然采用**低特权级通过** `ecall` **请求高特权级服务**的基本思想，只是请求者由本实验的 S-mode 内核变为用户程序，服务者由 M-mode 的 OpenSBI 变为 S-mode 的操作系统内核。

## 三、实验任务

本实验主要相关文件：


| 文件                    | 角色                                     | 阅读时重点确认                    |
| ----------------------- | ---------------------------------------- | --------------------------------- |
| `kernel/src/entry.asm`  | 汇编入口：设栈、`call rust_main`         | 第一条指令为何不能直接进入 Rust   |
| `kernel/src/main.rs`    | `#![no_std]` / `clear_bss` / `rust_main` | BSS 初始化为何早于任何格式化输出  |
| `os-sbi/src/lib.rs`     | SBI `ecall` 封装（输出、关机）           | `a7` 与 `a0` 如何表达功能号和参数 |
| `kernel/src/console.rs` | `println!` 包装                          | 如何把格式化文本拆成逐字符输出    |
| `kernel/linker.ld`      | 链接地址 `0x80200000`                    | 链接地址如何与固件跳转地址一致    |


### 任务一：跑通内核

确认环境已激活，运行以下命令可输出版本号：

```
rustc --version
qemu-system-riscv64 --version
```

运行实验：

```powershell
cargo run -p kernel --features lab1
# 或用 Makefile 封装
make run
```

**预期输出**：屏幕会先刷出**OpenSBI 启动日志**（平台信息、HART 信息等），最后两行是你的内核输出：

```text
OpenSBI v1.7
   ____                    _____ ____ _____
  ...（OpenSBI 平台/HART 日志，可忽略）...
Boot HART MEDELEG           : 0x0000000000f4b509
Hello, OS!                              ← 你的内核从这里开始输出
EVOLVE kernel lab1 is running on QEMU virt.
```

**通过标准**：看到 `Hello, OS!` 且 QEMU 自动退出（终端命令返回，没有卡住或报错）。

### 任务二：阅读理解

1. `_start` 为什么要先 `la sp, boot_stack_top` 再 `call rust_main`？如果没有合法栈，函数调用会先破坏什么？
2. 对照 `main.rs`，解释 `clear_bss()` 为何必须在 `println!` 之前。
3. 对照 `os-sbi/src/lib.rs`：输出字符时 `a7`/`a0` 各放什么？关机是否复用同一条 `ecall` 指令？
4. OpenSBI 在启动阶段与运行阶段分别做什么？哪些职责在未来会被内核驱动取代？
5. `#![no_std]` 与 `#![no_main]` 各解决什么问题？去掉其中任意一个时，编译或启动链会在哪里断开？

### 任务三：动手修改

**修改 1：换一句欢迎语**

找到main文件中默认输出欢迎文字的代码部分，将欢迎语改成输出你自己的学号或名字，例如：

```rust
println!("Hello, OS! 我是 xxx");
```

- 通过标准：`cargo run` 后屏幕显示出你改的文字，且内核仍正常退出。

**修改 2：观察链接地址错误的后果**

在 `linker.ld` 里把 `BASE_ADDRESS = 0x80200000;` 改成 `BASE_ADDRESS = 0x88000000;`，然后 `cargo clean && cargo run`。

- 预期现象：QEMU 启动后立即报错退出，例如 `qemu-system-riscv64: No enough memory to place DTB after kernel/initrd`，进程 exit code 非 0。
- 通过标准：观察到上述崩溃现象，用自己的话解释**为什么**
- **做完务必改回并** `cargo clean && cargo run` **确认恢复正常**。

> ⚠️ 不要改成 `0x80100000` 这种离 `0x80200000` 太近的值——因为 lab1 内核镜像很小（几十 KB），`0x80100000` 与 `0x80200000` 相差仅 1MB，OpenSBI 跳转后仍可能落在内核镜像范围内，加上 RISC-V 的 PC 相对寻址，内核**可能照常运行**，你就观察不到崩溃了。要用 `0x88000000` 这种远离的值才能稳定复现。

**修改 3：调整启动栈大小**

当前 `entry.asm` 里是 `.space 4096 * 64`（256KB）。把它改成 `.space 4096 * 4`（16KB），`cargo run` 观察是否仍正常。

- 通过标准：lab1 这种简单内核 16KB 栈够用，应仍能正常输出和退出。解释「为什么改小也能跑」（lab1 没有深层函数调用、也没有很大的局部变量）。
- **做完务必改回并** `cargo clean && cargo run` **确认恢复正常**。

## 四、验证命令


| 验证项           | 命令                                                   | 通过标准                                                    |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| 主编译           | `cargo check -p kernel --features lab1`                | 无 error                                                    |
| QEMU             | `cargo run -p kernel --features lab1 --release`        | `Hello, OS!`、`EVOLVE kernel lab1 is running on QEMU virt.` |
| 组件单测（可选） | `cargo test -p os-sbi --target x86_64-pc-windows-msvc` | 2 项通过                                                    |

