# 参考实验环境拉取与基础测试报告

## 1. 参考仓库

本轮拉取的参考实验环境：

```text
repo: https://github.com/rcore-os/tg-rcore-tutorial.git
branch: test
commit: d6330a6db1f81c8c1cfba5ec3db9923199398f24
local path: reference/tg-rcore-tutorial
```

根据参考仓库 README，赛题要求中的 5 个基础实验章节为：

```text
tg-rcore-tutorial-ch3
tg-rcore-tutorial-ch4
tg-rcore-tutorial-ch5
tg-rcore-tutorial-ch6
tg-rcore-tutorial-ch8
```

## 2. 测试环境

测试前在仓库根目录激活本机 D 盘实验环境：

```powershell
. .\scripts\activate-os-env.ps1
```

关键工具版本：

```text
rustc 1.96.0
cargo 1.96.0
QEMU 11.0.50
tg-rcore-tutorial-checker 0.4.8
```

## 3. 测试结果

| 章节 | 测试类型 | 结果 | 关键通过项 |
| --- | --- | --- | --- |
| ch3 | base | 通过 | `Test write A/B/C OK!`，未出现 `FAIL: T.T` |
| ch4 | base | 通过 | `Test write A/B/C OK!`、`Test sbrk almost OK!` |
| ch5 | base | 通过 | `forktest pass.`、子进程退出码匹配、未出现失败标记 |
| ch6 | base | 通过 | `file_test passed!`，并继承前序章节基础测例通过 |
| ch8 | base | 通过 | `pipetest passed!`、同步/互斥/条件变量/线程相关测例通过 |

## 4. 实际执行命令

ch3：

```powershell
cd .\reference\tg-rcore-tutorial\tg-rcore-tutorial-ch3
. ..\..\..\scripts\activate-os-env.ps1
cargo build
bash -lc "cargo run 2>&1 | tg-rcore-tutorial-checker --ch 3"
```

ch4：

```powershell
cd .\reference\tg-rcore-tutorial\tg-rcore-tutorial-ch4
. ..\..\..\scripts\activate-os-env.ps1
bash -lc "cargo run 2>&1 | tg-rcore-tutorial-checker --ch 4"
```

ch5：

```powershell
cd .\reference\tg-rcore-tutorial\tg-rcore-tutorial-ch5
. ..\..\..\scripts\activate-os-env.ps1
bash -lc "cargo clean; export CHAPTER=-5; cargo run 2>&1 | tg-rcore-tutorial-checker --ch 5"
```

ch6：

```powershell
cd .\reference\tg-rcore-tutorial\tg-rcore-tutorial-ch6
. ..\..\..\scripts\activate-os-env.ps1
bash -lc "cargo clean; export CHAPTER=-6; cargo run 2>&1 | tg-rcore-tutorial-checker --ch 6"
```

ch8：

```powershell
cd .\reference\tg-rcore-tutorial\tg-rcore-tutorial-ch8
. ..\..\..\scripts\activate-os-env.ps1
bash -lc "cargo clean; export CHAPTER=-8; cargo run 2>&1 | tg-rcore-tutorial-checker --ch 8"
```

## 5. 注意事项

- 在 Windows Git Bash 环境中，参考仓库 `test.sh` 中的 `tee /dev/stderr` 会报 `No such file or directory`，导致脚本整体返回失败。
- 该问题不代表内核测试失败；本轮通过等价的 `cargo run | tg-rcore-tutorial-checker` 管线完成了输出判定。
- ch5、ch6、ch8 的基础测试需要设置 `CHAPTER=-5`、`CHAPTER=-6`、`CHAPTER=-8`，否则可能进入不符合基础测试预期的交互式运行路径。
- 本轮只验证参考仓库基础模式，不运行 `exercise` 测试；`exercise` 需要完成对应章节练习实现后再作为作业验证入口。
