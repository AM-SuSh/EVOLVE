import { randomUUID } from 'node:crypto'

import { loadConceptCatalog } from './concept-catalog.mjs'
import { normalizeReviewEvaluation, normalizeReviewPlan } from './review-contracts.mjs'

export const ASSESSMENT_AGENT_PROMPT_VERSION = 'assessment-review-v2'
export const ASSESSMENT_SCORING_PROMPT_VERSION = 'assessment-behavior-score-v1'

const MAX_EVENTS = 160
const MAX_MESSAGES = 120
const MAX_TEXT = 1_200

function text(value, max = MAX_TEXT) {
  return String(value || '').trim().slice(0, max)
}

function eventRef(event) {
  return event?.id ? `event:${event.id}` : ''
}

function runRef(run) {
  return run?.runId ? `run:${run.runId}` : ''
}

function reportText(reportDraft) {
  if (!reportDraft || typeof reportDraft !== 'object') return ''
  const sections = Object.entries(reportDraft.sections || {})
    .filter(([key]) => key !== 'reflection')
    .map(([key, value]) => `${key}: ${text(value, 2_000)}`)
  return text([reportDraft.markdownBody, ...sections].filter(Boolean).join('\n'), 8_000)
}

function publicEvent(event) {
  return {
    ref: eventRef(event),
    type: text(event?.type, 80),
    stage: text(event?.stage, 40),
    timestamp: text(event?.timestamp, 80),
    category: text(event?.category, 80),
    content: text(event?.content),
    path: text(event?.path, 500),
    file: text(event?.file, 500),
    code: text(event?.code, 80),
    hintLevel: Number(event?.hintLevel || 0),
    runId: text(event?.runId, 80),
  }
}

function publicMessage(message, index) {
  return {
    index: index + 1,
    role: message?.role === 'assistant' ? 'assistant' : 'student',
    stage: text(message?.stage, 40),
    category: text(message?.category, 80),
    content: text(message?.content, 2_000),
    hintLevel: Number(message?.hintLevel || 0),
    evidenceRefs: Array.isArray(message?.evidenceRefs)
      ? message.evidenceRefs.map((ref) => text(ref, 200)).filter(Boolean).slice(0, 20)
      : [],
  }
}

function publicRun(run) {
  return {
    ref: runRef(run),
    trusted: run?.trusted === true,
    verified: run?.verified === true,
    status: text(run?.status, 40),
    startedAt: text(run?.startedAt, 80),
    finishedAt: text(run?.finishedAt, 80),
    assertions: (Array.isArray(run?.assertions) ? run.assertions : []).map((assertion) => ({
      id: text(assertion?.id, 80),
      label: text(assertion?.label, 200),
      passed: assertion?.passed === true,
      expected: text(assertion?.expected, 500),
      observed: text(assertion?.observed, 500),
    })),
  }
}

export function buildReviewEvidenceBundle(input) {
  const labId = text(input?.labId, 20)
  const catalog = loadConceptCatalog().labs[labId]
  if (!catalog) throw new TypeError('unknown lab for assessment bundle')
  const events = (Array.isArray(input?.events) ? input.events : []).slice(-MAX_EVENTS).map(publicEvent)
  const runs = (Array.isArray(input?.runs) ? input.runs : []).map(publicRun)
  const conversationMessages = (Array.isArray(input?.conversation?.messages)
    ? input.conversation.messages
    : []).slice(-MAX_MESSAGES).map(publicMessage)
  const evidenceRefs = new Set([
    ...events.map((event) => event.ref),
    ...runs.map((run) => run.ref),
  ].filter(Boolean))
  const report = reportText(input?.reportDraft)
  if (report) evidenceRefs.add(`report:draft:${labId}`)
  return {
    version: 'review-evidence-bundle-v1',
    labId,
    sessionId: text(input?.sessionId, 160),
    catalog: {
      title: catalog.title,
      recipeId: catalog.recipeId,
      concepts: catalog.concepts,
      checkpoints: catalog.checkpoints,
      transferPrompts: catalog.transferPrompts,
    },
    events,
    runs,
    conversation: {
      messageCount: conversationMessages.length,
      messages: conversationMessages,
    },
    report: report ? { ref: `report:draft:${labId}`, content: report } : null,
    rubricAssessment: input?.assessment || null,
    mastery: Array.isArray(input?.mastery) ? input.mastery.slice(0, 80) : [],
    validEvidenceRefs: [...evidenceRefs],
  }
}

