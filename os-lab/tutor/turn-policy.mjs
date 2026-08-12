const INTENTS = new Set([
  'concept',
  'code-reading',
  'debug',
  'verification',
  'reflection',
  'transfer',
  'direct-answer',
])

const RESPONSE_MODES = new Set([
  'answer-first',
  'definition-first',
  'evidence-first',
  'guardrail',
])

const DIRECT_ANSWER_RE = /(完整代码|直接.*答案|直接.*实现|可提交.*patch|替我写完|最终代码)/i
const TERM_DEFINITION_RE = /(?:什么是|.+(?:是什么|是啥|指什么|什么意思|什么作用|有什么用|怎么理解|如何理解))(?:[?？。！!])?$/i
const REFLECTION_RE = /(复盘|反思|总结|收获|报告|答辩|我学到|理解变化)/i
const TRANSFER_RE = /(区别|对比|相比|迁移|类似|换成|改成|改变.*条件|边界条件|推广|(?:如果|假如).*(?:变化|成立|怎样|如何|会))/i
const DEBUG_RE = /(现象|乱码|报错|错误|失败|崩溃|panic|卡住|不工作|异常|输出不对|根因|定位|修复)/i
const VERIFICATION_RE = /(实验|验证|测试|尝试|观察|运行|预期|断言|QEMU|cargo|trace|日志)/i
const CODE_RE = /(?:\.[a-z0-9]+\b|函数|字段|源码|代码|调用链|控制流|数据流|实现位置|寄存器|结构体)/i
const GENERIC_FOLLOW_UP_RE = /^(?:请)?(?:再|继续|然后|那|这个|这里|还是|能否|可以)?(?:给|说|讲|解释|具体|详细|看|帮|提示|一点|一下|呢|吗|？|\?|，|。|\s){1,24}$/i
const UNDERSTANDING_ACK_RE = /(明白了|懂了|理解了|我理解|所以.*应该|也就是说|我认为|我的判断|我现在知道|这样看来|原来是)/i
const EXPLICIT_CONTINUE_RE = /(我先去|我再跑|我去看|我先检查|我继续|暂时不用|先不用|我试试|知道了，?我)/i
const TOPIC_TERM_RE = /(\bfd\b|fd表|文件描述符|file descriptor|fdtype|offset|sepc|sscratch|scause|stvec|sstatus|satp|sret|ecall|trap|syscall|panic|页表|地址空间|虚拟内存|物理内存|调度器|任务切换|上下文切换|进程|线程|文件系统|磁盘|inode|管道|信号|互斥锁|自旋锁|死锁|中断|异常|特权级|系统调用)/gi

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
export const tutorResponseModes = Object.freeze([...RESPONSE_MODES])

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

/**
 * Intent describes the learning task. Response mode describes the first
 * response move, so a concept question is not turned into a question before
 * it receives its basic answer.
 */
export function inferTutorResponseMode(input) {
  const message = String(typeof input === 'string' ? input : input?.message || '').trim()
  if (DIRECT_ANSWER_RE.test(message)) return 'guardrail'
  if (TERM_DEFINITION_RE.test(message)) return 'definition-first'
  if (DEBUG_RE.test(message) || VERIFICATION_RE.test(message)) return 'evidence-first'
  return 'answer-first'
}

function cleanContextText(value, max = 160) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max)
}

function topicTerms(message) {
  const terms = String(message || '').match(TOPIC_TERM_RE) || []
  const files = String(message || '').match(/[A-Za-z0-9_./\\-]+\.(?:rs|s|asm|toml)\b/gi) || []
  return [...new Set([...terms, ...files].map((term) => term.toLowerCase()))].sort().slice(0, 6)
}

