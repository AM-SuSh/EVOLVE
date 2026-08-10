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
const GENERIC_FOLLOW_UP_RE = /^(?:请)?(?:再|继续|然后|那|这个|这里|还是|能否|可以)?(?:给|说|讲|解释|具体|详细|看|帮|提示|一点|一下|呢|吗|？|\?|，|。|\s){1,24}$/i
const TOPIC_TERM_RE = /(sepc|sscratch|scause|stvec|sstatus|satp|sret|ecall|trap|syscall|panic|页表|地址空间|虚拟内存|物理内存|调度器|任务切换|上下文切换|进程|线程|文件系统|磁盘|inode|管道|信号|互斥锁|自旋锁|死锁|中断|异常|特权级|系统调用)/gi

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
  const followUp = GENERIC_FOLLOW_UP_RE.test(message)
  const inferredIntent = inferTutorIntent(message)
  const intent = followUp && previousIntent ? previousIntent : inferredIntent
  const explicitTerms = topicTerms(message)
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
      topicChanged: false,
      topicChangeReason: 'follow-up',
    }
  }

  const contextualAnchor = ['code-reading', 'debug', 'verification'].includes(intent)
    ? codeFile || reading
    : reading || codeFile
  const anchorParts = explicitTerms.length
    ? explicitTerms
    : [contextualAnchor || message.toLowerCase().replace(/\s+/g, '').slice(0, 48)]
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
  const previousHintLevel = Number.isInteger(input?.topicHintLevel)
    ? input.topicHintLevel
    : Number.isInteger(input?.hintLevel) ? input.hintLevel : 0
  const hintRequested = /(提示|卡住|不知道下一步|给点方向|帮我定位|再具体一点)/.test(message)
  const hintLevel = hintRequested ? Math.min(4, previousHintLevel + 1) : previousHintLevel
  const actions = [...INTENT_ACTIONS[intent]]
  if (hintRequested) actions.push(`offer-hint-l${hintLevel}`)

  return {
    version: 'turn-policy-v2',
    routingMode: 'intent',
    intent: INTENTS.has(intent) ? intent : 'concept',
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
    `- 问题线程：${decision.topicKey}`,
    `- 当前提示层级：L${decision.hintLevel}`,
    `- 教学动作：${decision.actions.join(', ')}`,
    `- 可引用证据：${decision.evidenceRefs.join(', ') || '无'}`,
    `- 可信工具摘要：${JSON.stringify(decision.toolContext)}`,
    '先回应学生当前问题，再执行至多一个最有价值的引导动作。不得声称执行了工具摘要中不存在的运行、诊断或 Trace。',
  ].join('\n')
}