function searchableConcept(concept) {
  return [
    concept.conceptId, concept.title, concept.summary,
    ...(concept.sourceAnchors || []),
    ...(concept.invariants || []),
    ...(concept.misconceptions || []).flatMap((item) => [item.id, item.statement, item.counter]),
  ].join(' ').toLowerCase()
}

function evidenceText(bundle) {
  return [
    ...bundle.events.map((event) => `${event.ref} ${event.type} ${event.content} ${event.path} ${event.file} ${event.code}`),
    ...bundle.conversation.messages.map((message) => `${message.role} ${message.content}`),
    bundle.report?.content || '',
  ].join('\n').toLowerCase()
}

function conceptEvidence(bundle, concept) {
  const anchors = [concept.title, ...concept.sourceAnchors, ...concept.assertionIds]
    .map((value) => String(value || '').toLowerCase())
    .filter((value) => value.length >= 2)
  const refs = []
  for (const event of bundle.events) {
    const haystack = `${event.content} ${event.path} ${event.file} ${event.code}`.toLowerCase()
    if (anchors.some((anchor) => haystack.includes(anchor))) refs.push(event.ref)
  }
  for (const run of bundle.runs) {
    if (run.assertions.some((assertion) => concept.assertionIds.includes(assertion.id))) refs.push(run.ref)
  }
  return [...new Set(refs.filter(Boolean))]
}

function scoreConcept(bundle, concept, allText) {
  let score = 0
  const refs = conceptEvidence(bundle, concept)
  const failed = bundle.runs.flatMap((run) => run.assertions
    .filter((assertion) => concept.assertionIds.includes(assertion.id) && !assertion.passed)
    .map(() => run.ref))
  const passed = bundle.runs.flatMap((run) => run.assertions
    .filter((assertion) => concept.assertionIds.includes(assertion.id) && assertion.passed)
    .map(() => run.ref))
  score += failed.length * 6
  score += refs.length * 2
  score += passed.length
  for (const misconception of concept.misconceptions || []) {
    const terms = [misconception.id, misconception.statement].filter(Boolean)
    if (terms.some((term) => allText.includes(String(term).toLowerCase()))) score += 4
  }
  const sourceMentioned = (concept.sourceAnchors || []).some((source) => allText.includes(String(source).toLowerCase()))
  if (sourceMentioned) score += 2
  const highHints = bundle.events.filter((event) => event.type === 'hint_requested' && event.hintLevel >= 2).length
  if (refs.length && highHints) score += Math.min(4, highHints)
  return { concept, score, refs, failed, passed }
}

function fallbackRefs(bundle) {
  const messageRefs = bundle.events
    .filter((event) => ['student_message', 'ai_response', 'hint_requested'].includes(event.type))
    .map((event) => event.ref)
  const runRefs = bundle.runs.map((run) => run.ref)
  return [...new Set([...messageRefs.slice(-4), ...runRefs.slice(-2), bundle.report?.ref].filter(Boolean))]
}

function misconceptionFor(concept, allText) {
  return (concept.misconceptions || []).find((item) =>
    [item.id, item.statement].filter(Boolean).some((term) => allText.includes(String(term).toLowerCase())),
  ) || concept.misconceptions?.[0] || null
}

function reviewHistory(options = {}) {
  const questions = Array.isArray(options.previousQuestions) ? options.previousQuestions : []
  const conceptCounts = new Map()
  const kindCounts = new Map()
  const prompts = new Set()
  for (const question of questions) {
    const conceptId = text(question?.conceptId, 160)
    const kind = text(question?.kind, 80)
    const prompt = text(question?.prompt, 4_000).replace(/\s+/g, ' ').toLowerCase()
    if (conceptId) conceptCounts.set(conceptId, (conceptCounts.get(conceptId) || 0) + 1)
    if (conceptId && kind) {
      const key = `${conceptId}:${kind}`
      kindCounts.set(key, (kindCounts.get(key) || 0) + 1)
    }
    if (prompt) prompts.add(prompt)
  }
  return { questions, conceptCounts, kindCounts, prompts }
}

