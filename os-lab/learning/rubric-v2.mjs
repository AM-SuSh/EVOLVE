export const RUBRIC_V2_VERSION = 'rubric-v2.0.0'

const ITEM_DEFS = Object.freeze([
  ['P1', 'process', '进入定界与阅读'],
  ['P2', 'process', '首问不是索要答案'],
  ['P3', 'process', '使用证据导向表述'],
  ['P4', 'process', '跨阶段提出问题'],
  ['P5', 'process', '完成可信验证'],
  ['P6', 'process', '失败后完成迭代'],
  ['R1', 'result', 'Hello 输出断言'],
  ['R2', 'result', 'Power 结果断言'],
  ['R3', 'result', 'Yield 五轮断言'],
  ['R4', 'result', '全部退出断言'],
  ['F1', 'reflection', '区分独立判断'],
  ['F2', 'reflection', '区分 AI 帮助与验证'],
  ['T1', 'reflection', '完成迁移对照'],
  ['T2', 'reflection', '解释退出码反例'],
])

const ASSERTION_IDS = {
  R1: ['hello-output', 'hello'],
  R2: ['power-result', 'power'],
  R3: ['yield-five-rounds', 'yield-rounds'],
  R4: ['all-exited', 'all-apps-exited'],
}

function eventRef(event) {
  return `event:${event.id}`
}

function runRef(run) {
  return `run:${run.runId}`
}

function item(id, score, evidenceRefs = [], note = '') {
  const definition = ITEM_DEFS.find(([itemId]) => itemId === id)
  return {
    id,
    dimension: definition[1],
    label: definition[2],
    score: score === null ? null : Math.max(0, Math.min(2, score)),
    status: score === null ? 'unobserved' : score === 2 ? 'met' : score === 1 ? 'partial' : 'not-met',
    evidenceRefs: [...new Set(evidenceRefs)],
    note,
  }
}

function assertionItem(id, runs) {
  const matches = []
  for (const run of runs) {
    for (const assertion of run.assertions || []) {
      if (ASSERTION_IDS[id].includes(assertion.id)) matches.push({ run, assertion })
    }
  }
  if (!matches.length) return item(id, null, [], '未观察到对应可信断言')
  const passed = matches.find(({ run, assertion }) => run.trusted && assertion.passed)
  return passed
    ? item(id, 2, [runRef(passed.run)], passed.assertion.observed)
    : item(id, 0, matches.map(({ run }) => runRef(run)), '断言未通过')
}

function validEvidenceRefs(events, runs) {
  return new Set([
    ...events.map(eventRef),
    ...runs.map(runRef),
  ])
}

export function normalizeLlmSuggestion(suggestion, validRefs) {
  if (!suggestion || typeof suggestion !== 'object') return { status: 'not-requested', items: [] }
  const items = Array.isArray(suggestion.items) ? suggestion.items : []
  return {
    status: 'advisory',
    model: String(suggestion.model || 'unknown').slice(0, 160),
    promptVersion: String(suggestion.promptVersion || 'unknown').slice(0, 160),
    items: items.map((entry) => {
      const refs = Array.isArray(entry.evidenceRefs) ? entry.evidenceRefs.filter((ref) => validRefs.has(ref)) : []
      const score = [0, 1, 2].includes(entry.score) && refs.length ? entry.score : null
      return {
        itemId: String(entry.itemId || '').slice(0, 20),
        score,
        status: score === null ? 'unobserved' : 'observed',
        evidenceRefs: refs,
        rationale: String(entry.rationale || '').slice(0, 1000),
      }
    }),
  }
}

