# 参考环境练习补丁（30%）

本目录收录赛题参考环境 **5 章 exercise** 相对于官方基线的源码差异，供评审方在不 clone 完整 `reference/` 目录（约 1.5GB）时直接审阅练习实现。

## 基线版本

| 项 | 值 |
| --- | --- |
| 上游仓库 | https://github.com/rcore-os/tg-rcore-tutorial |
| 分支 | `test` |
| 基线 commit | `d6330a6db1f81c8c1cfba5ec3db9923199398f24` |

## 补丁清单

| 补丁 | 章节 | 涉及文件 |
| --- | --- | --- |
| [ch3-exercise.patch](ch3-exercise.patch) | ch3 `sys_trace` | `tg-rcore-tutorial-ch3/src/task.rs`、`main.rs` |
| [ch4-exercise.patch](ch4-exercise.patch) | ch4 `mmap`/`munmap` | `tg-rcore-tutorial-ch4/src/main.rs`、`process.rs` |
| [ch5-exercise.patch](ch5-exercise.patch) | ch5 `spawn` + stride | `tg-rcore-tutorial-ch5/src/main.rs`、`process.rs`、`processor.rs` |
| [ch6-exercise.patch](ch6-exercise.patch) | ch6 硬链接 + `fstat` | `tg-rcore-tutorial-ch6/src/main.rs`、`process.rs`、`fs.rs`；`tg-rcore-tutorial-easy-fs/src/vfs.rs` |
| [ch8-exercise.patch](ch8-exercise.patch) | ch8 死锁检测 | `tg-rcore-tutorial-ch8/src/main.rs`、`process.rs` |

checker 验收结果与复现命令见 [docs/reference-practice-report.md](../docs/reference-practice-report.md)。

## 应用方式

```powershell
# 1. 克隆参考仓库到基线 commit
git clone --branch test https://github.com/rcore-os/tg-rcore-tutorial.git reference/tg-rcore-tutorial
cd reference/tg-rcore-tutorial
git checkout d6330a6db1f81c8c1cfba5ec3db9923199398f24

# 2. 在 reference/tg-rcore-tutorial 目录内依次打补丁
git apply ../../reference-patches/ch3-exercise.patch
git apply ../../reference-patches/ch4-exercise.patch
git apply ../../reference-patches/ch5-exercise.patch
git apply ../../reference-patches/ch6-exercise.patch
git apply ../../reference-patches/ch8-exercise.patch

# 3. 按报告设置 CHAPTER 并运行 exercise 测例（示例 ch5）
$env:CHAPTER = "5"
cd tg-rcore-tutorial-ch5
cargo clean
cargo run --features exercise 2>&1 | tg-rcore-tutorial-checker --ch 5 --exercise
```

## 说明

- 补丁仅包含 exercise 相关源文件改动，不含 `target/` 等编译产物。
- 完整参考仓库仍可通过 clone 获取；本目录用于满足“提交完整可审阅源码差异”的合规要求。
