# 参考实验环境基础测试报告

本文记录赛题参考仓库 `tg-rcore-tutorial` 在锁定基线下的 **base 模式** 测试结果。练习（exercise）实现与 checker 结果见 [reference-practice-report.md](reference-practice-report.md)。

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

环境安装与激活见 [environment_setup.md](environment_setup.md)。

## 3. 测试结果

| 章节 | 测试类型 | 结果 | checker |
| --- | --- | --- | --- |
| ch3 | base | 通过 | 4/4 |
| ch4 | base | 通过 | 6/6 |
| ch5 | base | 通过 | 14/14 |
| ch6 | base | 通过 | 15/15 |
| ch8 | base | 通过 | 22/22 |

各章关键通过项：ch3 `write A/B/C`；ch4 含 `sbrk`；ch5 `forktest` 与子进程退出码；ch6 `file_test`；ch8 `pipetest` 及同步原语相关测例。

## 4. 复现说明

在已激活实验环境的终端中，进入对应章节目录，将 `cargo run` 输出管道至 `tg-rcore-tutorial-checker --ch <N>` 进行判定。ch5、ch6、ch8 须设置 `CHAPTER=-5`、`-6`、`-8` 后重新编译运行；完整命令与环境变量说明见 [reference-practice-report.md §1](reference-practice-report.md)。

参考仓库未纳入 Git（体积较大），可按 [reference-patches/README.md](../reference-patches/README.md) clone 基线后应用练习补丁。