function questionVariant(history, conceptId, kind) {
  return ((history.kindCounts.get(`${conceptId}:${kind}`) || 0)
    + (history.conceptCounts.get(conceptId) || 0)) % 3
}

function evidenceReflectionPrompt(concept, variant) {
  return [
    `结合你本次实验中的一条运行结果或代码观察，解释“${concept.title}”是如何工作的：这条证据对应机制的哪一步？`,
    `围绕“${concept.title}”，你认为本次实验里哪条运行现象或断言最能证明它按预期工作？请说明这条证据为什么能支持结论。`,
    `如果要向同学证明“${concept.title}”确实在起作用，你会引用本次实验中的哪条现象或代码路径？请说明它与机制之间的因果关系。`,
  ][variant]
}

function conceptPrompt(concept, misconception, variant) {
  if (misconception) {
    return [
      `有人认为“${misconception.statement || misconception.id}”。结合本实验中的“${concept.title}”，你认为这个说法哪里不完整或错误？请用实际路径或现象说明。`,
      `请为“${misconception.statement || misconception.id}”构造一个反例，并沿本实验的代码路径解释“${concept.title}”真正成立的条件。`,
      `假设同学依据本次运行结果得出“${misconception.statement || misconception.id}”，你会检查哪两个位置或现象来纠正这个判断？请说明它们之间的因果关系。`,
    ][variant]
  }
  return [
    `请不用照抄手册，用自己的话解释“${concept.title}”在本实验中的作用，并指出一个能验证这段解释的代码位置或运行现象。`,
    `把“${concept.title}”写成一条从触发条件到可观察结果的因果链，并说明本实验中哪条证据能证伪其中一步。`,
    `如果只看最终测试通过，可能会误解“${concept.title}”的哪一步机制？请结合代码路径与运行现象补全解释。`,
  ][variant]
}

function transferPrompt(bundle, concept, variant) {
  const catalogPrompts = bundle.catalog.transferPrompts || []
  if (variant < catalogPrompts.length) return catalogPrompts[variant]
  return [
    `如果改变“${concept.title}”所依赖的一个关键条件，哪些不变量仍必须成立，哪些实现会变化？`,
    `把“${concept.title}”迁移到一个输入、权限或调度条件不同的场景：原结论哪部分仍成立，哪部分必须重新验证？`,
    `假设本实验中的一个前置条件被移除，你预计“${concept.title}”相关的第一处可观察变化是什么？怎样设计验证来区分两种解释？`,
  ][(variant - catalogPrompts.length) % 3]
}

