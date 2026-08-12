import { contractValues } from './contracts.mjs'

export const TUTOR_BASELINE_VERSION = 'c0-v1'
export const HARNESS_CASE_VERSION = 1

export const tutorStages = Object.freeze([
  {
    id: 'orient',
    allowedNext: ['read'],
    exitEvidence: ['student_message'],
    description: 'Student states an initial judgment and one uncertainty.',
  },
  {
    id: 'read',
    allowedNext: ['run', 'debug'],
    exitEvidence: ['code_open', 'checkpoint_answered'],
    description: 'Student identifies a state, action, invariant, and source reference.',
  },
  {
    id: 'run',
    allowedNext: ['debug', 'reflect'],
    exitEvidence: ['run_finished'],
    description: 'A trusted server run produces assertions and immutable artifacts.',
  },
  {
    id: 'debug',
    allowedNext: ['run', 'reflect'],
    exitEvidence: ['code_save', 'run_finished'],
    description: 'Student records a falsifiable hypothesis, a change, and a regression run.',
  },
  {
    id: 'reflect',
    allowedNext: ['transfer'],
    exitEvidence: ['review_completed', 'report_submitted'],
    description: 'Student completes the evidence-backed Socratic review and records a final synthesis.',
  },
  {
    id: 'transfer',
    allowedNext: [],
    exitEvidence: ['checkpoint_answered'],
    description: 'Student explains the mechanism under a changed condition.',
  },
])

export const evidenceCatalog = Object.freeze({
  student_message: { authority: 'client', durable: true },
  code_open: { authority: 'client', durable: true },
  code_save: { authority: 'server-verified', durable: true },
  run_started: { authority: 'server', durable: true },
  run_finished: { authority: 'server', durable: true },
  diagnostic_opened: { authority: 'client-with-run', durable: true },
  trace_inspected: { authority: 'client-with-run', durable: true },
  hint_requested: { authority: 'server', durable: true },
  checkpoint_answered: { authority: 'server-verified', durable: true },
  reflection_submitted: { authority: 'client', durable: true },
  review_started: { authority: 'server', durable: true },
  review_question_asked: { authority: 'server', durable: true },
  review_answer_submitted: { authority: 'server', durable: true },
  review_answer_evaluated: { authority: 'server', durable: true },
  review_completed: { authority: 'server', durable: true },
  report_submitted: { authority: 'server-verified', durable: true },
  teacher_reviewed: { authority: 'teacher', durable: true },
})

export const stageEvidenceMatrix = Object.freeze(
  Object.fromEntries(tutorStages.map((stage) => [stage.id, [...stage.exitEvidence]])),
)

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isText(value, max = 4000) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

export function validateHarnessCase(testCase) {
  if (
    !isRecord(testCase) ||
    testCase.version !== HARNESS_CASE_VERSION ||
    !isText(testCase.id, 120) ||
    !contractValues.labIds.includes(testCase.labId) ||
    !tutorStages.some((stage) => stage.id === testCase.initialStage) ||
    !Array.isArray(testCase.turns) ||
    testCase.turns.length === 0 ||
    !isRecord(testCase.expected)
  ) {
    return false
  }

  if (
    testCase.turns.some(
      (turn) =>
        !isRecord(turn) ||
        !isText(turn.student, 20_000) ||
        !Array.isArray(turn.evidence) ||
        turn.evidence.some((item) => !isRecord(item) || !isText(item.type, 80) || !isRecord(item.payload)),
    )
  ) {
    return false
  }

  const allowedStages = testCase.expected.allowedStages
  const requiredActions = testCase.expected.requiredActions
  const forbiddenPatterns = testCase.expected.forbiddenPatterns
  return Boolean(
    Array.isArray(allowedStages) &&
      allowedStages.length > 0 &&
      allowedStages.every((stage) => tutorStages.some((item) => item.id === stage)) &&
      Array.isArray(requiredActions) &&
      requiredActions.every((action) => isText(action, 120)) &&
      Array.isArray(forbiddenPatterns) &&
      forbiddenPatterns.every((pattern) => isText(pattern, 500)),
  )
}

export function auditBaseline() {
  const stageIds = new Set(tutorStages.map((stage) => stage.id))
  const errors = []
  if (stageIds.size !== tutorStages.length) errors.push('duplicate-stage')
  for (const stage of tutorStages) {
    if (stage.allowedNext.some((next) => !stageIds.has(next))) errors.push(`unknown-transition:${stage.id}`)
    if (stage.exitEvidence.some((type) => !evidenceCatalog[type])) errors.push(`unknown-evidence:${stage.id}`)
  }
  for (const type of contractValues.eventV2Types) {
    if (['session_start', 'stage_enter', 'template_used', 'ai_response', 'guardrail_triggered', 'verification_attempt', 'manual_note'].includes(type)) continue
    if (!evidenceCatalog[type]) errors.push(`unclassified-event:${type}`)
  }
  return { ok: errors.length === 0, errors }
}
