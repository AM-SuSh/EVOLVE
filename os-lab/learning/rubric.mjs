const DEFAULT_WEIGHTS = {
  total: { process: 0.45, result: 0.35, reflection: 0.2 },
  process: { thinking: 0.25, questionQuality: 0.25, depth: 0.2, verification: 0.3 },
  guardrailPenalty: 5,
  guardrailPenaltyCap: 25,
}

const QUALITY_WEIGHT = {
  concept: 0.8,
  phenomenon: 0.75,
  cause: 1,
  comparison: 1,
  exploration: 1,
  direct_answer: 0,
}

export function scoreLearningEvents(events, weights = DEFAULT_WEIGHTS) {
  const safeEvents = Array.isArray(events) ? events : []
  const studentMessages = safeEvents.filter((event) => event.type === 'student_message')
  const stages = new Set(
    safeEvents.filter((event) => event.type === 'stage_enter').map((event) => event.stage),
  )
  const guardrails = safeEvents.filter((event) => event.type === 'guardrail_triggered').length
  const verifications = safeEvents.filter((event) => event.type === 'verification_attempt')
  const reflections = safeEvents.filter((event) => event.type === 'reflection_submitted')

  const evidenceLedMessages = studentMessages.filter((event) =>
    /(我认为|我猜|我观察|我尝试|我验证|我的假设|输出|代码路径)/.test(event.content || ''),
  ).length
  const thinking = studentMessages.length
    ? clamp(
        (stages.has('orient') ? 20 : 0) +
          (stages.has('read') ? 20 : 0) +
          (studentMessages[0]?.category !== 'direct_answer' ? 25 : 0) +
          evidenceLedMessages * 18,
      )
    : 0

  const qualityTotal = studentMessages.reduce(
    (total, event) => total + (QUALITY_WEIGHT[event.category] ?? 0.55),
    0,
  )
  const questionQuality = studentMessages.length
    ? clamp(Math.round((qualityTotal / studentMessages.length) * 100))
    : 0

  const distinctStagesWithQuestions = new Set(studentMessages.map((event) => event.stage)).size
  const depth = studentMessages.length
    ? clamp(20 + Math.max(0, studentMessages.length - 1) * 22 + distinctStagesWithQuestions * 10)
    : 0

  const passedVerifications = verifications.filter((event) => event.metadata?.passed === true).length
  const verification = clamp(verifications.length * 42 + passedVerifications * 16)
  const reflectionText = reflections.map((event) => event.content || '').join('\n')
  const reflectionSignals = [
    /(独立|自己|我的判断|我理解)/.test(reflectionText),
    /(AI|导师|提醒|帮助)/i.test(reflectionText),
    /(验证|QEMU|输出|测试|代码路径)/i.test(reflectionText),
  ].filter(Boolean).length
  const reflection = reflections.length ? clamp(25 + reflectionSignals * 25) : 0
  const result = passedVerifications > 0 ? 100 : verifications.length > 0 ? 35 : 0
  const guardrailPenalty = Math.min(
    weights.guardrailPenaltyCap,
    guardrails * weights.guardrailPenalty,
  )
  const rawProcess =
    thinking * weights.process.thinking +
    questionQuality * weights.process.questionQuality +
    depth * weights.process.depth +
    verification * weights.process.verification
  const process = clamp(Math.round(rawProcess - guardrailPenalty))
  const total = clamp(
    Math.round(
      process * weights.total.process +
        result * weights.total.result +
        reflection * weights.total.reflection,
    ),
  )

  const summary = buildSummary({ total, studentMessages, verifications, reflections, guardrails })
  return {
    total,
    process,
    result,
    reflection,
    thinking,
    questionQuality,
    depth,
    verification,
    guardrailPenalty,
    summary,
    counts: {
      messages: studentMessages.length,
      verifications: verifications.length,
      passedVerifications,
      guardrails,
      reflections: reflections.length,
    },
  }
}

function buildSummary({ total, studentMessages, verifications, reflections, guardrails }) {
  if (!studentMessages.length) return '先写下一条自己的判断，评分才会开始形成。'
  if (!verifications.length) return '已有提问记录；补一次 QEMU 验证，把模型回答变成可检验证据。'
  if (!reflections.length) return '验证已经记录；完成三句话复盘即可闭合学习证据链。'
  if (guardrails > 0) return '证据链已形成；减少索要完整答案，过程分会更准确地反映你的判断。'
  return total >= 80
    ? '判断、验证和复盘已经形成完整证据链。'
    : '闭环已完成；继续用更具体的现象和假设提高追问质量。'
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}