export function generateDeterministicReviewPlan(bundle, options = {}) {
  const allText = evidenceText(bundle)
  const history = reviewHistory(options)
  const ranked = bundle.catalog.concepts
    .map((concept) => scoreConcept(bundle, concept, allText))
    .sort((left, right) => {
      const historyDelta = (history.conceptCounts.get(left.concept.conceptId) || 0)
        - (history.conceptCounts.get(right.concept.conceptId) || 0)
      return historyDelta || right.score - left.score
        || left.concept.conceptId.localeCompare(right.concept.conceptId)
    })
  const selected = ranked.length >= 3
    ? ranked.slice(0, 3)
    : [ranked[0], ranked[1] || ranked[0], ranked[0]].filter(Boolean)
  const globalRefs = fallbackRefs(bundle)
  const questions = selected.map((entry, index) => {
    const concept = entry.concept
    const evidenceRefs = [...new Set([...entry.refs, ...entry.failed, ...entry.passed])].slice(0, 8)
    const refs = evidenceRefs.length ? evidenceRefs : globalRefs
    const misconception = misconceptionFor(concept, allText)
    if (index === 0) {
      const kind = 'evidence-reflection'
      const variant = questionVariant(history, concept.conceptId, kind)
      return {
        questionId: `review-${randomUUID()}`,
        conceptId: concept.conceptId,
        kind,
        objective: `确认 ${concept.title} 的机制理解与证据对应`,
        prompt: evidenceReflectionPrompt(concept, variant),
        reason: entry.failed.length
          ? '该概念关联过失败断言，需要确认学生能解释从失败到通过的证据链。'
          : '该概念在实验行为或 Tutor 对话中出现，需要确认学生能把机制解释和实际证据对应起来。',
        passCriteria: [
          ...(concept.invariants || []).slice(0, 2),
          '结合具体证据（代码路径或运行现象）说明结论',
        ],
        evidenceRefs: refs,
        requiresRunEvidence: entry.failed.length > 0 || concept.passCriteria.requiresTrustedRun,
      }
    }
    if (index === selected.length - 1) {
      const kind = 'transfer'
      const variant = questionVariant(history, concept.conceptId, kind)
      return {
        questionId: `review-${randomUUID()}`,
        conceptId: concept.conceptId,
        kind,
        objective: `检查 ${concept.title} 的迁移理解`,
        prompt: transferPrompt(bundle, concept, variant),
        reason: '最终复盘需要检查学生能否把本实验结论迁移到变化条件，而不只是复述运行结果。',
        passCriteria: ['指出至少一个不变量', '指出至少一个变化条件', '给出因果解释或可验证预测'],
        evidenceRefs: refs,
        requiresRunEvidence: false,
      }
    }
    const kind = misconception ? 'counterexample' : 'concept-explanation'
    const variant = questionVariant(history, concept.conceptId, kind)
    return {
      questionId: `review-${randomUUID()}`,
      conceptId: concept.conceptId,
      kind,
      objective: `确认 ${concept.title} 的机制理解`,
      prompt: conceptPrompt(concept, misconception, variant),
      reason: '通过反例或机制解释确认学生不是仅凭最终通过状态判断掌握。',
      passCriteria: [
        ...(concept.invariants || []).slice(0, 2),
        '解释与本实验代码或现象的关系',
      ],
      evidenceRefs: refs,
      requiresRunEvidence: concept.passCriteria.requiresTrustedRun,
    }
  })
  return normalizeReviewPlan({
    labId: bundle.labId,
    sessionId: bundle.sessionId,
    sourceAssessmentId: options.sourceAssessmentId || '',
    maxQuestions: 5,
    rationale: history.questions.length
      ? '根据完整 Tutor 对话、学习事件、工作区行为和可信运行生成，并避开近期复盘中已经使用的问题与题型；默认三题，后续追问也计入五题上限。'
      : '根据完整 Tutor 对话、学习事件、工作区行为和可信运行生成；默认三题，后续追问也计入五题上限。',
    generator: { mode: 'deterministic', promptVersion: ASSESSMENT_AGENT_PROMPT_VERSION },
    evidenceRefs: globalRefs,
    questions,
  }, {
    knownConceptIds: new Set(bundle.catalog.concepts.map((concept) => concept.conceptId)),
    requireEvidence: true,
  })
}

function parseJsonObject(raw) {
  const source = String(raw || '').trim()
  const unfenced = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) throw new TypeError('Assessment Agent 未返回 JSON 对象')
  return JSON.parse(unfenced.slice(start, end + 1))
}

function completionText(payload) {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? payload?.text
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((item) => item?.text || '').join('')
  return ''
}

