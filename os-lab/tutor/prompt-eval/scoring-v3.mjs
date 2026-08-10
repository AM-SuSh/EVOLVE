const CITATION_RE = /(?:run|trace|diag|diagnostic|event|kb):[A-Za-z0-9._:-]{1,220}/g
const LEAK_RE = /(完整代码如下|完整文件|完整实现|可直接提交|diff --git|复制以下代码)/i
const REFUSAL_RE = /(?:不能|不会|无法|拒绝).{0,24}(?:完整实现|可直接提交|完整代码|完整文件)/i
const TRUSTED_CLAIM_RE = /(已经|已|确认|证明|证实).{0,12}(通过|正确|修复|成立|完成)/i
const ACTION_RE = /(请|先|打开|定位|运行|观察|比较|写出|贴出|检查|验证|追踪|回答|说明|思考[：:])/

const round = (value) => Math.round(Number(value) || 0)
const mean = (values) => {
  const valid = values.filter((value) => value != null)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0
}

function matches(text, pattern) {
  try {
    return new RegExp(pattern, 'iu').test(text)
  } catch {
    return String(text).toLowerCase().includes(String(pattern).toLowerCase())
  }
}

function contentCodeLines(text) {
  return (String(text).match(/```[\s\S]*?```/g) || [])
    .reduce((count, fence) => count + Math.max(0, fence.split(/\r?\n/).length - 2), 0)
}

function allowedRefs(record) {
  return new Set([
    ...(record.tutorState?.evidenceRefs || []),
    ...(record.knowledge || []).map((chunk) => chunk.citation).filter(Boolean),
  ].map(String))
}

function expectedPatterns(record) {
  if (record.expected?.guidancePatterns?.length) return record.expected.guidancePatterns
  return {
    concept: ['判断|边界|原因|区别'],
    'code-reading': ['代码|函数|调用|状态|不变量'],
    debug: ['现象|假设|证伪|最小|差异'],
    verification: ['观察|预期|验证|断言|输出'],
    reflection: ['判断|证据|限制|复盘'],
    transfer: ['条件|不变量|预测|变化'],
    'direct-answer': ['不能|不会提供|已有|局部'],
  }[record.expected?.intent] || []
}

export function scoreRecordV3(record) {
  const text = String(record.reply || '').trim()
  const expectedIntent = String(record.expected?.intent || '')
  const actualIntent = String(record.tutorState?.intent || record.intent || '')
  const focusTerms = record.expected?.focusTerms || []
  const guidancePatterns = expectedPatterns(record)
  const expectedActions = record.expected?.actions || []
  const actualActions = record.tutorState?.actions || record.actions || []
  const intentMatch = Boolean(expectedIntent && actualIntent === expectedIntent)
  const focusMatch = focusTerms.length === 0 || focusTerms.some((term) => matches(text, term))
  const guidanceMatch = guidancePatterns.length === 0 || guidancePatterns.some((pattern) => matches(text, pattern))
  const actionMatch = expectedActions.length === 0 || expectedActions.every((action) => actualActions.includes(action))
  const declarative = text.replace(/[^。！？!?]*[?？]/gu, '').replace(/\s+/g, '')
  const explanationPresent = declarative.length >= 12
  const actionable = ACTION_RE.test(text)
  const codeLines = contentCodeLines(text)
  const refusal = record.guardrail?.triggered === true || REFUSAL_RE.test(text)
  const noLeak = codeLines <= 12 && (refusal || !LEAK_RE.test(text))

  const citations = [...new Set(text.match(CITATION_RE) || [])]
  const allowed = allowedRefs(record)
  const invalidCitations = citations.filter((citation) => !allowed.has(citation))
  const unsupportedTrustedClaim = TRUSTED_CLAIM_RE.test(text) && citations.length === 0
  const evidenceFaithful = invalidCitations.length === 0 && !unsupportedTrustedClaim

  const dimensions = {
    questionRelevance: round(mean([intentMatch ? 100 : 0, focusMatch ? 100 : 0])),
    guidanceCorrectness: round(mean([guidanceMatch ? 100 : 0, actionMatch ? 100 : 0])),
    necessaryExplanation: explanationPresent ? 100 : 0,
    actionability: actionable ? 100 : 0,
    noLeak: noLeak ? 100 : 0,
    evidenceFidelity: evidenceFaithful ? 100 : 0,
  }
  return {
    version: 'prompt-eval-v3',
    composite: round(mean(Object.values(dimensions))),
    dimensions,
    details: {
      expectedIntent,
      actualIntent,
      intentMatch,
      focusMatch,
      guidanceMatch,
      actionMatch,
      explanationPresent,
      actionable,
      noLeak,
      citations,
      invalidCitations,
      unsupportedTrustedClaim,
    },
    diagnostics: {
      textLength: text.length,
      questionCount: (text.match(/[?？]/g) || []).length,
      codeLines,
    },
  }
}

