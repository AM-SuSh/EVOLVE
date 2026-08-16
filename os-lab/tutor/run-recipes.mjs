const kernelElf = 'target/riscv64gc-unknown-none-elf/release/kernel'
const fsImg = 'target/riscv64gc-unknown-none-elf/release/fs.img'

function cargoRunStep(labId, features = labId) {
  return {
    title: `cargo run -p kernel --no-default-features --features ${features} --release`,
    cmd: 'cargo',
    args: [
      'run',
      '-p',
      'kernel',
      '--no-default-features',
      '--features',
      features,
      '--release',
      '--message-format=json',
    ],
  }
}

function diskSteps(labId, features = labId) {
  return [
    {
      title: `cargo build -p kernel --no-default-features --features ${features} --release`,
      cmd: 'cargo',
      args: [
        'build',
        '-p',
        'kernel',
        '--no-default-features',
        '--features',
        features,
        '--release',
        '--message-format=json',
      ],
    },
    {
      title: 'qemu-system-riscv64（VirtIO 磁盘）',
      cmd: 'qemu-system-riscv64',
      args: [
        '-machine', 'virt', '-nographic', '-bios', 'default',
        '-drive', `file=${fsImg},if=none,format=raw,id=x0`,
        '-device', 'virtio-blk-device,drive=x0,bus=virtio-mmio-bus.0',
        '-kernel', kernelElf,
      ],
    },
  ]
}