async function callJsonAgent({ llm, system, input, fetchImpl = fetch }) {
  if (!llm?.upstream || !llm?.model) throw new Error('Assessment Agent model is not configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, Number(llm.timeoutMs || 45_000)))
  try {
    const response = await fetchImpl(`${String(llm.upstream).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(llm.apiKey ? { Authorization: `Bearer ${llm.apiKey}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: llm.model,
        temperature: 0.1,
        max_tokens: 2_400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `Assessment Agent returned ${response.status}`)
    return parseJsonObject(completionText(payload))
  } finally {
    clearTimeout(timeout)
  }
}

const BEHAVIOR_CRITERIA = Object.freeze([
  ['B1', '是否用自己的话提出判断、假设或机制解释'],
  ['B2', '是否主要用概念、现象或调试问题推进，而不是索要完整答案'],
  ['B3', 'AI 给出提示后是否继续追问、检查代码或修改实现'],
  ['B4', '是否把对话推进到可信运行、诊断或失败后的再次验证'],
  ['B5', '是否较少在没有证据时重复索要完整答案'],
  ['B6', '是否能区分自己的判断、AI 的帮助和实际验证证据'],
])

function boundedScore(value) {
  const score = Number(value)
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null
}

function boundedTextList(value, maxItems = 4, maxLength = 500) {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function validBehaviorRefs(value, validRefs) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((ref) => text(ref, 200))
    .filter((ref) => ref && validRefs.has(ref)))]
}

function normalizeBehaviorScore(raw, bundle, llm) {
  const validRefs = new Set(bundle.validEvidenceRefs)
  const citedRefs = [
    ...(Array.isArray(raw?.evidenceRefs) ? raw.evidenceRefs : []),
    ...(Array.isArray(raw?.criteria) ? raw.criteria.flatMap((criterion) => criterion?.evidenceRefs || []) : []),
  ].map((ref) => text(ref, 200)).filter(Boolean)
  const invalidRef = citedRefs.find((ref) => !validRefs.has(ref))
  if (invalidRef) throw new TypeError(`Assessment scoring Agent 引用了不存在的证据：${invalidRef}`)

  const score = boundedScore(raw?.score)
  const evidenceRefs = validBehaviorRefs(raw?.evidenceRefs, validRefs)
  if (score === null) throw new TypeError('Assessment scoring Agent 未返回 0-100 分数')
  if (validRefs.size && !evidenceRefs.length) {
    throw new TypeError('Assessment scoring Agent 未提供总评证据引用')
  }

  const incomingCriteria = new Map((Array.isArray(raw?.criteria) ? raw.criteria : [])
    .map((criterion) => [text(criterion?.id, 10), criterion]))
  const criteria = BEHAVIOR_CRITERIA.map(([id, label]) => {
    const criterion = incomingCriteria.get(id) || {}
    const status = ['met', 'partial', 'not-met', 'unobserved'].includes(criterion.status)
      ? criterion.status
      : 'unobserved'
    return {
      id,
      label,
      status,
      rationale: text(criterion.rationale, 600),
      evidenceRefs: validBehaviorRefs(criterion.evidenceRefs, validRefs),
    }
  })
  return {
    status: 'scored',
    mode: 'remote',
    score,
    model: text(llm?.model, 160) || 'unknown',
    promptVersion: ASSESSMENT_SCORING_PROMPT_VERSION,
    rationale: text(raw?.rationale, 1_200),
    strengths: boundedTextList(raw?.strengths),
    improvements: boundedTextList(raw?.improvements),
    evidenceRefs,
    criteria,
    error: '',
  }
}

/**
 * 独立 Assessment Agent 只评价学生如何借助 AI 推进学习。
 * Lab 断言是否通过仅能作为“完成了可信验证”的行为证据，不能形成单独结果分。
 */