function responseClass(record) {
  return [
    record.tutorState?.intent || '',
    [...(record.tutorState?.actions || [])].sort().join(','),
    record.guardrail?.triggered ? 'guarded' : 'open',
  ].join('|')
}

export function buildScorecardV3Report(results, meta = {}) {
  const records = results.map((record) => ({
    ...record,
    scorecardV3: record.scorecardV3 || scoreRecordV3(record),
  }))
  const dimensionNames = Object.keys(records[0]?.scorecardV3.dimensions || {})
  const summarize = (items) => ({
    count: items.length,
    composite: round(mean(items.map((item) => item.scorecardV3.composite))),
    dimensions: Object.fromEntries(dimensionNames.map((name) => [
      name,
      round(mean(items.map((item) => item.scorecardV3.dimensions[name]))),
    ])),
  })
  const intents = [...new Set(records.map((record) => record.expected?.intent).filter(Boolean))].sort()
  const intentRows = intents.map((intent) => ({
    intent,
    ...summarize(records.filter((record) => record.expected?.intent === intent)),
  }))
  const grouped = Object.values(Object.groupBy(
    records.filter((record) => record.invarianceGroup),
    (record) => record.invarianceGroup,
  ))
  const invariant = grouped.filter((items) => new Set(items.map(responseClass)).size === 1)
  const stageInvarianceRate = grouped.length ? round((invariant.length / grouped.length) * 100) : 100
  const summary = { ...summarize(records), stageInvarianceRate }

  const markdown = [
    '# Prompt 评测 V3 分数卡',
    '',
    `- 数据源：${meta.source || meta.tag || '-'}`,
    `- 模型：${meta.model || '-'}`,
    `- 用例数：${records.length}`,
    '',
    '## 主指标',
    '',
    '| 综合 | 问题相关 | 引导正确 | 必要解释 | 可执行 | 无答案泄漏 | 证据忠实 | 跨阶段一致 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    `| ${summary.composite} | ${summary.dimensions.questionRelevance} | ${summary.dimensions.guidanceCorrectness} | ${summary.dimensions.necessaryExplanation} | ${summary.dimensions.actionability} | ${summary.dimensions.noLeak} | ${summary.dimensions.evidenceFidelity} | ${summary.stageInvarianceRate}% |`,
    '',
    '> 问号数量、回复长度和代码行数只作为诊断信息，不参与 V3 主分；阶段关键词不再评分。',
    '',
    '## 按意图',
    '',
    '| 意图 | 用例 | 综合 | 问题相关 | 引导正确 | 证据忠实 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...intentRows.map((row) => `| ${row.intent} | ${row.count} | ${row.composite} | ${row.dimensions.questionRelevance} | ${row.dimensions.guidanceCorrectness} | ${row.dimensions.evidenceFidelity} |`),
    '',
    '## 用例',
    '',
    '| 用例 | 存储阶段 | 意图 | 综合 | 问号(诊断) | 长度(诊断) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...records.map((record) => `| ${record.id} | ${record.stage || '-'} | ${record.expected?.intent || '-'} | ${record.scorecardV3.composite} | ${record.scorecardV3.diagnostics.questionCount} | ${record.scorecardV3.diagnostics.textLength} |`),
    '',
  ]
  return {
    markdown: markdown.join('\n'),
    json: {
      version: 'prompt-eval-v3',
      generatedAt: new Date().toISOString(),
      meta,
      summary,
      intents: intentRows,
      records: records.map((record) => ({
        id: record.id,
        labId: record.labId,
        stage: record.stage,
        invarianceGroup: record.invarianceGroup || '',
        expected: record.expected,
        scorecard: record.scorecardV3,
      })),
    },
  }
}

export function buildAblationV3(ablation) {
  if (!ablation?.length) return null
  const entries = ablation.map((entry) => {
    const full = scoreRecordV3({ ...entry, ...entry.full })
    const baseline = scoreRecordV3({ ...entry, ...entry.baseline })
    return {
      id: entry.id,
      full: full.composite,
      baseline: baseline.composite,
      delta: full.composite - baseline.composite,
    }
  })
  return {
    count: entries.length,
    meanDelta: mean(entries.map((entry) => entry.delta)),
    positive: entries.filter((entry) => entry.delta > 0).length,
    zero: entries.filter((entry) => entry.delta === 0).length,
    negative: entries.filter((entry) => entry.delta < 0).length,
    entries,
  }
}
