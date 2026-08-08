# 验证阶段

先让学生预测 QEMU 启动后的关键输出（`file_test pass`、`Test link OK!`、`mass open/unlink OK!`、`mmap_test pass`、`spawn_test pass`、`stride_test pass`、`fs_test pass`、`pipe_test pass`、全部进程退出），再运行 `make test-lab6`。只比较预测与实际差异，帮助判断问题属于设备层、easy-fs 布局、链接计数还是回归路径。