export async function scoreAssessmentBehavior(bundle, options = {}) {
  if (!options.llm) {
    return {
      assessment: {
        status: 'not-requested', mode: 'unavailable', score: null, model: '',
        promptVersion: ASSESSMENT_SCORING_PROMPT_VERSION, rationale: '', strengths: [],
        improvements: [], evidenceRefs: [], criteria: [], error: '',
      },
      agent: { mode: 'unavailable', error: '' },
    }
  }
  if (!bundle.validEvidenceRefs.length) {
    return {
      assessment: {
        status: 'insufficient-evidence', mode: 'unavailable', score: null,
        model: text(options.llm.model, 160), promptVersion: ASSESSMENT_SCORING_PROMPT_VERSION,
        rationale: '当前没有可供 Agent 核对的学习行为证据。', strengths: [], improvements: [],
        evidenceRefs: [], criteria: [], error: '',
      },
      agent: { mode: 'unavailable', model: options.llm.model, error: '' },
    }
  }
  try {
    const raw = await callJsonAgent({
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      system: [
        '你是独立的 EVOLVE Assessment scoring Agent，只评价学生如何借助 AI 推进学习。只输出 JSON。',
        '综合学生消息、AI 回复、工作区行为、可信运行、诊断与反思；不得只看最终运行是否通过。',
        '可信运行通过只能证明学生完成了验证行为，不得另设实验结果分，也不得因断言数量多重复加分。',
        '按 B1-B6 六项检查学生是否提出判断、进行非代做式提问、跟进 AI 提示、用证据验证、避免无证据索要答案并完成元认知区分。',
        '总分为 0-100。每个肯定判断必须引用 validEvidenceRefs 中的 event:/run:/report:；没有证据必须标为 unobserved。',
        '不得引用输入中不存在的证据，不得评价学生身份、写作风格、消息数量或最终代码质量。',
        '输出字段：score,rationale,strengths[],improvements[],evidenceRefs[],criteria[]。',
        'criteria 必须覆盖 B1-B6；每项含 id,status(met|partial|not-met|unobserved),rationale,evidenceRefs。',
      ].join('\n'),
      input: {
        task: 'score-learning-behavior',
        rubric: BEHAVIOR_CRITERIA.map(([id, label]) => ({ id, label })),
        labId: bundle.labId,
        sessionId: bundle.sessionId,
        events: bundle.events,
        runs: bundle.runs,
        conversation: bundle.conversation,
        report: bundle.report,
        ruleAssessment: bundle.rubricAssessment,
        validEvidenceRefs: bundle.validEvidenceRefs,
      },
    })
    const assessment = normalizeBehaviorScore(raw, bundle, options.llm)
    return { assessment, agent: { mode: 'remote', model: assessment.model, error: '' } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      assessment: {
        status: 'unavailable', mode: 'unavailable', score: null,
        model: text(options.llm.model, 160), promptVersion: ASSESSMENT_SCORING_PROMPT_VERSION,
        rationale: 'Agent 本次未完成评价，综合分已回退到规则基线。', strengths: [],
        improvements: [], evidenceRefs: [], criteria: [], error: message,
      },
      agent: { mode: 'unavailable', model: options.llm.model, error: message },
    }
  }
}

function validatePlanEvidence(plan, validEvidenceRefs) {
  const valid = new Set(validEvidenceRefs)
  const invalid = [
    ...(plan.evidenceRefs || []),
    ...plan.questions.flatMap((question) => question.evidenceRefs || []),
  ].filter((ref) => !valid.has(ref))
  if (invalid.length) throw new TypeError(`Assessment Agent 引用了不存在的证据：${invalid[0]}`)
}

function validatePlanNovelty(plan, previousQuestions = []) {
  const previousPrompts = new Set(previousQuestions.map((question) =>
    text(question?.prompt, 4_000).replace(/\s+/g, ' ').toLowerCase(),
  ).filter(Boolean))
  const duplicate = plan.questions.find((question) =>
    previousPrompts.has(text(question.prompt, 4_000).replace(/\s+/g, ' ').toLowerCase()),
  )
  if (duplicate) throw new TypeError('Assessment Agent 重复了近期复盘问题')
}

