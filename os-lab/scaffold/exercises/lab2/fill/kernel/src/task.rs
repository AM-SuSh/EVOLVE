//! 【Lab2 任务：fill】当前 `TaskManager::find_next_task` 是 `todo!()`。
//! 请先阅读 `find_next_task` 上方的思路提示，再实现调度选择逻辑。

use os_context::TrapContext;

use crate::cell::SyncUnsafeCell;
use crate::{print, println};

use crate::config::{KERNEL_STACK_SIZE, MAX_APP_NUM, USER_STACK_SIZE};
use crate::loader::{get_app_entry, NUM_APP};
#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
use crate::loader::load_app;
#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
use crate::loader::get_app_elf;
use crate::trap::{run_user_task, trap_cx_init};

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
use crate::config::APP_BASE_ADDRESS;
#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
use crate::mm;

#[derive(Copy, Clone, PartialEq)]
pub enum TaskStatus {
    #[allow(dead_code)]
    UnInit,
    Ready,
    Running,
    Exited,
}

pub struct TaskControlBlock {
    pub task_status: TaskStatus,
    pub trap_cx: TrapContext,
    #[allow(dead_code)]
    pub user_token: usize,
    #[allow(dead_code)]
    pub user_stack: [u8; USER_STACK_SIZE],
    pub kernel_stack: [u8; KERNEL_STACK_SIZE],
}

pub struct TaskManager {
    num_app: usize,
    current: usize,
    tasks: [Option<TaskControlBlock>; MAX_APP_NUM],
}

impl TaskManager {
    const fn new() -> Self {
        Self {
            num_app: 0,
            current: 0,
            tasks: [const { None }; MAX_APP_NUM],
        }
    }

    fn init_tasks(&mut self) {
        self.num_app = NUM_APP;
        for i in 0..self.num_app {
            #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
            mm::create_user_space(i, get_app_elf(i));

            let entry = get_app_entry(i);
            #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
            let user_sp = APP_BASE_ADDRESS + crate::config::APP_REGION_SIZE - 16;
            #[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
            let user_sp = crate::config::APP_BASE_ADDRESS + crate::config::APP_REGION_SIZE - 16;

            #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
            let user_token = mm::user_token(i);
            #[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
            let user_token = 0;

            self.tasks[i] = Some(TaskControlBlock {
                task_status: TaskStatus::Ready,
                trap_cx: TrapContext {
                    x: [0; 32],
                    sstatus: 0,
                    sepc: 0,
                    kernel_sp: 0,
                },
                user_token,
                user_stack: [0; USER_STACK_SIZE],
                kernel_stack: [0; KERNEL_STACK_SIZE],
            });
            let task = self.tasks[i].as_mut().unwrap();
            let kstack_top = task.kernel_stack.as_ptr() as usize + KERNEL_STACK_SIZE;
            task.trap_cx = trap_cx_init(entry, user_sp, kstack_top);
        }
    }

    /// 【Lab2 任务：fill】选出下一个 Ready 任务的下标；没有则返回 None。
    ///
    /// 思路提示（先自己想清楚再动手）：
    /// 1. 任务表是 `self.tasks[0..self.num_app]`，每一项是 `Option<TaskControlBlock>`；
    /// 2. 只有 `Ready` 可被选中；选中后更新 `self.current`；
    /// 3. 轮转扫描：从 `(self.current + 1) % self.num_app` 起最多看 `num_app` 个槽；
    /// 4. 想清楚：从 0 扫和从 `current + 1` 扫，在「同时有多个 Ready」时差在哪？
    ///    默认 hello / power / yield 是顺序 batch，默认输出不一定能直接看出差异，
    ///    报告里应用循环边界解释，或临时构造多 Ready 场景观察。
    fn find_next_task(&mut self) -> Option<usize> {
        todo!("Lab2：实现从 current+1 起的轮转调度（见上方提示）")
    }

    fn all_exited(&self) -> bool {
        (0..self.num_app).all(|i| {
            self.tasks[i]
                .as_ref()
                .map(|t| t.task_status == TaskStatus::Exited)
                .unwrap_or(true)
        })
    }
}

static TASK_MANAGER: SyncUnsafeCell<TaskManager> = SyncUnsafeCell::new(TaskManager::new());

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
pub fn current_app_id() -> usize {
    TASK_MANAGER.with(|tm| tm.current)
}

#[allow(dead_code)]
pub fn current_task_id() -> usize {
    TASK_MANAGER.with(|tm| tm.current)
}

pub fn init() {
    TASK_MANAGER.with(|tm| tm.init_tasks());
}

