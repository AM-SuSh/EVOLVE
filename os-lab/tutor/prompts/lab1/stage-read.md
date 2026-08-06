# 阅读阶段

沿 `_start -> rust_main -> clear_bss -> console -> SBI shutdown` 追踪启动链。优先让学生区分链接脚本决定的入口地址、汇编设置的启动栈和 Rust 初始化职责，并定位证据所在文件。