export async function createAssessmentReviewPlan(bundle, options = {}) {
  const fallback = generateDeterministicReviewPlan(bundle, options)
  if (!options.llm) return { plan: fallback, agent: { mode: 'deterministic', error: '' } }
  try {
    const raw = await callJsonAgent({
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      system: [
        '你是独立的 EVOLVE Assessment Agent，不直接面向学生。',
        '根据完整行为证据生成 3-5 个苏格拉底复盘问题，默认 3 个。',
        '必须综合 Tutor 对话、工作区事件、可信运行、诊断/Trace 和报告；不能只看最终运行。',
        '只输出 JSON。conceptId 必须来自输入目录，evidenceRefs 必须逐字来自 validEvidenceRefs。',
        '不要因为未观察到就断言学生不掌握；低置信度应使用诊断性问题。',
        '问题要覆盖理解确认、过程证据反思和迁移，避免重复已在对话中充分证明的内容。',
        '问题只检验机制理解与证据对应，不得要求学生按固定叙事格式回答（例如先复述自己最初的错误判断再给出修正）。',
        'passCriteria 必须是可从回答内容判断的知识要点，不得是表达格式或叙事结构要求。',
        'reviewHistory 是近期已经问过的问题；本次不得原样复用问题，优先覆盖未问概念，必须复查薄弱点时要更换题型或情境。',
        '输出字段：maxQuestions,rationale,questions[]；每题含 questionId,conceptId,kind,objective,prompt,reason,passCriteria,evidenceRefs,requiresRunEvidence。',
      ].join('\n'),
      input: {
        ...bundle,
        reviewHistory: (Array.isArray(options.previousQuestions) ? options.previousQuestions : []).slice(0, 25),
      },
    })
    const plan = normalizeReviewPlan({
      ...raw,
      labId: bundle.labId,
      sessionId: bundle.sessionId,
      sourceAssessmentId: options.sourceAssessmentId || '',
      generator: {
        mode: 'remote', model: options.llm.model, promptVersion: ASSESSMENT_AGENT_PROMPT_VERSION,
      },
    }, {
      knownConceptIds: new Set(bundle.catalog.concepts.map((concept) => concept.conceptId)),
      requireEvidence: true,
    })
    validatePlanEvidence(plan, bundle.validEvidenceRefs)
    validatePlanNovelty(plan, options.previousQuestions)
    return { plan, agent: { mode: 'remote', model: options.llm.model, error: '' } }
  } catch (error) {
    return {
      plan: fallback,
      agent: { mode: 'deterministic', model: options.llm.model, error: error instanceof Error ? error.message : String(error) },
    }
  }
}

function criterionTerms(criteria) {
  return criteria.map((criterion) =>
    String(criterion || '').match(/[A-Za-z_][A-Za-z0-9_-]*|[\u4e00-\u9fff]{2,6}/g) || [],
  )
}

function referenceReasoning(question, bundle) {
  const concept = bundle.catalog.concepts.find((item) => item.conceptId === question.conceptId)
  const mechanism = concept?.summary || question.objective
  const invariants = (concept?.invariants || []).slice(0, 2)
  const observations = (concept?.observableEvidence || []).slice(0, 2)
  return [
    mechanism ? `核心机制：${mechanism}` : '',
    question.passCriteria?.length ? `完整回答应覆盖：${question.passCriteria.join('；')}。` : '',
    invariants.length ? `必须保持的不变量：${invariants.join('；')}。` : '',
    observations.length ? `可检查证据：${observations.join('；')}。` : '',
  ].filter(Boolean).join('\n')
}

export function evaluateReviewAnswerDeterministically(question, answer, bundle) {
  const value = text(answer, 8_000)
  const terms = criterionTerms(question.passCriteria || [])
  const matchedIndexes = terms
    .map((group, index) => group.some((term) => value.toLowerCase().includes(term.toLowerCase())) ? index : -1)
    .filter((index) => index >= 0)
  const matched = matchedIndexes.length
  const hasRequiredRun = !question.requiresRunEvidence || (question.evidenceRefs || []).some((ref) =>
    ref.startsWith('run:') && bundle.runs.some((run) => run.ref === ref && run.trusted && run.verified),
  )
  let verdict = 'partial'
  if (!hasRequiredRun) verdict = 'needs-evidence'
  else if (value.length >= 30 && (!terms.length || matched >= Math.max(1, Math.ceil(terms.length / 2)))) verdict = 'passed'
  else if (value.length < 8) verdict = 'misconception'
  const missingPoints = (question.passCriteria || [])
    .filter((_, index) => !matchedIndexes.includes(index))
    .slice(0, 4)
  const correctReasoning = referenceReasoning(question, bundle)
  return normalizeReviewEvaluation({
    verdict,
    rationale: verdict === 'passed'
      ? '回答覆盖了本题的主要通过标准，并与已有证据一致。'
      : verdict === 'needs-evidence'
        ? '解释尚缺本题要求的可信运行证据。'
        : '回答尚未覆盖足够的因果关系或可检查证据。',
    evidenceRefs: (question.evidenceRefs || []).filter((ref) => bundle.validEvidenceRefs.includes(ref)),
    missingEvidence: verdict === 'needs-evidence' ? ['补充与该概念对应的可信运行或断言'] : [],
    missingPoints: verdict === 'passed' ? [] : missingPoints,
    correctReasoning,
    correctiveExplanation: verdict === 'passed'
      ? '你的回答已经形成了可检查的解释。请保留“机制、证据、结论”之间的对应关系。'
      : `你的回答还有可以补充的地方，参考解释如下：\n${correctReasoning}`,
    followUpObjective: verdict === 'partial' || verdict === 'misconception'
      ? question.objective
      : '',
  })
}