#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
pub fn run_first_task() -> ! {
    TASK_MANAGER.with(|tm| {
        load_app(0);
        tm.tasks[0].as_mut().unwrap().task_status = TaskStatus::Running;
        #[cfg(feature = "trace-edu")]
        crate::trace::task_switch(0, "initial");
        let trap_cx = &mut tm.tasks[0].as_mut().unwrap().trap_cx;
        run_user_task(trap_cx)
    })
}

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
pub fn run_first_task() -> ! {
    TASK_MANAGER.with(|tm| {
        tm.tasks[0].as_mut().unwrap().task_status = TaskStatus::Running;
        tm.current = 0;
        let trap_cx = &mut tm.tasks[0].as_mut().unwrap().trap_cx;
        run_user_task(trap_cx)
    })
}

/// yield：当前任务 Running → Ready，之后由 `run_next_task` 再选下一个。
pub fn mark_current_suspended() {
    TASK_MANAGER.with(|tm| {
        let task = tm.tasks[tm.current].as_mut().unwrap();
        task.task_status = TaskStatus::Ready;
    });
}

/// 把内核栈上保存的 trap 现场写回当前任务的 TCB。
pub fn sync_current_trap_cx(cx: &TrapContext) {
    TASK_MANAGER.with(|tm| {
        let current = tm.current;
        if let Some(task) = tm.tasks[current].as_mut() {
            task.trap_cx = *cx;
        }
    });
}

pub fn run_next_task() -> ! {
    TASK_MANAGER.with(|tm| {
        if tm.all_exited() {
            println!("All user apps exited.");
            os_sbi::shutdown();
        }
        if let Some(next) = tm.find_next_task() {
            tm.tasks[next].as_mut().unwrap().task_status = TaskStatus::Running;
            #[cfg(feature = "trace-edu")]
            crate::trace::task_switch(next, "scheduler");
            let trap_cx = &mut tm.tasks[next].as_mut().unwrap().trap_cx;
            run_user_task(trap_cx)
        } else {
            println!("All user apps exited.");
            os_sbi::shutdown();
        }
    })
}

pub fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize {
    if fd != 1 {
        return -1;
    }
    #[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
    {
        crate::mm::activate_current_user();
        let user_slice = unsafe { core::slice::from_raw_parts(buf, len) };
        let mut kbuf = [0u8; 256];
        let n = len.min(kbuf.len());
        kbuf[..n].copy_from_slice(&user_slice[..n]);
        crate::mm::activate_kernel();
        match core::str::from_utf8(&kbuf[..n]) {
            Ok(s) => {
                print!("{}", s);
                n as isize
            }
            Err(_) => -1,
        }
    }
    #[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
    {
        let slice = unsafe { core::slice::from_raw_parts(buf, len) };
        match core::str::from_utf8(slice) {
            Ok(s) => {
                print!("{}", s);
                len as isize
            }
            Err(_) => -1,
        }
    }
}

#[cfg(not(any(feature = "lab3", feature = "lab4", feature = "lab5")))]
pub fn sys_exit(exit_code: i32) -> ! {
    TASK_MANAGER.with(|tm| {
        let current = tm.current;
        let task = tm.tasks[current].as_mut().unwrap();
        task.task_status = TaskStatus::Exited;
        println!("App {} exited with code {}", current, exit_code);
        let next = current + 1;
        if next < NUM_APP {
            tm.current = next;
            load_app(next);
            let next_task = tm.tasks[next].as_mut().unwrap();
            next_task.trap_cx.sepc = get_app_entry(next);
            next_task.trap_cx.set_user_sp(
                crate::config::APP_BASE_ADDRESS + crate::config::APP_REGION_SIZE - 16,
            );
            next_task.task_status = TaskStatus::Running;
            run_user_task(&mut next_task.trap_cx)
        } else {
            println!("All user apps exited.");
            os_sbi::shutdown();
        }
    })
}

#[cfg(any(feature = "lab3", feature = "lab4", feature = "lab5"))]
pub fn sys_exit(exit_code: i32) -> ! {
    TASK_MANAGER.with(|tm| {
        let current = tm.current;
        let task = tm.tasks[current].as_mut().unwrap();
        task.task_status = TaskStatus::Exited;
        println!("App {} exited with code {}", current, exit_code);
        let next = current + 1;
        if next < NUM_APP {
            tm.current = next;
            let next_task = tm.tasks[next].as_mut().unwrap();
            next_task.trap_cx.sepc = get_app_entry(next);
            next_task.trap_cx.set_user_sp(APP_BASE_ADDRESS + crate::config::APP_REGION_SIZE - 16);
            next_task.task_status = TaskStatus::Running;
            run_user_task(&mut next_task.trap_cx)
        } else {
            println!("All user apps exited.");
            os_sbi::shutdown();
        }
    })
}
