# os-lab 实验材料

学生向教学材料统一放在本目录。结构如下：

```text
labs/
├── README.md                 # 本说明
├── overview.md               # 实验总览与知识地图
├── lab1-bare-metal.md … lab8-thread-sync.md
└── answers/                  # 参考答案（对应各 Lab【任务二】）
    ├── README.md
    └── lab1-answers.md … lab8-answers.md
```

## 怎么用

1. 从 [overview.md](overview.md) 或手册 [入门指南](../handbook/guide/start.md) 开始。
2. 按顺序阅读 `labN-*.md`：问题场景 → 背景知识 → 实验任务。
3. 【任务一】跑通验证；【任务二】先独立作答；【任务三】按需动手修改。
4. 对照 `answers/labN-answers.md` 查看【任务二】参考答案与代码解读。

> 不再单独提供 `exercises/` 文字习题目录；阅读理解题即各实验文档中的【任务二】。  
> Lab6–8 须使用 `make test-lab6` / `test-lab7` / `test-lab8`（带 VirtIO），详见各实验文档。
