import { tutorStages } from './baseline.mjs'

const STAGES = new Set(tutorStages.map((stage) => stage.id))
const JUDGMENT_RE = /(我认为|我觉得|我猜|我的判断|我观察|可能|不确定|假设)/
const SOURCE_RE = /(\.rs|\.asm|\.s|\.toml|函数|字段|状态|不变量|调用链|源码)/i
const HINT_RE = /(提示|卡住|不知道下一步|给点方向|帮我定位)/
const ANSWER_RE = /(完整代码|直接.*答案|直接.*实现|可提交.*patch|替我写完|最终代码)/i

function safeStage(value) {
  return STAGES.has(value) ? value : 'orient'
}

function evidenceRefs(evidence) {
  const refs = []
  if (evidence.latestRun?.runId) refs.push(`run:${evidence.latestRun.runId}`)
  for (const id of evidence.eventIds || []) refs.push(`event:${id}`)
  return refs.slice(0, 20)
}

function baseActions(stage) {
  return {
    orient: ['ask-for-judgment'],
    read: ['request-source-evidence'],
    run: ['request-trusted-run'],
    debug: ['request-falsifiable-hypothesis'],
    reflect: ['ask-causal-explanation'],
    transfer: ['ask-transfer-question'],
  }[stage]
}

export function decideTutorTurn(input) {
  const currentStage = safeStage(input.currentStage)
  const message = String(input.message || '').trim()
  const evidence = input.evidence || {}
  const answerRequest = ANSWER_RE.test(message)
  const hintRequested = HINT_RE.test(message)
  let stage = currentStage
  let gate = 'stay'
  const actions = []

  if (answerRequest) {
    actions.push('apply-answer-guardrail', ...baseActions(currentStage))
    gate = 'answer-guardrail'
  } else if (currentStage === 'orient') {
    if (JUDGMENT_RE.test(message)) {
      stage = 'read'
      gate = 'initial-judgment-observed'
      actions.push('request-source-evidence')
    } else {
      actions.push('ask-for-judgment')
      gate = 'missing-initial-judgment'
    }
  } else if (currentStage === 'read') {
    if (evidence.counts?.code_open > 0 || SOURCE_RE.test(message)) {
      stage = 'run'
      gate = 'source-evidence-observed'
      actions.push('request-trusted-run')
    } else {
      actions.push('request-source-evidence')
      gate = 'missing-source-evidence'
    }
  } else if (currentStage === 'run') {
    if (!evidence.latestRun) {
      actions.push('request-trusted-run')
      gate = 'missing-trusted-run'
    } else if (evidence.latestRun.verified) {
      stage = 'reflect'
      gate = 'trusted-run-passed'
      actions.push('cite-server-evidence', 'ask-causal-explanation')
    } else {
      stage = 'debug'
      gate = 'trusted-run-failed'
      actions.push('inspect-run-evidence', 'request-falsifiable-hypothesis')
    }
  } else if (currentStage === 'debug') {
    if (evidence.latestRun?.verified) {
      stage = 'reflect'
      gate = 'regression-passed'
      actions.push('cite-server-evidence', 'ask-causal-explanation')
    } else if (evidence.hasSaveAfterLatestFailure) {
      stage = 'run'
      gate = 'change-awaits-regression'
      actions.push('request-regression-run')
    } else {
      actions.push(evidence.diagnosticCount ? 'inspect-diagnostic' : 'request-falsifiable-hypothesis')
      gate = evidence.diagnosticCount ? 'diagnostic-available' : 'missing-debug-hypothesis'
    }
  } else if (currentStage === 'reflect') {
    if (evidence.counts?.reflection_submitted > 0 && evidence.counts?.report_submitted > 0) {
      stage = 'transfer'
      gate = 'reflection-evidence-complete'
      actions.push('ask-transfer-question')
    } else {
      actions.push('request-evidence-linked-reflection')
      gate = 'missing-reflection-evidence'
    }
  } else {
    actions.push('ask-transfer-question')
    gate = 'transfer-check'
  }

  const previousHintLevel = Number.isInteger(input.hintLevel) ? input.hintLevel : 0
  const hintLevel = hintRequested ? Math.min(4, previousHintLevel + 1) : previousHintLevel
  if (hintRequested) actions.push(`offer-hint-l${hintLevel}`)
  return {
    version: 'c3-v1',
    stage,
    previousStage: currentStage,
    requestedStage: safeStage(input.requestedStage),
    transitioned: stage !== currentStage,
    gate,
    hintLevel,
    hintAdvanced: hintLevel > previousHintLevel,
    actions: [...new Set(actions)],
    evidenceRefs: evidenceRefs(evidence),
    toolContext: {
      latestRun: evidence.latestRun || null,
      diagnosticCount: evidence.diagnosticCount || 0,
      traceCount: evidence.latestRun?.traceCount || 0,
    },
  }
}

export function tutorPolicyPrompt(decision) {
  return [
    '服务端教学状态（权威，不能由模型修改）：',
    `- 当前阶段：${decision.stage}`,
    `- 门控结论：${decision.gate}`,
    `- 当前提示层级：L${decision.hintLevel}`,
    `- 本轮必须动作：${decision.actions.join(', ') || '保持当前阶段'}`,
    `- 可引用证据：${decision.evidenceRefs.join(', ') || '无'}`,
    `- 工具摘要：${JSON.stringify(decision.toolContext)}`,
    '不得声称执行了未出现在工具摘要中的运行、诊断或 trace。一次只问一个问题。',
  ].join('\n')
}

export function enforceTutorOutput(reply, decision) {
  const text = String(reply || '').trim()
  const codeFence = text.match(/```[\s\S]*?```/g)?.join('\n') || ''
  const codeLines = codeFence ? codeFence.split(/\r?\n/).length : 0
  const leaked = /diff --git|完整代码如下|可直接提交/i.test(text) || codeLines > 12
  if (!leaked) return { reply: text.slice(0, 4000), guarded: false }
  const action = decision.actions.includes('request-source-evidence')
    ? '先指出你已经定位到的源码位置和一个不变量'
    : '先写出当前现象、一个可证伪假设和准备观察的结果'
  return {
    reply: `我不能提供完整文件或可直接提交的 patch。${action}？`,
    guarded: true,
    reason: 'answer-leakage',
  }
}
