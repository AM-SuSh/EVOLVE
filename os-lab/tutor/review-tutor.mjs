import { enforceTutorOutput } from './turn-policy.mjs'

export const TUTOR_REVIEW_PROMPT_VERSION = 'tutor-review-question-v1'
export const DEFAULT_TUTOR_REVIEW_TIMEOUT_MS = 120_000

function text(value, max = 4_000) {
  return String(value || '').trim().slice(0, max)
}

function completionText(payload) {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? payload?.text
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((item) => item?.text || '').join('')
  return ''
}

function parseJsonObject(value) {
  const source = text(value, 32_000)
  const unfenced = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) throw new TypeError('Tutor Agent 未返回 JSON 对象')
  return JSON.parse(unfenced.slice(start, end + 1))
}

async function callTutorJson({ llm, system, input, maxTokens = 2_000, fetchImpl = fetch }) {
  if (!llm?.upstream || !llm?.model) throw new Error('Tutor Agent model is not configured')
  const configuredTimeout = Number(llm.timeoutMs || DEFAULT_TUTOR_REVIEW_TIMEOUT_MS)
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(1_000, Math.min(configuredTimeout, 300_000))
    : DEFAULT_TUTOR_REVIEW_TIMEOUT_MS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
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
        temperature: 0.25,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `Tutor Agent returned ${response.status}`)
    return parseJsonObject(completionText(payload))
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      const timeoutError = new Error(`Tutor Agent request timed out after ${Math.round(timeoutMs / 1_000)} seconds`)
      timeoutError.name = 'TutorTimeoutError'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function canonicalPrompt(value) {
  return text(value).replace(/\s+/g, ' ').toLowerCase()
}

function historicalPrompts(context) {
  return new Set((Array.isArray(context?.previousQuestions) ? context.previousQuestions : [])
    .map((question) => canonicalPrompt(question?.prompt))
    .filter(Boolean))
}

function publicBrief(brief) {
  return {
    questionId: text(brief?.questionId, 160),
    conceptId: text(brief?.conceptId, 160),
    kind: text(brief?.kind, 80),
    objective: text(brief?.objective, 2_000),
    seedPrompt: text(brief?.prompt, 4_000),
    reason: text(brief?.reason, 2_000),
    passCriteria: (Array.isArray(brief?.passCriteria) ? brief.passCriteria : [])
      .map((item) => text(item, 500))
      .filter(Boolean)
      .slice(0, 8),
    evidenceRefs: (Array.isArray(brief?.evidenceRefs) ? brief.evidenceRefs : [])
      .map((item) => text(item, 200))
      .filter(Boolean),
    requiresRunEvidence: brief?.requiresRunEvidence === true,
  }
}

function publicAssessmentFeedback(value) {
  if (!value || typeof value !== 'object') return null
  return {
    verdict: text(value.verdict, 80),
    verdictLabel: text(value.verdictLabel, 160),
    rationale: text(value.rationale, 1_000),
    missingPoints: (Array.isArray(value.missingPoints) ? value.missingPoints : [])
      .map((item) => text(item, 500))
      .filter(Boolean)
      .slice(0, 4),
    missingEvidence: (Array.isArray(value.missingEvidence) ? value.missingEvidence : [])
      .map((item) => text(item, 500))
      .filter(Boolean)
      .slice(0, 4),
    followUpObjective: text(value.followUpObjective, 1_000),
  }
}

function tutorSystemPrompt(context) {
  return [
    text(context?.frameworkPrompt, 32_000),
    '你现在以同一个 EVOLVE Tutor Agent 的身份主持终期苏格拉底复盘。',
    'Assessment Agent 已根据学生行为证据给出内部问题简报；你负责把简报转成面向学生的自然、清晰、一次只问一个重点的问题。',
    '必须保持 questionId 与考查目标，不得替学生回答，不得泄露 passCriteria、评分标准、得分点或 Assessment Agent 的内部推理。',
    '只能使用输入中的证据标识和系统提供的知识引用，不得声称观察到未提供的运行、Trace、诊断或代码事实。',
    '问题应承接近期 Tutor 对话，避免重复历史题目；不要输出评价、答案、提示列表或额外寒暄。',
    '只输出请求指定的 JSON 结构。',
  ].filter(Boolean).join('\n\n---\n\n')
}

