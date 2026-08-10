const INTENTS = new Set([
  'concept',
  'code-reading',
  'debug',
  'verification',
  'reflection',
  'transfer',
  'direct-answer',
])

const DIRECT_ANSWER_RE = /(完整代码|直接.*答案|直接.*实现|可提交.*patch|替我写完|最终代码)/i
const REFLECTION_RE = /(复盘|反思|总结|收获|报告|答辩|我学到|理解变化)/i
const TRANSFER_RE = /(区别|对比|相比|迁移|类似|换成|改成|改变.*条件|边界条件|推广|(?:如果|假如).*(?:变化|成立|怎样|如何|会))/i
const DEBUG_RE = /(现象|乱码|报错|错误|失败|崩溃|panic|卡住|不工作|异常|输出不对|根因|定位|修复)/i
const VERIFICATION_RE = /(实验|验证|测试|尝试|观察|运行|预期|断言|QEMU|cargo|trace|日志)/i
const CODE_RE = /(?:\.[a-z0-9]+\b|函数|字段|源码|代码|调用链|控制流|数据流|实现位置|寄存器|结构体)/i

const INTENT_ACTIONS = Object.freeze({
  concept: ['answer-focused-concept', 'ask-for-judgment'],
  'code-reading': ['answer-from-code-context', 'request-source-evidence'],
  debug: ['acknowledge-observed-failure', 'request-falsifiable-hypothesis'],
  verification: ['define-observable-evidence', 'request-minimal-verification'],
  reflection: ['connect-claim-to-evidence', 'ask-reflection-limit'],
  transfer: ['identify-invariant-and-change', 'ask-transfer-prediction'],
  'direct-answer': ['apply-answer-guardrail', 'request-student-attempt'],
})

export const tutorTurnIntents = Object.freeze([...INTENTS])

/** Keep the old UI analytics taxonomy in one shared implementation. */
export function inferQuestionCategory(message) {
  const text = String(message || '')
  if (DIRECT_ANSWER_RE.test(text)) return 'direct_answer'
  if (/(区别|对比|相比|迁移|类似)/.test(text)) return 'comparison'
  if (/(现象|乱码|报错|失败|崩溃|panic|卡住|输出)/i.test(text)) return 'phenomenon'
  if (/(为什么|原因|必须|导致|根因|怎么会)/.test(text)) return 'cause'
  if (/(实验|验证|尝试|观察|运行|QEMU|cargo)/i.test(text)) return 'exploration'
  return 'concept'
}

export function inferTutorIntent(input) {
  const message = String(typeof input === 'string' ? input : input?.message || '').trim()
  if (DIRECT_ANSWER_RE.test(message)) return 'direct-answer'
  if (REFLECTION_RE.test(message)) return 'reflection'
  if (TRANSFER_RE.test(message)) return 'transfer'
  if (DEBUG_RE.test(message)) return 'debug'
  if (VERIFICATION_RE.test(message)) return 'verification'
  if (CODE_RE.test(message)) return 'code-reading'
  return 'concept'
}

function safeStage(value) {
  return ['orient', 'read', 'run', 'debug', 'reflect', 'transfer'].includes(value) ? value : 'orient'
}

function collectEvidenceRefs(evidence) {
  const refs = []
  if (evidence.latestRun?.runId) refs.push(`run:${evidence.latestRun.runId}`)
  for (const id of evidence.eventIds || []) refs.push(`event:${id}`)
  return refs.slice(0, 20)
}

export function planTutorTurn(input) {
  const message = String(input?.message || '').trim()
  const evidence = input?.evidence || {}
  const previousStage = safeStage(input?.currentStage)
  const requestedStage = safeStage(input?.requestedStage)
  const intent = inferTutorIntent({ message, evidence })
  const previousHintLevel = Number.isInteger(input?.hintLevel) ? input.hintLevel : 0
  const hintRequested = /(提示|卡住|不知道下一步|给点方向|帮我定位|再具体一点)/.test(message)
  const hintLevel = hintRequested ? Math.min(4, previousHintLevel + 1) : previousHintLevel
  const actions = [...INTENT_ACTIONS[intent]]
  if (hintRequested) actions.push(`offer-hint-l${hintLevel}`)

  return {
    version: 'turn-policy-v1',
    routingMode: 'intent',
    intent: INTENTS.has(intent) ? intent : 'concept',
    stage: requestedStage,
    previousStage,
    requestedStage,
    transitioned: requestedStage !== previousStage,
    gate: 'intent-routed',
    hintLevel,
    hintAdvanced: hintLevel > previousHintLevel,
    actions: [...new Set(actions)],
    evidenceRefs: collectEvidenceRefs(evidence),
    toolContext: {
      latestRun: evidence.latestRun || null,
      diagnosticCount: evidence.diagnosticCount || 0,
      traceCount: evidence.latestRun?.traceCount || 0,
    },
  }
}

export function tutorTurnPolicyPrompt(decision) {
  return [
    '本轮教学计划（服务端权威）：',
    `- 问题意图：${decision.intent}`,
    `- 当前提示层级：L${decision.hintLevel}`,
    `- 教学动作：${decision.actions.join(', ')}`,
    `- 可引用证据：${decision.evidenceRefs.join(', ') || '无'}`,
    `- 可信工具摘要：${JSON.stringify(decision.toolContext)}`,
    '先回应学生当前问题，再执行至多一个最有价值的引导动作。不得声称执行了工具摘要中不存在的运行、诊断或 Trace。',
  ].join('\n')
}
