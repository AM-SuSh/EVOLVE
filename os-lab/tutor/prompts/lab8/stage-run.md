# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`threads_test pass`、`threads_arg_test pass`、`mutex_test pass`、`condvar_test pass`、`pipetest passed!`、`deadlock test mutex 1 OK!`、`deadlock test semaphore 1 OK!`、`pipe_test pass`、全部进程退出），再运行 `make test-lab8`。只比较预测与实际差异，帮助判断问题属于线程调度、阻塞唤醒还是死锁检测。
