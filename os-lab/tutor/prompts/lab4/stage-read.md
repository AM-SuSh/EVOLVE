# 阅读阶段

沿 `sys_fork -> fork_user_space -> spawn -> sys_execve -> replace_user_space -> sys_wait4` 追踪进程生命周期。优先让学生区分 PCB、地址空间、TrapContext 与调度状态，并定位证据所在文件。