const definitions = {
  lab1: {
    id: 'lab1.verify.v1',
    steps: [cargoRunStep('lab1')],
    contains: [
      {
        text: 'Hello, OS!',
        hint: '内核入口没有打印该行：检查 main 是否真的执行 println，并确认 lab1 feature 已启用。',
      },
      {
        text: 'EVOLVE kernel lab1 is running on QEMU virt.',
        hint: 'QEMU 启动信息缺失：检查链接地址、启动流程和 main 的执行路径，确认 OpenSBI 之后内核真的运行到打印处。',
      },
    ],
  },
  lab2: {
    id: 'lab2.verify-trace.v1',
    steps: [cargoRunStep('lab2', 'lab2,trace-edu')],
    assertions: [
      {
        id: 'hello-output',
        kind: 'output-contains',
        text: 'Hello from user app!',
        label: '用户程序成功输出',
        hint: '用户程序没有输出：检查 sys_write 的 ecall 编号与参数传递，以及 loader 是否把 hello 程序正确装入并进入用户态。',
      },
      {
        id: 'power-result',
        kind: 'output-contains-all',
        texts: ['409684505', 'Power check ok'],
        label: '幂运算结果与程序自检通过',
        hint: '幂运算结果或自检缺失：检查 power 程序的 sys_write/sys_exit 调用，以及 syscall handler 是否正确返回（尤其 sepc 是否前进）。',
      },
      {
        id: 'yield-five-rounds',
        kind: 'output-count-min',
        text: 'Yield round',
        min: 5,
        label: 'Yield round 完整执行',
        hint: 'Yield round 不足 5 次：重点检查 find_next_task 的状态转换，yield 后任务应回到 Ready 而不是被跳过或退出，并确认每轮都切回下一个任务。',
      },
      {
        id: 'all-exited',
        kind: 'output-contains',
        text: 'All user apps exited.',
        label: '所有用户程序正常退出',
        hint: '有用户程序没有正常退出：检查 sys_exit 是否把任务标记为 Exited、调度器是否跳过已退出任务，以及主循环是否在所有应用结束后才返回。',
      },
      {
        id: 'trace-trap-enter',
        kind: 'trace-type',
        type: 'trap_enter',
        label: 'trace 包含 trap_enter',
        hint: '没有 trap_enter trace：确认内核启用了 trace-edu feature（工作台验证命令默认启用），且 trap 入口真的打印了 TRACE_V1 事件。',
      },
      {
        id: 'trace-task-switch',
        kind: 'trace-type',
        type: 'task_switch',
        label: 'trace 包含 task_switch',
        hint: '没有 task_switch trace：说明任务切换路径没有真正执行；检查切换处是否打印 task_switch 事件，并确认调度器确实切到了下一个任务。',
      },
    ],
  },
  lab3: {
    id: 'lab3.verify.v1',
    steps: [cargoRunStep('lab3', 'lab3,trace-edu')],
    contains: [
      {
        text: 'Power check ok',
        hint: '地址空间/系统调用未打通：检查页表映射是否覆盖用户程序代码、数据和栈，以及 syscall 参数是否按虚拟地址正确传递。',
      },
      {
        text: 'All user apps exited.',
        hint: '有用户程序没有正常退出：检查进程退出与回收路径，确认所有应用结束后内核才打印该行。',
      },
    ],
    counts: [
      {
        text: 'Yield round',
        exact: 5,
        hint: 'Yield round 次数不对：检查 yield 切换与 trap 上下文保存/恢复，确认每次 yield 都真正切走并切回。',
      },
    ],
    traceMatches: [
      {
        id: 'trace-address-space-create',
        type: 'address_space',
        match: { action: 'create' },
        label: 'trace 包含独立地址空间创建',
        hint: '没有地址空间创建 trace：检查 create_user_space 是否在装载每个 ELF 时建立独立页表，并确认受信 recipe 启用了 trace-edu。',
      },
    ],
  },
  lab4: {
    id: 'lab4.verify.v1',
    steps: [cargoRunStep('lab4', 'lab4,trace-edu')],
    contains: [
      {
        text: 'I am parent',
        hint: '父分支没有输出：检查 fork 返回值区分（父进程拿到子进程 pid），并确认父子都从 fork 返回。',
      },
      {
        text: 'I am child',
        hint: '子分支没有输出：检查子进程的 trap 上下文/返回值，以及调度器是否真的运行了子进程。',
      },
      {
        text: 'fork_test pass',
        hint: 'fork 测试未通过：检查地址空间复制、文件描述符继承、wait 回收和子进程独立运行。',
      },
      {
        text: 'All processes exited.',
        hint: '有进程未正常退出：检查进程表清理、wait 回收与调度器跳过僵尸进程的逻辑。',
      },
    ],
    traceMatches: [
      {
        id: 'trace-process-clone',
        type: 'syscall',
        match: { name: 'clone' },
        label: 'trace 包含 clone 进程创建',
        hint: '没有 clone syscall trace：检查 fork 测试是否真正进入 SYS_CLONE，以及父子进程是否从同一 TrapContext 分叉。',
      },
      {
        id: 'trace-process-wait',
        type: 'syscall',
        match: { name: 'wait4' },
        label: 'trace 包含 wait4 子进程回收',
        hint: '没有 wait4 syscall trace：检查父进程是否等待并回收僵尸子进程，以及阻塞重试路径是否生效。',
      },
    ],
  },
  lab5: {
    id: 'lab5.verify.v1',
    steps: [cargoRunStep('lab5', 'lab5,trace-edu')],
    contains: [
      {
        text: 'Hello from testfile!',
        hint: 'testfile 读取失败：检查 sys_open/sys_read 的参数与文件描述符，以及文件系统 open/read 路径。',
      },
      {
        text: 'fs_test pass',
        hint: '文件系统测试未通过：对照输出定位 open/read/write/close 中失败的一步，先修对应系统调用。',
      },
      {
        text: 'pipe_test pass',
        hint: '管道测试未通过：检查 pipe 创建、读写缓冲和阻塞/唤醒逻辑，确认两端能按顺序传输。',
      },
      {
        text: 'All processes exited.',
        hint: '有进程未正常退出：检查 wait 回收与进程退出路径。',
      },
    ],
    traceMatches: [
      {
        id: 'trace-fs-openat',
        type: 'syscall',
        match: { name: 'openat' },
        label: 'trace 包含 openat 文件访问',
        hint: '没有 openat syscall trace：检查 fs_test 是否走到文件打开路径，以及 SYS_OPENAT 是否正确分派。',
      },
      {
        id: 'trace-ipc-pipe',
        type: 'syscall',
        match: { name: 'pipe' },
        label: 'trace 包含 pipe 创建',
        hint: '没有 pipe syscall trace：检查 pipe_test 是否真正创建管道，以及 SYS_PIPE 是否正确分派。',
      },
    ],
  },
  lab6: {
    id: 'lab6.verify.v1',
    steps: diskSteps('lab6', 'lab6,trace-edu'),
    contains: [
      { text: 'file_test pass', hint: '文件系统块读写失败：检查 VirtIO 磁盘初始化、块设备读写和文件系统挂载。' },
      { text: 'Test link OK!', hint: '链接测试未通过：检查目录项/硬链接相关实现与测试调用路径。' },
      { text: 'mmap_test pass', hint: 'mmap 测试未通过：检查地址空间映射、页表更新与 munmap 回收。' },
      { text: 'spawn_test pass', hint: 'spawn 测试未通过：检查从文件系统加载用户程序、分配地址空间并启动的完整路径。' },
      { text: 'stride_test pass', hint: 'stride 调度测试未通过：检查 stride 调度器实现与测试对调度策略的预期。' },
      { text: 'fs_test pass', hint: '文件系统测试未通过：先定位 open/read/write/close 中失败的一步。' },
      { text: 'pipe_test pass', hint: '管道测试未通过：检查 pipe 创建、读写与阻塞唤醒。' },
      { text: 'All processes exited.', hint: '有进程未正常退出：检查 wait 回收与退出路径。' },
    ],
    traceMatches: [
      {
        id: 'trace-disk-linkat',
        type: 'syscall',
        match: { name: 'linkat' },
        label: 'trace 包含 linkat 硬链接操作',
        hint: '没有 linkat syscall trace：检查链接测试是否进入磁盘文件系统的硬链接路径。',
      },
      {
        id: 'trace-vm-mmap',
        type: 'syscall',
        match: { name: 'mmap' },
        label: 'trace 包含 mmap 映射',
        hint: '没有 mmap syscall trace：检查 mmap_test 是否发起映射，以及 SYS_MMAP 是否正确分派。',
      },
      {
        id: 'trace-process-spawn',
        type: 'syscall',
        match: { name: 'spawn' },
        label: 'trace 包含 spawn 程序加载',
        hint: '没有 spawn syscall trace：检查 spawn_test 是否从磁盘读取 ELF 并创建进程。',
      },
    ],
  },
  lab7: {
    id: 'lab7.verify.v1',
    steps: diskSteps('lab7', 'lab7,trace-edu'),
    contains: [
      { text: 'dup_test pass', hint: 'dup 测试未通过：检查 dup/dup2 的文件描述符复制与文件表引用计数。' },
      { text: 'signal_test pass', hint: '信号测试未通过：检查信号注册、发送与处理路径，以及 trap 上下文保存恢复。' },
      { text: 'signal_mask_test pass', hint: '信号掩码测试未通过：检查 mask 设置/恢复与阻塞期信号排队。' },
      { text: 'pipe_test pass', hint: '管道测试未通过：检查 pipe 创建、读写与阻塞唤醒。' },
    ],
    traceMatches: [
      {
        id: 'trace-fd-dup',
        type: 'syscall',
        match: { name: 'dup' },
        label: 'trace 包含 dup 描述符复制',
        hint: '没有 dup syscall trace：检查 dup_test 是否进入 SYS_DUP，并确认文件表引用被复制。',
      },
      {
        id: 'trace-signal-kill',
        type: 'syscall',
        match: { name: 'kill' },
        label: 'trace 包含 kill 信号发送',
        hint: '没有 kill syscall trace：检查 signal_test 是否向目标进程登记 pending 信号。',
      },
      {
        id: 'trace-signal-return',
        type: 'syscall',
        match: { name: 'sigreturn' },
        label: 'trace 包含 sigreturn 上下文恢复',
        hint: '没有 sigreturn syscall trace：检查信号处理器返回跳板和保存的 TrapContext 恢复路径。',
      },
    ],
  },
  lab8: {
    id: 'lab8.verify.v1',
    steps: diskSteps('lab8', 'lab8,trace-edu'),
    contains: [
      { text: 'threads_test pass', hint: '线程测试未通过：检查线程创建、内核/用户栈分配与调度切换。' },
      { text: 'threads_arg_test pass', hint: '线程参数测试未通过：检查创建线程时参数如何传给入口，地址是否可读。' },
      { text: 'mutex_test pass', hint: '互斥锁测试未通过：检查锁的原子操作、等待队列与唤醒。' },
      { text: 'condvar_test pass', hint: '条件变量测试未通过：检查 wait/signal 的等待队列与锁释放/重获取。' },
      { text: 'pipetest passed!', hint: '管道测试未通过：检查 pipe 读写与阻塞同步。' },
      { text: 'deadlock test mutex 1 OK!', hint: '死锁测试未通过：检查互斥锁获取顺序/超时/检测逻辑。' },
      { text: 'deadlock test semaphore 1 OK!', hint: '信号量死锁测试未通过：检查信号量获取顺序与超时/检测。' },
      { text: 'pipe_test pass', hint: '管道测试未通过：检查 pipe 读写与阻塞同步。' },
    ],
    traceMatches: [
      {
        id: 'trace-thread-create',
        type: 'syscall',
        match: { name: 'thread_create' },
        label: 'trace 包含线程创建',
        hint: '没有 thread_create syscall trace：检查线程入口、参数与用户栈分配路径。',
      },
      {
        id: 'trace-mutex-lock',
        type: 'syscall',
        match: { name: 'mutex_lock' },
        label: 'trace 包含 mutex_lock',
        hint: '没有 mutex_lock syscall trace：检查互斥测试是否进入阻塞锁获取路径。',
      },
      {
        id: 'trace-condvar-wait',
        type: 'syscall',
        match: { name: 'condvar_wait' },
        label: 'trace 包含 condvar_wait',
        hint: '没有 condvar_wait syscall trace：检查条件变量测试是否释放锁并进入等待队列。',
      },
      {
        id: 'trace-deadlock-detect',
        type: 'syscall',
        match: { name: 'enable_deadlock_detect' },
        label: 'trace 包含死锁检测启用',
        hint: '没有 enable_deadlock_detect syscall trace：检查死锁测试是否开启检测并走短路判定。',
      },
    ],
  },
}

