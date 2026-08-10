import { normalizeLlmSuggestion } from './rubric-v2.mjs'

export const RUBRIC_V3_VERSION = 'rubric-v3.0.0'

const ITEM_DEFS = Object.freeze([
  ['P2', 'process', '用问题或分析推进，而不是索要答案'],
  ['J1', 'process', '提出自己的判断'],
  ['E1', 'process', '引用可检查证据'],
  ['H1', 'process', '形成可证伪假设'],
  ['V1', 'process', '完成可信验证'],
  ['I1', 'process', '失败后迭代并复验'],
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

const JUDGMENT_RE = /(我认为|我觉得|我的判断|我猜|我观察到|我理解|可能是|应该是)/
const EVIDENCE_RE = /(\.rs\b|\.asm\b|\.s\b|\.toml\b|源码|代码|函数|字段|输出|日志|诊断|trace|运行|断言|QEMU|测试|现象|错误码)/i
const HYPOTHESIS_RE = /(假设|可能原因|推测|猜测|如果|若|预期)/
const PREDICTION_RE = /(那么|则|会|应该|验证|观察|输出|断言|结果|能看到|可以判断)/
const CAUSAL_RE = /(因为|所以|导致|原因|机制|路径|因此|从而)/
const AI_RE = /(AI|导师|提示|提醒|帮助)/i
const TRANSFER_RE = /(抢占|VM Exit|协程|改变条件|换一个条件|迁移|对照|如果.*改|假如.*改)/i
const COUNTEREXAMPLE_RE = /(退出码|exit code).*(不够|不足|不能|不代表)|不仅.*退出|断言|反例|边界条件/i
const DIRECT_ANSWER_RE = /(完整代码|直接答案|直接实现|可提交.*patch|替我写完|最终代码)/i

function itemDefinition(id) {
  return ITEM_DEFS.find(([itemId]) => itemId === id)
}

function eventRef(event) {
  return event?.id ? `event:${event.id}` : null
}

function runRef(run) {
  return run?.runId ? `run:${run.runId}` : null
}

function uniqueRefs(refs) {
  return [...new Set(refs.filter(Boolean))]
}

function item(id, score, evidenceRefs = [], note = '') {
  const definition = itemDefinition(id)
  const safeScore = score === null ? null : Math.max(0, Math.min(2, score))
  return {
    id,
    dimension: definition[1],
    label: definition[2],
    score: safeScore,
    status: safeScore === null ? 'unobserved' : safeScore === 2 ? 'met' : safeScore === 1 ? 'partial' : 'not-met',
    evidenceRefs: uniqueRefs(evidenceRefs),
    note,
  }
}

function textOf(events) {
  return events.map((event) => String(event.content || '')).join('\n')
}

function studentEvidence(events) {
  return events.filter((event) => event.type === 'student_message' && !DIRECT_ANSWER_RE.test(event.content || '') && EVIDENCE_RE.test(event.content || ''))
}

function supportingEvidence(events) {
  return events.filter((event) => [
    'code_open',
    'diagnostic_opened',
    'trace_inspected',
    'verification_attempt',
    'run_finished',
    'report_submitted',
  ].includes(event.type))
}

function scoreJudgment(studentMessages) {
  const candidates = studentMessages.filter((event) => event.category !== 'direct_answer' && !DIRECT_ANSWER_RE.test(event.content || ''))
  const judged = candidates.filter((event) => JUDGMENT_RE.test(event.content || ''))
  if (!studentMessages.length) return { score: null, refs: [], note: '尚未观察到学生消息' }
  if (!judged.length) return { score: 0, refs: candidates.map(eventRef), note: '消息中没有学生自己的判断' }
  const strong = judged.some((event) => CAUSAL_RE.test(event.content || '') || PREDICTION_RE.test(event.content || ''))
  return {
    score: strong ? 2 : 1,
    refs: judged.map(eventRef),
    note: strong ? '判断同时包含依据或可观察后果' : '已提出判断，但依据仍不完整',
  }
}

function scoreQuestionProgress(studentMessages) {
  if (!studentMessages.length) return { score: null, refs: [], note: '尚未观察到学生消息' }
  const direct = studentMessages.filter((event) => event.category === 'direct_answer' || DIRECT_ANSWER_RE.test(event.content || ''))
  if (direct.length === studentMessages.length) return { score: 0, refs: studentMessages.map(eventRef), note: '问题主要在索要直接答案' }
  if (direct.length) return { score: 1, refs: studentMessages.map(eventRef), note: '同时存在索要答案和分析性提问' }
  return { score: 2, refs: studentMessages.map(eventRef), note: '问题在推进判断、证据或验证' }
}

function scoreEvidence(events, studentMessages, runs) {
  const messages = studentEvidence(studentMessages)
  if (!studentMessages.length) return { score: null, refs: [], note: '尚未观察到学生消息' }
  if (!messages.length) return { score: 0, refs: studentMessages.map(eventRef), note: '没有引用源码、输出、诊断、Trace 或运行证据' }
  const support = supportingEvidence(events)
  const trusted = runs.filter((run) => run.trusted)
  const refs = [...messages.map(eventRef), ...support.map(eventRef), ...trusted.map(runRef)]
  return {
    score: support.length || trusted.length ? 2 : 1,
    refs,
    note: support.length || trusted.length ? '学生陈述与工作台或可信运行证据相连' : '提到了证据类型，但尚未观察到对应证据事件',
  }
}

function scoreHypothesis(studentMessages) {
  const candidates = studentMessages.filter((event) => event.category !== 'direct_answer' && !DIRECT_ANSWER_RE.test(event.content || ''))
  const hypotheses = candidates.filter((event) => HYPOTHESIS_RE.test(event.content || ''))
  if (!studentMessages.length) return { score: null, refs: [], note: '尚未观察到学生消息' }
  if (!hypotheses.length) return { score: 0, refs: candidates.map(eventRef), note: '消息中没有可检验的假设' }
  const falsifiable = hypotheses.some((event) => {
    const content = event.content || ''
    return PREDICTION_RE.test(content) && (content.includes('如果') || content.includes('若') || content.includes('预期') || content.includes('假设'))
  })
  return {
    score: falsifiable ? 2 : 1,
    refs: hypotheses.map(eventRef),
    note: falsifiable ? '假设包含可以通过观察结果区分的预测' : '已形成假设，但还没有明确的可观察预测',
  }
}

function trustedRuns(runs) {
  return runs.filter((run) => run.trusted === true)
}

function scoreVerification(events, runs) {
  const attempts = events.filter((event) => event.type === 'verification_attempt')
  const trusted = trustedRuns(runs)
  const passed = trusted.filter((run) => run.verified === true)
  const trustedAttempt = attempts.some((event) => event.metadata?.trusted === true)
  const passedAttempt = attempts.some((event) => event.metadata?.passed === true)
  const refs = [...attempts.map(eventRef), ...trusted.map(runRef)]
  if (!attempts.length && !runs.length) return { score: null, refs: [], note: '尚未观察到验证' }
  if (passed.length) return { score: 2, refs, note: '存在可信且通过的运行结果' }
  if (trustedAttempt || passedAttempt || trusted.length) return { score: 1, refs, note: '存在验证尝试，但没有可信通过结果' }
  return { score: 1, refs, note: '存在验证尝试，但来源未被标记为可信' }
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isNaN(parsed) ? null : parsed
}

function scoreIteration(events, runs) {
  const failed = runs.filter((run) => run.trusted === true && run.verified !== true)
  const passed = runs.filter((run) => run.trusted === true && run.verified === true)
  const saves = events.filter((event) => event.type === 'code_save')
  if (!failed.length) return { score: runs.length ? null : null, refs: [], note: '尚未观察到失败后的迭代机会' }
  const firstFailure = failed[0]
  const failureAt = timestamp(firstFailure.finishedAt || firstFailure.startedAt)
  const saveAfterFailure = saves.filter((event) => {
    const at = timestamp(event.timestamp)
    return failureAt === null || at === null || at > failureAt
  })
  const passAfterFailure = passed.filter((run) => {
    const at = timestamp(run.startedAt || run.finishedAt)
    return failureAt === null || at === null || at > failureAt
  })
  const passAfterSave = saveAfterFailure.some((save) => {
    const saveAt = timestamp(save.timestamp)
    return passAfterFailure.some((run) => {
      const runAt = timestamp(run.startedAt || run.finishedAt)
      return saveAt === null || runAt === null || runAt > saveAt
    })
  })
  const refs = [...failed.map(runRef), ...saveAfterFailure.map(eventRef), ...passAfterFailure.map(runRef)]
  if (passAfterSave) return { score: 2, refs, note: '观察到失败、修改保存和可信通过复验的完整链条' }
  if (passAfterFailure.length || saveAfterFailure.length) return { score: 1, refs, note: '观察到部分迭代行为，但缺少修改后可信复验' }
  return { score: 0, refs: failed.map(runRef), note: '失败后没有观察到修改或复验' }
}

function assertionItem(id, runs) {
  const matches = []
  for (const run of runs) {
    for (const assertion of run.assertions || []) {
      if (ASSERTION_IDS[id].includes(assertion.id)) matches.push({ run, assertion })
    }
  }
  if (!matches.length) return item(id, null, [], '未观察到对应可信断言')
  const passed = matches.find(({ run, assertion }) => run.trusted === true && run.verified === true && assertion.passed === true)
  return passed
    ? item(id, 2, [runRef(passed.run)], passed.assertion.observed || '断言通过')
    : item(id, 0, matches.map(({ run }) => runRef(run)), '断言未在可信通过运行中通过')
}

function scoreReflections(reflectionEvents) {
  const text = textOf(reflectionEvents)
  if (!reflectionEvents.length) {
    return {
      F1: item('F1', null, [], '尚未提交复盘'),
      F2: item('F2', null, [], '尚未提交复盘'),
      T1: item('T1', null, [], '尚未提交迁移对照'),
      T2: item('T2', null, [], '尚未提交反例复盘'),
    }
  }
  const refs = reflectionEvents.map(eventRef)
  return {
    F1: item('F1', JUDGMENT_RE.test(text) && CAUSAL_RE.test(text) ? 2 : JUDGMENT_RE.test(text) ? 1 : 0, refs, '检查是否写出自己的判断与因果解释'),
    F2: item('F2', AI_RE.test(text) && EVIDENCE_RE.test(text) ? 2 : AI_RE.test(text) || EVIDENCE_RE.test(text) ? 1 : 0, refs, '检查是否区分 AI 提醒与实际验证证据'),
    T1: item('T1', TRANSFER_RE.test(text) ? 2 : 0, refs, '检查是否改变条件并进行迁移对照'),
    T2: item('T2', COUNTEREXAMPLE_RE.test(text) ? 2 : 0, refs, '检查是否意识到退出码或单一现象不足以证明结论'),
  }
}

function dimensionScore(items, dimension) {
  const observed = items.filter((entry) => entry.dimension === dimension && entry.score !== null)
  return observed.length ? Math.round(observed.reduce((sum, entry) => sum + entry.score, 0) / (observed.length * 2) * 100) : 0
}

function averageScores(items) {
  const observed = items.filter((entry) => entry.score !== null)
  return observed.length ? Math.round(observed.reduce((sum, entry) => sum + entry.score, 0) / (observed.length * 2) * 100) : 0
}

function buildTrajectory(events, runs, items) {
  const hints = events.filter((event) => event.type === 'hint_requested')
  const iteration = items.find((entry) => entry.id === 'I1')
  return {
    failToPass: iteration?.score === 2,
    trustedRunCount: runs.filter((run) => run.trusted === true).length,
    failedRunCount: runs.filter((run) => run.trusted === true && run.verified !== true).length,
    maxHintLevel: hints.reduce((max, event) => Math.max(max, Number(event.hintLevel || 0)), 0),
    diagnosticUseCount: events.filter((event) => event.type === 'diagnostic_opened').length,
    traceUseCount: events.filter((event) => event.type === 'trace_inspected').length,
    independentSuccess: runs.some((run) => run.trusted === true && run.verified === true) && hints.length === 0,
  }
}

export function assessLearningV3(input) {
  const events = Array.isArray(input.events) ? input.events : []
  const runs = Array.isArray(input.runs) ? input.runs : []
  const studentMessages = events.filter((event) => event.type === 'student_message')
  const reflections = events.filter((event) => event.type === 'reflection_submitted')
  const questionProgress = scoreQuestionProgress(studentMessages)
  const judgment = scoreJudgment(studentMessages)
  const evidence = scoreEvidence(events, studentMessages, runs)
  const hypothesis = scoreHypothesis(studentMessages)
  const verification = scoreVerification(events, runs)
  const iteration = scoreIteration(events, runs)
  const reflectionItems = scoreReflections(reflections)
  const items = [
    item('P2', questionProgress.score, questionProgress.refs, questionProgress.note),
    item('J1', judgment.score, judgment.refs, judgment.note),
    item('E1', evidence.score, evidence.refs, evidence.note),
    item('H1', hypothesis.score, hypothesis.refs, hypothesis.note),
    item('V1', verification.score, verification.refs, verification.note),
    item('I1', iteration.score, iteration.refs, iteration.note),
    assertionItem('R1', runs),
    assertionItem('R2', runs),
    assertionItem('R3', runs),
    assertionItem('R4', runs),
    reflectionItems.F1,
    reflectionItems.F2,
    reflectionItems.T1,
    reflectionItems.T2,
  ]
  const dimensions = {
    process: dimensionScore(items, 'process'),
    result: dimensionScore(items, 'result'),
    reflection: dimensionScore(items, 'reflection'),
  }
  const guardrailCount = events.filter((event) => event.type === 'guardrail_triggered').length
  const guardrailPenalty = Math.min(25, guardrailCount * 5)
  dimensions.process = Math.max(0, dimensions.process - guardrailPenalty)
  const total = Math.round(dimensions.process * 0.45 + dimensions.result * 0.35 + dimensions.reflection * 0.2)
  const learningDimensions = {
    judgment: judgment.score === null ? 0 : judgment.score * 50,
    evidence: evidence.score === null ? 0 : evidence.score * 50,
    hypothesis: hypothesis.score === null ? 0 : hypothesis.score * 50,
    verification: verification.score === null ? 0 : verification.score * 50,
    iteration: iteration.score === null ? 0 : iteration.score * 50,
    reflection: averageScores([reflectionItems.F1, reflectionItems.F2]),
    transfer: averageScores([reflectionItems.T1, reflectionItems.T2]),
  }
  const validEvidence = new Set([
    ...events.map(eventRef).filter(Boolean),
    ...runs.map(runRef).filter(Boolean),
  ])
  const trajectory = buildTrajectory(events, runs, items)
  const llmSuggestion = normalizeLlmSuggestion(input.llmSuggestion, validEvidence)
  return {
    version: RUBRIC_V3_VERSION,
    labId: input.labId,
    sessionId: input.sessionId,
    dimensions,
    learningDimensions,
    total,
    items,
    trajectory,
    llmSuggestion,
    uncertainty: items.some((entry) => entry.status === 'unobserved') ? 'incomplete-evidence' : 'complete',
  }
}

function runsFromEvents(events) {
  return events
    .filter((event) => event.type === 'verification_attempt' && event.runId)
    .map((event) => ({
      runId: event.runId,
      trusted: event.metadata?.trusted === true,
      verified: event.metadata?.verified === true || event.metadata?.passed === true,
      startedAt: event.timestamp,
      finishedAt: event.timestamp,
      assertions: event.assertions || [],
    }))
}

export function scoreLearningEventsV3(events, options = {}) {
  const assessment = assessLearningV3({
    labId: options.labId || 'lab2',
    sessionId: options.sessionId || 'unknown',
    events,
    runs: Array.isArray(options.runs) ? options.runs : runsFromEvents(Array.isArray(events) ? events : []),
  })
  const counts = {
    messages: events.filter((event) => event.type === 'student_message').length,
    verifications: events.filter((event) => event.type === 'verification_attempt').length,
    passedVerifications: events.filter((event) => event.type === 'verification_attempt' && event.metadata?.passed === true).length,
    guardrails: events.filter((event) => event.type === 'guardrail_triggered').length,
    reflections: events.filter((event) => event.type === 'reflection_submitted').length,
  }
  const summary = !counts.messages
    ? '先写下一条自己的判断，评分才会开始形成。'
    : !counts.verifications
      ? '已有判断和提问记录；补一次可信验证，把回答变成可检查证据。'
      : !counts.reflections
        ? '验证已经记录；完成一次三分复盘，闭合判断、AI 提醒和实际证据。'
        : assessment.total >= 80
          ? '判断、证据、验证和复盘已经形成完整证据链。'
          : '闭环已经开始；继续用更具体的现象和假设提高判断质量。'
  return {
    total: assessment.total,
    process: assessment.dimensions.process,
    result: assessment.dimensions.result,
    reflection: assessment.dimensions.reflection,
    thinking: assessment.learningDimensions.judgment,
    questionQuality: assessment.learningDimensions.hypothesis,
    depth: assessment.learningDimensions.evidence,
    verification: assessment.learningDimensions.verification,
    guardrailPenalty: Math.min(25, counts.guardrails * 5),
    learningDimensions: assessment.learningDimensions,
    summary,
    counts,
  }
}
