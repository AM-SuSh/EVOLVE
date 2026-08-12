import { randomUUID } from 'node:crypto'

import { loadConceptCatalog } from './concept-catalog.mjs'
import { normalizeReviewEvaluation, normalizeReviewPlan } from './review-contracts.mjs'

export const ASSESSMENT_AGENT_PROMPT_VERSION = 'assessment-review-v1'

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

export function generateDeterministicReviewPlan(bundle, options = {}) {
  const allText = evidenceText(bundle)
  const ranked = bundle.catalog.concepts
    .map((concept) => scoreConcept(bundle, concept, allText))
    .sort((left, right) => right.score - left.score || left.concept.conceptId.localeCompare(right.concept.conceptId))
  const selected = ranked.slice(0, Math.min(3, Math.max(2, ranked.length)))
  const globalRefs = fallbackRefs(bundle)
  const questions = selected.map((entry, index) => {
    const concept = entry.concept
    const evidenceRefs = [...new Set([...entry.refs, ...entry.failed, ...entry.passed])].slice(0, 8)
    const refs = evidenceRefs.length ? evidenceRefs : globalRefs
    const misconception = misconceptionFor(concept, allText)
    if (index === 0) {
      return {
        questionId: `review-${randomUUID()}`,
        conceptId: concept.conceptId,
        kind: 'evidence-reflection',
        objective: `复盘 ${concept.title} 的判断和证据变化`,
        prompt: `回看你完成本实验的过程：关于“${concept.title}”，你最初的判断是什么，哪一条对话、代码观察或运行证据让你确认或修改了它？`,
        reason: entry.failed.length
          ? '该概念关联过失败断言，需要确认学生能解释从失败到通过的证据链。'
          : '该概念在实验行为或 Tutor 对话中出现，需要把结果与学生自己的判断连接起来。',
        passCriteria: ['说明自己的初始判断', '指出具体证据', '解释证据如何支持或证伪判断'],
        evidenceRefs: refs,
        requiresRunEvidence: entry.failed.length > 0 || concept.passCriteria.requiresTrustedRun,
      }
    }
    if (index === selected.length - 1) {
      const transfer = bundle.catalog.transferPrompts[0]
        || `如果改变“${concept.title}”所依赖的一个关键条件，哪些不变量仍必须成立，哪些实现会变化？`
      return {
        questionId: `review-${randomUUID()}`,
        conceptId: concept.conceptId,
        kind: 'transfer',
        objective: `检查 ${concept.title} 的迁移理解`,
        prompt: transfer,
        reason: '最终复盘需要检查学生能否把本实验结论迁移到变化条件，而不只是复述运行结果。',
        passCriteria: ['指出至少一个不变量', '指出至少一个变化条件', '给出因果解释或可验证预测'],
        evidenceRefs: refs,
        requiresRunEvidence: false,
      }
    }
    return {
      questionId: `review-${randomUUID()}`,
      conceptId: concept.conceptId,
      kind: misconception ? 'counterexample' : 'concept-explanation',
      objective: `确认 ${concept.title} 的机制理解`,
      prompt: misconception
        ? `有人认为“${misconception.statement || misconception.id}”。结合本实验中的“${concept.title}”，你认为这个说法哪里不完整或错误？请用实际路径或现象说明。`
        : `请不用照抄手册，用自己的话解释“${concept.title}”在本实验中的作用，并指出一个能验证这段解释的代码位置或运行现象。`,
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
    rationale: '根据完整 Tutor 对话、学习事件、工作区行为和可信运行生成；默认三题，后续追问也计入五题上限。',
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

function validatePlanEvidence(plan, validEvidenceRefs) {
  const valid = new Set(validEvidenceRefs)
  const invalid = [
    ...(plan.evidenceRefs || []),
    ...plan.questions.flatMap((question) => question.evidenceRefs || []),
  ].filter((ref) => !valid.has(ref))
  if (invalid.length) throw new TypeError(`Assessment Agent 引用了不存在的证据：${invalid[0]}`)
}

export async function createAssessmentReviewPlan(bundle, options = {}) {
  const fallback = generateDeterministicReviewPlan(bundle, options)
  if (!options.llm) return { plan: fallback, agent: { mode: 'deterministic', error: '' } }
  try {
    const raw = await callJsonAgent({
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      system: [
        '你是独立的 OS Lab Assessment Agent，不直接面向学生。',
        '根据完整行为证据生成 2-5 个苏格拉底复盘问题，默认 3 个。',
        '必须综合 Tutor 对话、工作区事件、可信运行、诊断/Trace 和报告；不能只看最终运行。',
        '只输出 JSON。conceptId 必须来自输入目录，evidenceRefs 必须逐字来自 validEvidenceRefs。',
        '不要因为未观察到就断言学生不掌握；低置信度应使用诊断性问题。',
        '问题要覆盖理解确认、过程证据反思和迁移，避免重复已在对话中充分证明的内容。',
        '输出字段：maxQuestions,rationale,questions[]；每题含 questionId,conceptId,kind,objective,prompt,reason,passCriteria,evidenceRefs,requiresRunEvidence。',
      ].join('\n'),
      input: bundle,
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

export function evaluateReviewAnswerDeterministically(question, answer, bundle) {
  const value = text(answer, 8_000)
  const terms = criterionTerms(question.passCriteria || [])
  const matched = terms.filter((group) => group.some((term) => value.toLowerCase().includes(term.toLowerCase()))).length
  const hasRequiredRun = !question.requiresRunEvidence || (question.evidenceRefs || []).some((ref) =>
    ref.startsWith('run:') && bundle.runs.some((run) => run.ref === ref && run.trusted && run.verified),
  )
  let verdict = 'partial'
  if (!hasRequiredRun) verdict = 'needs-evidence'
  else if (value.length >= 30 && (!terms.length || matched >= Math.max(1, Math.ceil(terms.length / 2)))) verdict = 'passed'
  else if (value.length < 8) verdict = 'misconception'
  return normalizeReviewEvaluation({
    verdict,
    rationale: verdict === 'passed'
      ? '回答覆盖了本题的主要通过标准，并与已有证据一致。'
      : verdict === 'needs-evidence'
        ? '解释尚缺本题要求的可信运行证据。'
        : '回答尚未覆盖足够的因果关系或可检查证据。',
    evidenceRefs: (question.evidenceRefs || []).filter((ref) => bundle.validEvidenceRefs.includes(ref)),
    missingEvidence: verdict === 'needs-evidence' ? ['补充与该概念对应的可信运行或断言'] : [],
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
        '你是独立的 OS Lab Assessment Agent，评价一条复盘回答。只输出 JSON。',
        'verdict 只能是 passed, partial, needs-evidence, misconception, defer。',
        '只能引用 validEvidenceRefs；口头回答不能覆盖可信运行；没有证据时不能宣布实现正确。',
        '输出 verdict,rationale,evidenceRefs,missingEvidence,followUpObjective。',
      ].join('\n'),
      input: { question, answer: text(answer, 8_000), evidence: bundle },
    })
    const evaluation = normalizeReviewEvaluation(raw)
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
          rationale: '模型判断不能覆盖本题要求的可信运行证据。',
          missingEvidence: ['补充与该概念对应的可信运行或断言'],
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
