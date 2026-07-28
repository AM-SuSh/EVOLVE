const kernelElf = 'target/riscv64gc-unknown-none-elf/release/kernel'
const fsImg = 'target/riscv64gc-unknown-none-elf/release/fs.img'

function cargoRunStep(labId, features = labId) {
  return {
    title: `cargo run -p kernel --features ${features} --release`,
    cmd: 'cargo',
    args: ['run', '-p', 'kernel', '--features', features, '--release'],
  }
}

function diskSteps(labId) {
  return [
    {
      title: `cargo build -p kernel --features ${labId} --release`,
      cmd: 'cargo',
      args: ['build', '-p', 'kernel', '--features', labId, '--release'],
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
    contains: ['Hello, OS!', 'os-lab kernel lab1 is running on QEMU virt.'],
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
      },
      {
        id: 'power-result',
        kind: 'output-contains-all',
        texts: ['409684505', 'Power check ok'],
        label: '幂运算结果与程序自检通过',
      },
      {
        id: 'yield-five-rounds',
        kind: 'output-count-min',
        text: 'Yield round',
        min: 5,
        label: 'Yield round 完整执行',
      },
      {
        id: 'all-exited',
        kind: 'output-contains',
        text: 'All user apps exited.',
        label: '所有用户程序正常退出',
      },
      {
        id: 'trace-trap-enter',
        kind: 'trace-type',
        type: 'trap_enter',
        label: 'trace 包含 trap_enter',
      },
      {
        id: 'trace-task-switch',
        kind: 'trace-type',
        type: 'task_switch',
        label: 'trace 包含 task_switch',
      },
    ],
  },
  lab3: {
    id: 'lab3.verify.v1',
    steps: [cargoRunStep('lab3')],
    contains: ['Power check ok', 'All user apps exited.'],
    counts: [{ text: 'Yield round', exact: 5 }],
  },
  lab4: {
    id: 'lab4.verify.v1',
    steps: [cargoRunStep('lab4')],
    contains: ['I am parent', 'I am child', 'fork_test pass', 'All processes exited.'],
  },
  lab5: {
    id: 'lab5.verify.v1',
    steps: [cargoRunStep('lab5')],
    contains: ['Hello from testfile!', 'fs_test pass', 'pipe_test pass', 'All processes exited.'],
  },
  lab6: {
    id: 'lab6.verify.v1',
    steps: diskSteps('lab6'),
    contains: ['file_test pass', 'Test link OK!', 'mmap_test pass', 'spawn_test pass', 'stride_test pass', 'fs_test pass', 'pipe_test pass', 'All processes exited.'],
  },
  lab7: {
    id: 'lab7.verify.v1',
    steps: diskSteps('lab7'),
    contains: ['dup_test pass', 'signal_test pass', 'signal_mask_test pass', 'pipe_test pass'],
  },
  lab8: {
    id: 'lab8.verify.v1',
    steps: diskSteps('lab8'),
    contains: ['threads_test pass', 'threads_arg_test pass', 'mutex_test pass', 'condvar_test pass', 'pipetest passed!', 'deadlock test mutex 1 OK!', 'deadlock test semaphore 1 OK!', 'pipe_test pass'],
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
        }
      }
      throw new Error(`unknown assertion kind: ${assertion.kind}`)
    })
  }

  const assertions = []

  for (const expected of definition.contains || []) {
    const passed = text.includes(expected)
    assertions.push({
      id: `output-${assertions.length + 1}`,
      label: `输出包含 ${expected}`,
      passed,
      expected,
      observed: passed ? expected : '未观察到',
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
    })
  }
  for (const type of definition.traceTypes || []) {
    const observed = traceEvents.filter((event) => event.type === type).length
    assertions.push({
      id: `trace-${type}`,
      label: `trace 包含 ${type}`,
      passed: observed > 0,
      expected: '至少 1 条',
      observed: `${observed} 条`,
    })
  }
  return assertions
}

export function getRunRecipeContract(labId) {
  const definition = definitions[String(labId || '')]
  if (!definition) return null
  const assertions = definition.assertions || []
  return {
    recipeId: definition.id,
    outputAssertionIds: assertions
      .filter((assertion) => assertion.kind.startsWith('output-'))
      .map((assertion) => assertion.id),
    traceTypes: assertions
      .filter((assertion) => assertion.kind === 'trace-type')
      .map((assertion) => assertion.type),
  }
}

export function listRunRecipes() {
  return Object.entries(definitions).map(([labId, recipe]) => ({ labId, recipeId: recipe.id }))
}