function occurrenceCount(output, needle) {
  if (!needle) return 0
  let count = 0
  let index = 0
  while ((index = output.indexOf(needle, index)) >= 0) {
    count += 1
    index += needle.length
  }
  return count
}

function traceMatches(event, assertion) {
  return event.type === assertion.type && Object.entries(assertion.match || {}).every(
    ([key, value]) => event[key] === value,
  )
}

export function getRunRecipe(labId) {
  const recipe = definitions[String(labId || '')]
  if (!recipe) return null
  return {
    id: recipe.id,
    labId: String(labId),
    steps: recipe.steps.map((step) => ({ ...step, args: [...step.args] })),
  }
}

export function evaluateRunAssertions(recipeId, output, traceEvents = []) {
  const definition = Object.values(definitions).find((item) => item.id === recipeId)
  if (!definition) return []
  const text = String(output || '')

  if (definition.assertions) {
    return definition.assertions.map((assertion) => {
      if (assertion.kind === 'output-contains') {
        const passed = text.includes(assertion.text)
        return {
          id: assertion.id,
          label: assertion.label,
          passed,
          expected: assertion.text,
          observed: passed ? assertion.text : '未观察到',
          ...(assertion.hint ? { hint: assertion.hint } : {}),
        }
      }
      if (assertion.kind === 'output-contains-all') {
        const missing = assertion.texts.filter((expected) => !text.includes(expected))
        return {
          id: assertion.id,
          label: assertion.label,
          passed: missing.length === 0,
          expected: assertion.texts.join('；'),
          observed: missing.length === 0 ? assertion.texts.join('；') : `缺少：${missing.join('；')}`,
          ...(assertion.hint ? { hint: assertion.hint } : {}),
        }
      }
      if (assertion.kind === 'output-count-min') {
        const observed = occurrenceCount(text, assertion.text)
        return {
          id: assertion.id,
          label: assertion.label,
          passed: observed >= assertion.min,
          expected: `至少 ${assertion.min}`,
          observed: String(observed),
          ...(assertion.hint ? { hint: assertion.hint } : {}),
        }
      }
      if (assertion.kind === 'trace-type') {
        const observed = traceEvents.filter((event) => event.type === assertion.type).length
        return {
          id: assertion.id,
          label: assertion.label,
          passed: observed > 0,
          expected: '至少 1 条',
          observed: `${observed} 条`,
          ...(assertion.hint ? { hint: assertion.hint } : {}),
        }
      }
      throw new Error(`unknown assertion kind: ${assertion.kind}`)
    })
  }

  const assertions = []

  for (const entry of definition.contains || []) {
    const expected = typeof entry === 'string' ? entry : entry.text
    const hint = typeof entry === 'string' ? '' : entry.hint
    const passed = text.includes(expected)
    assertions.push({
      id: `output-${assertions.length + 1}`,
      label: `输出包含 ${expected}`,
      passed,
      expected,
      observed: passed ? expected : '未观察到',
      ...(hint ? { hint } : {}),
    })
  }
  for (const count of definition.counts || []) {
    const observed = occurrenceCount(text, count.text)
    assertions.push({
      id: `count-${assertions.length + 1}`,
      label: `${count.text} 出现次数`,
      passed: observed === count.exact,
      expected: String(count.exact),
      observed: String(observed),
      ...(count.hint ? { hint: count.hint } : {}),
    })
  }
  for (const entry of definition.traceTypes || []) {
    const type = typeof entry === 'string' ? entry : entry.type
    const hint = typeof entry === 'string' ? '' : entry.hint
    const observed = traceEvents.filter((event) => event.type === type).length
    assertions.push({
      id: `trace-${type}`,
      label: `trace 包含 ${type}`,
      passed: observed > 0,
      expected: '至少 1 条',
      observed: `${observed} 条`,
      ...(hint ? { hint } : {}),
    })
  }
  for (const match of definition.traceMatches || []) {
    const observed = traceEvents.filter((event) => traceMatches(event, match)).length
    assertions.push({
      id: match.id,
      label: match.label || `trace 包含 ${match.type}`,
      passed: observed > 0,
      expected: '至少 1 条',
      observed: `${observed} 条`,
      ...(match.hint ? { hint: match.hint } : {}),
    })
  }
  return assertions
}

export function getRunRecipeContract(labId) {
  const definition = definitions[String(labId || '')]
  if (!definition) return null
  const assertions = definition.assertions || []
  const traceTypes = [
    ...assertions
      .filter((assertion) => assertion.kind === 'trace-type')
      .map((assertion) => assertion.type),
    ...(definition.traceTypes || []).map((entry) => typeof entry === 'string' ? entry : entry.type),
    ...(definition.traceMatches || []).map((entry) => entry.type),
  ]
  return {
    recipeId: definition.id,
    outputAssertionIds: assertions
      .filter((assertion) => assertion.kind.startsWith('output-'))
      .map((assertion) => assertion.id),
    traceTypes: [...new Set(traceTypes)],
  }
}

export function listRunRecipes() {
  return Object.entries(definitions).map(([labId, recipe]) => ({ labId, recipeId: recipe.id }))
}
