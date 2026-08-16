const LAB_IDS = new Set(Array.from({ length: 8 }, (_, index) => `lab${index + 1}`))
const STAGE_IDS = new Set(['orient', 'read', 'run', 'debug', 'reflect', 'transfer'])

const EVENT_V1_TYPES = new Set([
  'session_start',
  'stage_enter',
  'template_used',
  'student_message',
  'ai_response',
  'guardrail_triggered',
  'verification_attempt',
  'reflection_submitted',
  'manual_note',
])

const EVENT_V2_TYPES = new Set([
  ...EVENT_V1_TYPES,
  'code_open',
  'code_save',
  'run_started',
  'run_finished',
  'diagnostic_opened',
  'trace_inspected',
  'hint_requested',
  'checkpoint_answered',
  'report_submitted',
  'teacher_reviewed',
  'review_started',
  'review_question_asked',
  'review_answer_submitted',
  'review_answer_evaluated',
  'review_reflection_assessed',
  'review_completed',
])

const TRACE_V1_TYPES = new Set(['trap_enter', 'task_switch'])
const TRACE_TYPES = new Set([...TRACE_V1_TYPES, 'syscall', 'address_space'])
const TRACE_MARKERS = [
  { marker: 'TRACE_V1 ', version: 1 },
  { marker: 'TRACE_V2 ', version: 2 },
]
const HASH_RE = /^[a-f0-9]{64}$/

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isText(value, max = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

export function validateAssertion(assertion) {
  return Boolean(
    isRecord(assertion) &&
      isText(assertion.id, 80) &&
      isText(assertion.label, 200) &&
      typeof assertion.passed === 'boolean' &&
      typeof assertion.expected === 'string' &&
      assertion.expected.length <= 2000 &&
      typeof assertion.observed === 'string' &&
      assertion.observed.length <= 2000 &&
      (typeof assertion.hint === 'undefined' ||
        (typeof assertion.hint === 'string' && assertion.hint.length > 0 && assertion.hint.length <= 2000)),
  )
}

export function validateInteractionEvent(event) {
  if (
    !isRecord(event) ||
    (event.version !== 1 && event.version !== 2) ||
    !isText(event.id, 160) ||
    !isText(event.sessionId, 160) ||
    !LAB_IDS.has(event.labId) ||
    !STAGE_IDS.has(event.stage) ||
    !isText(event.type, 80) ||
    Number.isNaN(Date.parse(event.timestamp))
  ) {
    return false
  }

  if (event.version === 1) return EVENT_V1_TYPES.has(event.type)
  if (!EVENT_V2_TYPES.has(event.type)) return false

  if (event.type === 'run_started') {
    return isText(event.runId, 80) && isText(event.recipeId, 120) && isText(event.workspaceVersion, 160)
  }
  if (event.type === 'run_finished') {
    return Boolean(
      isText(event.runId, 80) &&
        Number.isInteger(event.exitCode) &&
        Number.isInteger(event.duration) &&
        event.duration >= 0 &&
        HASH_RE.test(event.outputHash) &&
        Array.isArray(event.assertions) &&
        event.assertions.every(validateAssertion),
    )
  }
  if (event.type === 'code_open') {
    return isText(event.path, 500) && Number.isInteger(event.line) && event.line >= 1 && isText(event.source, 80)
  }
  if (event.type === 'code_save') {
    return Boolean(
      isText(event.path, 500) &&
        HASH_RE.test(event.baseHash) &&
        HASH_RE.test(event.newHash) &&
        Number.isInteger(event.added) &&
        event.added >= 0 &&
        Number.isInteger(event.deleted) &&
        event.deleted >= 0 &&
        isText(event.taskId, 160),
    )
  }
  if (event.type === 'diagnostic_opened') {
    return isText(event.runId, 80) && isText(event.file, 500) && Number.isInteger(event.line) && event.line >= 1 && isText(event.code, 80)
  }
  if (event.type === 'trace_inspected') {
    return Boolean(
      isText(event.runId, 80) &&
        isText(event.view, 80) &&
        isRecord(event.eventRange) &&
        Number.isInteger(event.eventRange.start) &&
        event.eventRange.start >= 0 &&
        Number.isInteger(event.eventRange.end) &&
        event.eventRange.end >= event.eventRange.start,
    )
  }
  if (event.type === 'hint_requested') {
    return isText(event.checkpointId, 160) && Number.isInteger(event.hintLevel) && event.hintLevel >= 1 && event.hintLevel <= 4
  }
  if (event.type === 'checkpoint_answered') {
    return Boolean(
      isText(event.checkpointId, 160) &&
        isText(event.answerId, 160) &&
        Array.isArray(event.conceptIds) &&
        event.conceptIds.every((item) => isText(item, 160)),
    )
  }
  if (event.type === 'report_submitted') {
    return isText(event.reportVersion, 160) && Array.isArray(event.evidenceRefs) && event.evidenceRefs.every((item) => isText(item, 200))
  }
  if (event.type === 'teacher_reviewed') {
    return isText(event.rubricVersion, 160) && isText(event.decision, 80) && typeof event.comment === 'string' && event.comment.length <= 8000
  }
  if (event.type === 'review_started') return isText(event.reviewId, 160)
  if (['review_question_asked', 'review_answer_submitted'].includes(event.type)) {
    return Boolean(
      isText(event.reviewId, 160) &&
      isText(event.questionId, 160) &&
      Array.isArray(event.conceptIds) &&
      event.conceptIds.length > 0 &&
      event.conceptIds.every((item) => isText(item, 160)),
    )
  }
  if (event.type === 'review_answer_evaluated') {
    return Boolean(
      isText(event.reviewId, 160) &&
      isText(event.questionId, 160) &&
      Array.isArray(event.conceptIds) &&
      event.conceptIds.length > 0 &&
      event.conceptIds.every((item) => isText(item, 160)) &&
      ['passed', 'partial', 'needs-evidence', 'misconception', 'defer'].includes(event.verdict) &&
      Array.isArray(event.evidenceRefs) &&
      event.evidenceRefs.every((item) => isText(item, 200)),
    )
  }
  if (event.type === 'review_completed') {
    return isText(event.reviewId, 160) && Array.isArray(event.evidenceRefs) && event.evidenceRefs.every((item) => isText(item, 200))
  }
  if (event.type === 'review_reflection_assessed') {
    const items = event.metadata?.reviewPerformance?.items
    return Boolean(
      isText(event.reviewId, 160) &&
      Array.isArray(event.evidenceRefs) &&
      event.evidenceRefs.every((item) => isText(item, 200)) &&
      event.metadata?.authority === 'server' &&
      event.metadata?.source === 'socratic-review' &&
      isRecord(items) &&
      ['F1', 'F2', 'T1', 'T2'].every((id) => {
        const score = items[id]?.score
        return isRecord(items[id]) && (score === null || (Number.isInteger(score) && score >= 0 && score <= 2))
      }),
    )
  }
  return true
}

export function validateTraceEvent(event) {
  if (
    !isRecord(event) ||
    ![1, 2].includes(event.v) ||
    !Number.isInteger(event.seq) ||
    event.seq < 0 ||
    !Number.isInteger(event.ts) ||
    event.ts < 0 ||
    !Number.isInteger(event.cpu) ||
    event.cpu < 0 ||
    !Number.isInteger(event.pid) ||
    event.pid < 0 ||
    !Number.isInteger(event.tid) ||
    event.tid < 0 ||
    !(event.v === 1 ? TRACE_V1_TYPES : TRACE_TYPES).has(event.type)
  ) {
    return false
  }
  if (event.type === 'trap_enter') return isText(event.cause, 80)
  if (event.type === 'task_switch') {
    return isText(event.from, 80) && isText(event.to, 80) && isText(event.reason, 120)
  }
  if (event.type === 'syscall') {
    return Number.isInteger(event.id) && event.id >= 0 && isText(event.name, 80)
  }
  return Number.isInteger(event.space) && event.space >= 0 && ['create', 'activate'].includes(event.action)
}

export function collectTraceEvents(output) {
  const events = []
  for (const line of String(output || '').split(/\r?\n/)) {
    const frame = TRACE_MARKERS
      .map((entry) => ({ ...entry, index: line.indexOf(entry.marker) }))
      .filter((entry) => entry.index >= 0)
      .sort((left, right) => left.index - right.index)[0]
    if (!frame) continue
    try {
      const event = JSON.parse(line.slice(frame.index + frame.marker.length))
      if (event.v === frame.version && validateTraceEvent(event)) events.push(event)
    } catch {
      // A malformed teaching trace must not break the underlying lab run.
    }
  }
  return events
}

export function validateRunResult(result) {
  return Boolean(
    isRecord(result) &&
      result.version === 1 &&
      isText(result.runId, 80) &&
      LAB_IDS.has(result.labId) &&
      (result.recipeId === null || isText(result.recipeId, 120)) &&
      isText(result.workspaceVersion, 160) &&
      typeof result.trusted === 'boolean' &&
      Number.isInteger(result.exitCode) &&
      Number.isInteger(result.durationMs) &&
      result.durationMs >= 0 &&
      Array.isArray(result.assertions) &&
      result.assertions.every(validateAssertion) &&
      isRecord(result.output) &&
      HASH_RE.test(result.output.hash) &&
      Number.isInteger(result.output.bytes) &&
      result.output.bytes >= 0 &&
      isRecord(result.trace) &&
      result.trace.version === 1 &&
      Number.isInteger(result.trace.count) &&
      result.trace.count >= 0 &&
      (result.trace.hash === null || HASH_RE.test(result.trace.hash)) &&
      typeof result.verified === 'boolean' &&
      result.verified ===
        (result.trusted && result.exitCode === 0 && result.assertions.length > 0 && result.assertions.every((item) => item.passed)),
  )
}

export const contractValues = Object.freeze({
  labIds: [...LAB_IDS],
  stageIds: [...STAGE_IDS],
  eventV1Types: [...EVENT_V1_TYPES],
  eventV2Types: [...EVENT_V2_TYPES],
  traceTypes: [...TRACE_TYPES],
})