function normalizeTutorPrompt(rawPrompt, brief, context, seen) {
  const prompt = text(rawPrompt, 2_000)
  if (prompt.length < 8) throw new TypeError('Tutor Agent 生成的问题过短')
  if (/(?:passCriteria|评分标准|通过标准|得分点|内部简报)/i.test(prompt)) {
    throw new TypeError('Tutor Agent 泄露了内部评价标准')
  }
  const guarded = enforceTutorOutput(prompt, {
    evidenceRefs: brief.evidenceRefs || [],
    actions: [],
  }, {
    allowedKnowledgeRefs: context?.allowedKnowledgeRefs || [],
  })
  if (guarded.guarded) throw new TypeError(`Tutor Agent 输出被教学护栏拦截：${guarded.reason}`)
  const canonical = canonicalPrompt(guarded.reply)
  if (!canonical || seen.has(canonical)) throw new TypeError('Tutor Agent 重复了近期复盘问题')
  seen.add(canonical)
  return guarded.reply
}

function tutorAgent(llm, mode, error = '') {
  return {
    role: 'tutor',
    mode,
    model: text(llm?.model, 160),
    promptVersion: TUTOR_REVIEW_PROMPT_VERSION,
    error: text(error, 2_000),
  }
}

function fallbackPlan(plan, llm, error = '') {
  const agent = tutorAgent(llm, 'deterministic', error)
  return {
    plan: {
      ...plan,
      questions: plan.questions.map((question) => ({ ...question })),
      questioner: agent,
    },
    agent,
  }
}

export async function materializeTutorReviewPlan(plan, context = {}, options = {}) {
  if (!options.llm) return fallbackPlan(plan, null)
  try {
    const briefs = plan.questions.map(publicBrief)
    const raw = await callTutorJson({
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      system: tutorSystemPrompt(context),
      input: {
        task: 'tutor-review-questions',
        labId: text(plan.labId, 20),
        briefs,
        recentTutorConversation: (Array.isArray(context.recentConversation)
          ? context.recentConversation : []).slice(-16),
      },
    })
    if (!Array.isArray(raw.questions) || raw.questions.length !== briefs.length) {
      throw new TypeError('Tutor Agent 返回的问题数量与 Assessment 简报不一致')
    }
    const byId = new Map(raw.questions.map((question) => [text(question?.questionId, 160), question]))
    if (byId.size !== briefs.length || briefs.some((brief) => !byId.has(brief.questionId))) {
      throw new TypeError('Tutor Agent 改变了 Assessment 简报的 questionId')
    }
    const seen = historicalPrompts(context)
    const questions = plan.questions.map((question) => ({
      ...question,
      prompt: normalizeTutorPrompt(byId.get(question.questionId)?.prompt, question, context, seen),
    }))
    const agent = tutorAgent(options.llm, 'remote')
    return { plan: { ...plan, questions, questioner: agent }, agent }
  } catch (error) {
    return fallbackPlan(plan, options.llm, error instanceof Error ? error.message : String(error))
  }
}

export async function materializeTutorReviewQuestion(brief, context = {}, options = {}) {
  const fallback = { question: { ...brief }, agent: tutorAgent(options.llm, 'deterministic') }
  if (!options.llm) return fallback
  try {
    const inputBrief = publicBrief(brief)
    const raw = await callTutorJson({
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      system: tutorSystemPrompt(context),
      input: {
        task: 'tutor-review-question',
        labId: text(context.labId, 20),
        brief: inputBrief,
        studentAnswer: text(context.studentAnswer, 8_000),
        assessmentFeedback: publicAssessmentFeedback(context.assessmentFeedback),
        recentTutorConversation: (Array.isArray(context.recentConversation)
          ? context.recentConversation : []).slice(-16),
      },
      maxTokens: 900,
    })
    if (text(raw.questionId, 160) !== inputBrief.questionId) {
      throw new TypeError('Tutor Agent 改变了 Assessment 追问简报的 questionId')
    }
    const prompt = normalizeTutorPrompt(raw.prompt, brief, context, historicalPrompts(context))
    return { question: { ...brief, prompt }, agent: tutorAgent(options.llm, 'remote') }
  } catch (error) {
    return {
      question: { ...brief },
      agent: tutorAgent(options.llm, 'deterministic', error instanceof Error ? error.message : String(error)),
    }
  }
}