function stableTopicHash(value) {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function identifyTutorTopic(input) {
  const message = cleanContextText(input?.message, 500)
  const previousTopicKey = cleanContextText(input?.previousTopicKey, 120)
  const previousIntent = INTENTS.has(input?.previousIntent) ? input.previousIntent : ''
  const previousAnchor = cleanContextText(input?.previousTopicAnchor, 240)
  const inferredIntent = inferTutorIntent(message)
  const explicitTerms = topicTerms(message)
  const responseMode = inferTutorResponseMode(message)
  const acknowledgement = UNDERSTANDING_ACK_RE.test(message) && !explicitTerms.length
  const followUp = (GENERIC_FOLLOW_UP_RE.test(message) || acknowledgement) &&
    !explicitTerms.length && responseMode === 'answer-first'
  const intent = followUp && previousIntent ? previousIntent : inferredIntent
  const codeFile = cleanContextText(input?.codeContext?.file, 240).replace(/\\/g, '/')
  const reading = [cleanContextText(input?.reading?.h2, 120), cleanContextText(input?.reading?.h3, 120)]
    .filter(Boolean)
    .join(' > ')
  const diagnosticKeys = [...new Set((input?.evidence?.diagnosticKeys || []).map((item) => cleanContextText(item, 180)))]
    .filter(Boolean)
    .sort()
    .slice(0, 4)

  if (followUp && previousTopicKey) {
    return {
      topicKey: previousTopicKey,
      topicIntent: intent,
      topicAnchor: previousAnchor,
      responseMode,
      topicChanged: false,
      topicChangeReason: 'follow-up',
    }
  }

  const contextualAnchor = ['code-reading', 'debug', 'verification'].includes(intent)
    ? codeFile || reading
    : reading || codeFile
  const anchorParts = explicitTerms.length
    ? explicitTerms
    : [responseMode === 'definition-first'
      ? message.toLowerCase().replace(/\s+/g, '').slice(0, 48)
      : contextualAnchor || message.toLowerCase().replace(/\s+/g, '').slice(0, 48)]
  if (intent === 'debug' && diagnosticKeys.length) anchorParts.push(...diagnosticKeys)
  const topicAnchor = anchorParts.filter(Boolean).join('|') || 'general'
  const topicKey = `topic:${stableTopicHash(`${intent}|${topicAnchor}`)}`
  let topicChangeReason = 'initial-topic'
  if (previousTopicKey && previousIntent !== intent) topicChangeReason = 'intent-changed'
  else if (previousTopicKey && previousAnchor !== topicAnchor) topicChangeReason = 'topic-context-changed'
  else if (previousTopicKey) topicChangeReason = 'same-topic'
  return {
    topicKey,
    topicIntent: intent,
    topicAnchor,
    responseMode,
    topicChanged: Boolean(previousTopicKey && previousTopicKey !== topicKey),
    topicChangeReason,
  }
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
  const topic = input?.topic || identifyTutorTopic({ ...input, evidence })
  const intent = INTENTS.has(topic.topicIntent) ? topic.topicIntent : inferTutorIntent({ message, evidence })
  const responseMode = RESPONSE_MODES.has(topic.responseMode)
    ? topic.responseMode
    : inferTutorResponseMode(message)
  const previousHintLevel = Number.isInteger(input?.topicHintLevel)
    ? input.topicHintLevel
    : Number.isInteger(input?.hintLevel) ? input.hintLevel : 0
  const hintRequested = /(提示|卡住|不知道下一步|给点方向|帮我定位|再具体一点)/.test(message)
  const hintLevel = hintRequested ? Math.min(4, previousHintLevel + 1) : previousHintLevel
  const actions = [...INTENT_ACTIONS[intent]]
  if (hintRequested) actions.push(`offer-hint-l${hintLevel}`)
  const understandingCheck = shouldAskUnderstandingCheck({
    message,
    intent,
    responseMode,
    history: input?.history,
    followup: input?.followup,
  })
  if (input?.followup?.pending) actions.push('resolve-understanding-check')
  if (understandingCheck.shouldAsk) actions.push('selective-understanding-check')

  return {
    version: 'turn-policy-v2',
    routingMode: 'intent',
    intent: INTENTS.has(intent) ? intent : 'concept',
    responseMode,
    stage: requestedStage,
    previousStage,
    requestedStage,
    transitioned: requestedStage !== previousStage,
    gate: 'intent-routed',
    hintLevel,
    hintAdvanced: hintLevel > previousHintLevel,
    topicKey: topic.topicKey,
    topicIntent: intent,
    topicAnchor: topic.topicAnchor,
    topicChanged: Boolean(topic.topicChanged),
    topicChangeReason: topic.topicChangeReason,
    actions: [...new Set(actions)],
    understandingCheck,
    followup: {
      pending: Boolean(input?.followup?.pending),
      resolved: Boolean(input?.followup?.resolved),
      checkCount: Number(input?.followup?.checkCount || 0),
    },
    evidenceRefs: collectEvidenceRefs(evidence),
    toolContext: {
      latestRun: evidence.latestRun || null,
      diagnosticCount: evidence.diagnosticCount || 0,
      traceCount: evidence.latestRun?.traceCount || 0,
    },
  }
}

export function shouldAskUnderstandingCheck(input = {}) {
  const message = String(input.message || '').trim()
  const intent = INTENTS.has(input.intent) ? input.intent : inferTutorIntent(message)
  const responseMode = RESPONSE_MODES.has(input.responseMode)
    ? input.responseMode
    : inferTutorResponseMode(message)
  const followup = input.followup || {}
  const history = Array.isArray(input.history) ? input.history : []
  const priorAssistant = [...history].reverse().find((item) => item?.role === 'assistant' && String(item.content || '').trim())
  const studentAcknowledged = UNDERSTANDING_ACK_RE.test(message)
  const explicitlyContinuing = EXPLICIT_CONTINUE_RE.test(message)
  const sameTopicHasAnswer = Boolean(priorAssistant)
  const cooldownPassed = Number(followup.turnIndex || 0) - Number(followup.lastCheckTurn ?? -10) >= 2
  const eligible =
    responseMode !== 'guardrail' &&
    !['reflection'].includes(intent) &&
    !explicitlyContinuing &&
    !followup.pending &&
    !followup.resolved &&
    Number(followup.checkCount || 0) === 0 &&
    sameTopicHasAnswer &&
    studentAcknowledged &&
    cooldownPassed
  return {
    shouldAsk: eligible,
    reason: eligible
      ? '学生确认理解且当前问题已有解释，进行一次收束检查'
      : '当前疑问尚未确认解决，或本主题/会话处于追问冷却期',
    maxPerTopic: 1,
    cooldownTurns: 2,
  }
}

export function understandingCheckPrompt(input = {}) {
  if (input?.followup?.pending) {
    return [
      '学生当前是在回应上一轮的理解检查。先判断并回应这份理解：正确时简短确认并补齐必要边界；不完整时直接澄清缺失点。',
      '本轮必须结束这条理解检查，不再追加新的问题，也不要形成连续追问。',
    ].join('\n')
  }
  if (!input?.understandingCheck?.shouldAsk) return ''
  return [
    '当前允许进行一次理解收束检查。',
    '先完整回答学生当前问题，再只提出一个与刚才疑问直接相关、可用学生自己的话回答的问题。',
    '学生回答后不要继续连环追问；若回答正确，确认理解并结束本线程。',
    '不要把这个问题写成阶段门控，也不要向学生说明评分或内部状态。',
  ].join('\n')
}

export function tutorTurnPolicyPrompt(decision) {
  return [
    '本轮教学计划（服务端权威）：',
    `- 问题意图：${decision.intent}`,
    `- 回应模式：${decision.responseMode || 'answer-first'}`,
    `- 问题线程：${decision.topicKey}`,
    `- 当前提示层级：L${decision.hintLevel}`,
    `- 教学动作：${decision.actions.join(', ')}`,
    `- 可引用证据：${decision.evidenceRefs.join(', ') || '无'}`,
    `- 可信工具摘要：${JSON.stringify(decision.toolContext)}`,
    understandingCheckPrompt(decision),
    decision.responseMode === 'definition-first'
      ? '回答顺序：先直接定义学生问到的术语，并补充一个与当前实验相关的作用或边界；不得以阶段、边界或反问开头。回答完成后至多追问一个问题。'
      : decision.responseMode === 'guardrail'
        ? '回答顺序：先用一句话说明不能交付完整实现，再回答学生实际问到的机制或卡点；最后至多追问一个与其已有尝试有关的问题。'
        : decision.responseMode === 'evidence-first'
          ? '回答顺序：先回应学生描述的现象或验证目标，再提出至多一个最小证据动作。不得用阶段要求替代对当前问题的回应。'
          : '先回应学生当前问题，再执行至多一个最有价值的引导动作。不得声称执行了工具摘要中不存在的运行、诊断或 Trace。',
  ].join('\n')
}
