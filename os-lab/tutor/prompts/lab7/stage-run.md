# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`dup_test pass`、`signal_test pass`、`signal_mask_test pass`、`pipe says hi`、`pipe_test pass`、全部进程退出），再运行 `make test-lab7`。只比较预测与实际差异，帮助判断问题属于 dup 引用、信号投递时机还是 mask 语义。