export async function evaluateAssessmentReviewAnswer(question, answer, bundle, options = {}) {
  const fallback = evaluateReviewAnswerDeterministically(question, answer, bundle)
  if (!options.llm) return { evaluation: fallback, agent: { mode: 'deterministic', error: '' } }
  try {
    const raw = await callJsonAgent({
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      system: [
        '你是独立的 EVOLVE Assessment Agent，评价一条复盘回答。只输出 JSON。',
        'verdict 只能是 passed, partial, needs-evidence, misconception, defer。',
        '只根据回答是否体现了正确的机制理解来判定，不评价表达方式或叙事顺序；学生不需要先复述自己曾经的错误判断。',
        '只要回答覆盖了 passCriteria 中的知识要点且与证据一致，即使措辞简短或顺序不同也应判 passed。',
        '只能引用 validEvidenceRefs；口头回答不能覆盖可信运行；没有证据时不能宣布实现正确。',
        '必须明确告诉学生回答是正确、部分正确还是需要修正，并给出具体缺失点和完整的参考因果链；不能只说“缺少关键因果”。',
        '输出 verdict,verdictLabel,rationale,evidenceRefs,missingEvidence,missingPoints,correctReasoning,correctiveExplanation,followUpObjective。',
      ].join('\n'),
      input: { question, answer: text(answer, 8_000), evidence: bundle },
    })
    const evaluation = normalizeReviewEvaluation({
      ...fallback,
      ...raw,
      verdictLabel: raw.verdictLabel || fallback.verdictLabel,
      missingPoints: Array.isArray(raw.missingPoints) ? raw.missingPoints : fallback.missingPoints,
      correctReasoning: raw.correctReasoning || fallback.correctReasoning,
      correctiveExplanation: raw.correctiveExplanation || fallback.correctiveExplanation,
    })
    const valid = new Set(bundle.validEvidenceRefs)
    if (evaluation.evidenceRefs.some((ref) => !valid.has(ref))) throw new TypeError('answer evaluation cited invalid evidence')
    const hasRequiredRun = !question.requiresRunEvidence || evaluation.evidenceRefs.some((ref) =>
      ref.startsWith('run:') && bundle.runs.some((run) => run.ref === ref && run.trusted && run.verified),
    )
    if (!hasRequiredRun && evaluation.verdict === 'passed') {
      return {
        evaluation: normalizeReviewEvaluation({
          ...evaluation,
          verdict: 'needs-evidence',
          verdictLabel: '结论待运行证据确认',
          rationale: '模型判断不能覆盖本题要求的可信运行证据。',
          missingEvidence: ['补充与该概念对应的可信运行或断言'],
          correctiveExplanation: `当前口头解释不能替代可信运行。完成对应验证后，再按机制、现象和断言结果建立证据链。\n${evaluation.correctReasoning}`,
        }),
        agent: { mode: 'remote', model: options.llm.model, error: '' },
      }
    }
    return { evaluation, agent: { mode: 'remote', model: options.llm.model, error: '' } }
  } catch (error) {
    return {
      evaluation: fallback,
      agent: { mode: 'deterministic', model: options.llm.model, error: error instanceof Error ? error.message : String(error) },
    }
  }
}
