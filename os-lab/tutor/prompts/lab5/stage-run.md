# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`Hello from testfile!`、`fs_test pass`、`pipe says hi`、`pipe_test pass`、全部进程退出），再运行当前 Lab 验证命令。只比较预测与实际差异，帮助判断问题属于名字查找、fd 分配、offset 推进还是管道同步。