export function assessLearningV2(input) {
  const events = Array.isArray(input.events) ? input.events : []
  const runs = Array.isArray(input.runs) ? input.runs : []
  const studentMessages = events.filter((event) => event.type === 'student_message')
  const stages = new Set(events.filter((event) => event.type === 'stage_enter').map((event) => event.stage))
  const evidenceMessages = studentMessages.filter((event) => /(我认为|假设|观察|验证|输出|代码|trace|诊断)/i.test(event.content || ''))
  const reflectionEvents = events.filter((event) => event.type === 'reflection_submitted')
  const reflectionText = reflectionEvents.map((event) => event.content || '').join('\n')
  const failedIndex = runs.findIndex((run) => run.trusted && !run.verified)
  const passedAfterFailure = failedIndex >= 0 && runs.slice(failedIndex + 1).some((run) => run.trusted && run.verified)
  const trustedRuns = runs.filter((run) => run.trusted)
  const items = [
    item('P1', stages.has('orient') && stages.has('read') ? 2 : stages.has('orient') || stages.has('read') ? 1 : null, events.filter((event) => event.type === 'stage_enter' && ['orient', 'read'].includes(event.stage)).map(eventRef)),
    item('P2', studentMessages.length ? (studentMessages[0].category === 'direct_answer' ? 0 : 2) : null, studentMessages[0] ? [eventRef(studentMessages[0])] : []),
    item('P3', evidenceMessages.length ? 2 : studentMessages.length ? 0 : null, evidenceMessages.map(eventRef)),
    item('P4', new Set(studentMessages.map((event) => event.stage)).size >= 2 ? 2 : studentMessages.length ? 1 : null, studentMessages.map(eventRef)),
    item('P5', trustedRuns.length ? (trustedRuns.some((run) => run.verified) ? 2 : 1) : null, trustedRuns.map(runRef)),
    item('P6', passedAfterFailure ? 2 : failedIndex >= 0 ? 1 : null, trustedRuns.map(runRef)),
    assertionItem('R1', trustedRuns),
    assertionItem('R2', trustedRuns),
    assertionItem('R3', trustedRuns),
    assertionItem('R4', trustedRuns),
    item('F1', reflectionEvents.length ? (/(我认为|我的判断|我理解|独立)/.test(reflectionText) ? 2 : 1) : null, reflectionEvents.map(eventRef)),
    item('F2', reflectionEvents.length ? (/(AI|导师|提示)/i.test(reflectionText) && /(验证|QEMU|输出|代码|trace)/i.test(reflectionText) ? 2 : 0) : null, reflectionEvents.map(eventRef)),
    item('T1', reflectionEvents.length ? (/(抢占|VM Exit|协程|变化条件|迁移|对照)/i.test(reflectionText) ? 2 : 0) : null, reflectionEvents.map(eventRef)),
    item('T2', reflectionEvents.length ? (/(退出码|exit code).*(不够|不足|不能)|断言.*退出码/i.test(reflectionText) ? 2 : 0) : null, reflectionEvents.map(eventRef)),
  ]

  const dimensionScore = (dimension) => {
    const observed = items.filter((entry) => entry.dimension === dimension && entry.score !== null)
    return observed.length ? Math.round(observed.reduce((sum, entry) => sum + entry.score, 0) / (observed.length * 2) * 100) : 0
  }
  const dimensions = {
    process: dimensionScore('process'),
    result: dimensionScore('result'),
    reflection: dimensionScore('reflection'),
  }
  const total = Math.round(dimensions.process * 0.45 + dimensions.result * 0.35 + dimensions.reflection * 0.2)
  const hints = events.filter((event) => event.type === 'hint_requested')
  const trajectory = {
    failToPass: passedAfterFailure,
    trustedRunCount: trustedRuns.length,
    failedRunCount: trustedRuns.filter((run) => !run.verified).length,
    maxHintLevel: hints.reduce((max, event) => Math.max(max, Number(event.hintLevel || 0)), 0),
    diagnosticUseCount: events.filter((event) => event.type === 'diagnostic_opened').length,
    traceUseCount: events.filter((event) => event.type === 'trace_inspected').length,
    independentSuccess: trustedRuns.some((run) => run.verified) && hints.length === 0,
  }
  const llmSuggestion = normalizeLlmSuggestion(input.llmSuggestion, validEvidenceRefs(events, runs))
  return {
    version: RUBRIC_V2_VERSION,
    labId: input.labId,
    sessionId: input.sessionId,
    dimensions,
    total,
    items,
    trajectory,
    llmSuggestion,
    uncertainty: items.some((entry) => entry.status === 'unobserved') ? 'incomplete-evidence' : 'complete',
  }
}
