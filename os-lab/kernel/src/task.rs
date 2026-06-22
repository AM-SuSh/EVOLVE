//! Task control blocks and round-robin scheduling (lab2+).

use os_context::TrapContext;

use crate::{print, println};

use crate::config::{APP_BASE_ADDRESS, KERNEL_STACK_SIZE, MAX_APP_NUM, USER_STACK_SIZE};
use crate::loader::{get_app_entry, load_app, NUM_APP};
use crate::trap::{run_user_task, trap_cx_init};

#[derive(Copy, Clone, PartialEq)]
pub enum TaskStatus {
    UnInit,
    Ready,
    Running,
    Exited,
}

pub struct TaskControlBlock {
    pub task_status: TaskStatus,
    pub trap_cx: TrapContext,
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
            let entry = get_app_entry(i);
            let user_sp = APP_BASE_ADDRESS + crate::config::APP_REGION_SIZE - 16;
            let mut task = TaskControlBlock {
                task_status: TaskStatus::Ready,
                trap_cx: TrapContext {
                    x: [0; 32],
                    sstatus: 0,
                    sepc: 0,
                    kernel_sp: 0,
                },
                user_stack: [0; USER_STACK_SIZE],
                kernel_stack: [0; KERNEL_STACK_SIZE],
            };
            let kstack_top = task.kernel_stack.as_ptr() as usize + KERNEL_STACK_SIZE;
            task.trap_cx = trap_cx_init(entry, user_sp, kstack_top);
            self.tasks[i] = Some(task);
        }
    }

    fn find_next_task(&mut self) -> Option<usize> {
        for i in 0..self.num_app {
            if let Some(task) = self.tasks[i].as_ref() {
                if task.task_status == TaskStatus::Ready {
                    self.current = i;
                    return Some(i);
                }
            }
        }
        None
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

pub static mut TASK_MANAGER: TaskManager = TaskManager::new();

pub fn init() {
    unsafe {
        TASK_MANAGER.init_tasks();
    }
}

pub fn run_first_task() -> ! {
    unsafe {
        load_app(0);
        TASK_MANAGER.tasks[0].as_mut().unwrap().task_status = TaskStatus::Running;
        let trap_cx = &mut TASK_MANAGER.tasks[0].as_mut().unwrap().trap_cx;
        run_user_task(trap_cx);
    }
}

pub fn mark_current_suspended() {
    unsafe {
        let task = TASK_MANAGER.tasks[TASK_MANAGER.current].as_mut().unwrap();
        task.task_status = TaskStatus::Ready;
    }
}

pub fn run_next_task() -> ! {
    unsafe {
        if TASK_MANAGER.all_exited() {
            println!("All user apps exited.");
            os_sbi::shutdown();
        }
        if let Some(next) = TASK_MANAGER.find_next_task() {
            TASK_MANAGER.tasks[next].as_mut().unwrap().task_status = TaskStatus::Running;
            let trap_cx = &mut TASK_MANAGER.tasks[next].as_mut().unwrap().trap_cx;
            run_user_task(trap_cx);
        } else {
            println!("All user apps exited.");
            os_sbi::shutdown();
        }
    }
}

pub fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize {
    if fd != 1 {
        return -1;
    }
    let slice = unsafe { core::slice::from_raw_parts(buf, len) };
    match core::str::from_utf8(slice) {
        Ok(s) => {
            print!("{}", s);
            len as isize
        }
        Err(_) => -1,
    }
}

pub fn sys_exit(exit_code: i32) -> ! {
    unsafe {
        let current = TASK_MANAGER.current;
        let task = TASK_MANAGER.tasks[current].as_mut().unwrap();
        task.task_status = TaskStatus::Exited;
        println!("App {} exited with code {}", current, exit_code);
        let next = current + 1;
        if next < NUM_APP {
            TASK_MANAGER.current = next;
            load_app(next);
            let next_task = TASK_MANAGER.tasks[next].as_mut().unwrap();
            next_task.trap_cx.sepc = get_app_entry(next);
            next_task.trap_cx.x[2] = APP_BASE_ADDRESS + crate::config::APP_REGION_SIZE - 16;
            next_task.task_status = TaskStatus::Running;
            run_user_task(&mut next_task.trap_cx);
        } else {
            println!("All user apps exited.");
            os_sbi::shutdown();
        }
    }
}
