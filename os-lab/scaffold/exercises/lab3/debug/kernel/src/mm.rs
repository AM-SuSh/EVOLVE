//! Lab3 debug 变体占位（成员 A 教学规格配套）。
//!
//! 正式接入发放前，由教师/成员 C 将参考实现 `kernel/src/mm.rs` 复制到此，
//! 并按 `lab-packages/lab3/variants/debug/manifest.yaml` 植入「用户页缺 U 位」。
//!
//! 本文件故意不是完整可编译内核模块，避免学生误把占位当实现。

#![allow(dead_code)]

/// 教学标记：在用户段 PTE 构造处检查 User 标志是否遗漏。
pub const PLANTED_BUG_HINT: &str =
    "planted: user page PTE missing U bit — see lab3 debug manifest";
