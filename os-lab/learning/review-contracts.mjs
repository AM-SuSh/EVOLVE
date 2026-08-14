export const REVIEW_PLAN_VERSION = 'socratic-review-plan-v1'
export const REVIEW_STATUSES = Object.freeze([
  'review_planning',
  'review_ready',
  'review_active',
  'awaiting_evidence',
  'review_completed',
  'deferred',
])
export const REVIEW_VERDICTS = Object.freeze([
  'passed',
  'partial',
  'needs-evidence',
  'misconception',
  'defer',
])
export const REVIEW_QUESTION_KINDS = Object.freeze([
  'concept-explanation',
  'causal-explanation',
  'evidence-reflection',
  'counterexample',
  'transfer',
])

function textValue(value, max = 2_000) {
  return String(value || '').trim().slice(0, max)
}

function refs(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => textValue(item, 200)).filter(Boolean))]
}

export function normalizeReviewQuestion(raw, index = 0) {
  const kind = REVIEW_QUESTION_KINDS.includes(raw?.kind) ? raw.kind : 'concept-explanation'
  return {
    questionId: textValue(raw?.questionId || `q${index + 1}`, 160),
    conceptId: textValue(raw?.conceptId, 160),
    kind,
    objective: textValue(raw?.objective),
    prompt: textValue(raw?.prompt, 4_000),
    reason: textValue(raw?.reason),
    passCriteria: (Array.isArray(raw?.passCriteria) ? raw.passCriteria : [])
      .map((item) => textValue(item, 500))
      .filter(Boolean)
      .slice(0, 8),
    evidenceRefs: refs(raw?.evidenceRefs),
    requiresRunEvidence: raw?.requiresRunEvidence === true,
  }
}

export function normalizeReviewPlan(raw, options = {}) {
  const knownConceptIds = options.knownConceptIds instanceof Set ? options.knownConceptIds : null
  const questions = (Array.isArray(raw?.questions) ? raw.questions : [])
    .map(normalizeReviewQuestion)
    .filter((question) => question.questionId && question.conceptId && question.prompt)
  if (questions.length < 3 || questions.length > 5) {
    throw new TypeError('复盘计划必须包含 3-5 个问题')
  }
  if (new Set(questions.map((question) => question.questionId)).size !== questions.length) {
    throw new TypeError('复盘问题 questionId 必须唯一')
  }
  if (knownConceptIds && questions.some((question) => !knownConceptIds.has(question.conceptId))) {
    throw new TypeError('复盘问题包含当前 Lab 之外的 conceptId')
  }
  if (options.requireEvidence === true && questions.some((question) => question.evidenceRefs.length === 0)) {
    throw new TypeError('每个复盘问题都必须引用至少一条过程或运行证据')
  }
  const maxQuestions = Math.max(3, Math.min(5, Number(raw?.maxQuestions) || questions.length))
  if (questions.length > maxQuestions) throw new TypeError('复盘初始问题数不能超过 maxQuestions')
  return {
    version: REVIEW_PLAN_VERSION,
    labId: textValue(raw?.labId, 20),
    sessionId: textValue(raw?.sessionId, 160),
    sourceAssessmentId: textValue(raw?.sourceAssessmentId, 160),
    maxQuestions,
    rationale: textValue(raw?.rationale, 4_000),
    generator: {
      mode: ['remote', 'deterministic'].includes(raw?.generator?.mode)
        ? raw.generator.mode
        : 'deterministic',
      model: textValue(raw?.generator?.model, 160),
      promptVersion: textValue(raw?.generator?.promptVersion || 'assessment-review-v1', 160),
    },
    evidenceRefs: refs(
      Array.isArray(raw?.evidenceRefs) && raw.evidenceRefs.length
        ? raw.evidenceRefs
        : questions.flatMap((question) => question.evidenceRefs),
    ),
    questions,
  }
}

export function normalizeReviewEvaluation(raw) {
  const verdict = REVIEW_VERDICTS.includes(raw?.verdict) ? raw.verdict : 'partial'
  const defaultLabels = {
    passed: '回答正确',
    partial: '部分正确',
    'needs-evidence': '结论待运行证据确认',
    misconception: '回答需要修正',
    defer: '需要教师进一步确认',
  }
  return {
    verdict,
    verdictLabel: textValue(raw?.verdictLabel || defaultLabels[verdict], 160),
    rationale: textValue(raw?.rationale, 2_000),
    evidenceRefs: refs(raw?.evidenceRefs),
    missingEvidence: (Array.isArray(raw?.missingEvidence) ? raw.missingEvidence : [])
      .map((item) => textValue(item, 500))
      .filter(Boolean)
      .slice(0, 8),
    missingPoints: (Array.isArray(raw?.missingPoints) ? raw.missingPoints : [])
      .map((item) => textValue(item, 500))
      .filter(Boolean)
      .slice(0, 8),
    correctReasoning: textValue(raw?.correctReasoning, 4_000),
    correctiveExplanation: textValue(raw?.correctiveExplanation, 4_000),
    followUpObjective: textValue(raw?.followUpObjective, 1_000),
  }
}
