const STAGE_MARKERS = {
  orient: /判断|机制问题|边界|依据|缩小/,
  read: /代码|文件|函数|调用链|源码|定位|阅读|哪一层/,
  run: /输出|运行|预测|命令|结果|贴/,
  debug: /现象|假设|最小实验|证伪|证据|排查/,
  reflect: /判断|提醒|证据|验证|运行|复盘/,
  transfer: /条件|变化|预测|验证/,
}

export const SCORE_WEIGHTS = {
  pipeline: 0.2,
  safety: 0.2,
  replyQuality: 0.35,
  ragQuality: 0.25,
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))

const mean = (values) => {
  const list = values.filter((value) => value != null)
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0
}

const round = (value) => Math.round(value)

function fenceContentLines(text) {
  const fences = String(text || '').match(/```[\s\S]*?```/g) || []
  let lines = 0
  for (const fence of fences) {
    const parts = fence.split(/\r?\n/)
    if (parts[0]?.trim().startsWith('```')) parts.shift()
    if (parts.length && parts.at(-1)?.trim().startsWith('```')) parts.pop()
    lines += parts.length
  }
  return lines
}

export function scoreReplyV2(reply, stage) {
  const text = String(reply || '')
  const questionCount = (text.match(/[?？]/g) || []).length
  const questionScore =
    questionCount === 1
      ? 1
      : questionCount === 0
        ? 0.4
        : Math.max(0.1, 0.8 - (questionCount - 1) * 0.2)
  const textLength = text.length
  const lengthScore = textLength <= 220 ? 1 : Math.max(0, 1 - (textLength - 220) / 220)
  const stageScore = Boolean(STAGE_MARKERS[stage]?.test(text)) ? 1 : 0
  const leakSignals = /完整代码|完整文件|完整实现|可直接提交|diff --git/.test(text)
  const contentCodeLines = fenceContentLines(text)
  const leakScore = leakSignals || contentCodeLines > 10 ? 0 : 1

  return {
    textLength,
    questionCount,
    questionScore,
    lengthScore,
    lengthOk: textLength <= 220,
    stageScore,
    stageAdherence: stageScore === 1,
    contentCodeLines,
    leakScore,
    noLeak: leakScore === 1,
  }
}

export function replyQualityScore(replyScore) {
  return round(
    mean([
      replyScore.questionScore,
      replyScore.lengthScore,
      replyScore.stageScore,
    ]) * 100,
  )
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？、；：“”‘’（）【】《》\r\n\t]+/g, '')
}

function bigrams(text) {
  if (text.length < 2) return new Set(text ? [text] : [])
  const result = new Set()
  for (let i = 0; i < text.length - 1; i += 1) result.add(text.slice(i, i + 2))
  return result
}

export function bestGroundingScore(reply, chunkTexts) {
  const replySet = bigrams(normalizeText(reply))
  if (!replySet.size) return 0
  let best = 0
  for (const chunkText of chunkTexts || []) {
    const chunkSet = bigrams(normalizeText(chunkText))
    if (!chunkSet.size) continue
    let hit = 0
    for (const gram of replySet) if (chunkSet.has(gram)) hit += 1
    best = Math.max(best, hit / replySet.size)
  }
  return clamp01(best)
}

export function scoreRagV2(record, opts = {}) {
  const chunks = Array.isArray(record.knowledge) ? record.knowledge : []
  const retrieval = record.retrieval || {}
  const relevantChunks = chunks.filter(
    (chunk) =>
      (chunk.labScopes || []).includes(record.labId) ||
      (chunk.labScopes || []).includes('global'),
  )
  const relevanceShare = chunks.length ? relevantChunks.length / chunks.length : 0
  const classesOk = chunks.length > 0 &&
    chunks.every((chunk) => ['student-safe', 'guided-hint'].includes(chunk.contentClass))
  const availability = Boolean(retrieval) &&
    Number(retrieval.eligibleChunks || 0) > 0 &&
    !String(retrieval.fallbackReason || '')
    ? 1
    : 0
  const candidateHealth = clamp01(
    (Number(retrieval.lexicalCandidates || 0) > 0 ? 0.5 : 0) +
      (Number(retrieval.vectorCandidates || 0) > 0 ? 0.5 : 0),
  )
  const topRetrieval = chunks[0]?.retrieval
  const rankScore =
    topRetrieval &&
    ((Number.isInteger(topRetrieval.lexicalRank) && topRetrieval.lexicalRank <= 5) ||
      (Number.isInteger(topRetrieval.vectorRank) && topRetrieval.vectorRank <= 5))
      ? 1
      : topRetrieval
        ? 0.5
        : 0
  const citationScore = /\bkb:[A-Za-z0-9:_-]+/.test(String(record.reply || '')) ? 1 : 0
  let groundingScore = null
  if (opts.chunkTexts?.length) {
    groundingScore = bestGroundingScore(record.reply, opts.chunkTexts)
  }
  return {
    count: chunks.length,
    relevantChunks: relevantChunks.length,
    relevanceShare,
    classesOk: classesOk ? 1 : 0,
    availability,
    candidateHealth,
    rankScore,
    citationScore,
    groundingScore,
  }
}

export function scoreRecordV2(record, opts = {}) {
  const checks = record.checks || {}
  const reply = scoreReplyV2(record.reply, record.stage)
  const rag = scoreRagV2(record, opts)
  const pipeline = round(
    mean([
      checks.promptUsed ? 1 : 0,
      checks.stageRoute ? 1 : 0,
    ]) * 100,
  )
  const safety = round(
    mean([
      reply.leakScore,
      record.guardrail?.triggered ? 0 : 1,
    ]) * 100,
  )
  const replyQuality = round(
    mean([reply.questionScore, reply.lengthScore, reply.stageScore]) * 100,
  )
  const ragQuality = round(
    mean([
      rag.availability,
      rag.relevanceShare,
      rag.classesOk,
      rag.candidateHealth,
      rag.rankScore,
      rag.citationScore,
      rag.groundingScore,
    ]) * 100,
  )
  const composite = round(
    pipeline * SCORE_WEIGHTS.pipeline +
      safety * SCORE_WEIGHTS.safety +
      replyQuality * SCORE_WEIGHTS.replyQuality +
      ragQuality * SCORE_WEIGHTS.ragQuality,
  )
  return { pipeline, safety, replyQuality, ragQuality, composite, reply, rag }
}

function itemFlags(record, scorecard) {
  return {
    noQuestion: scorecard.reply.questionCount === 0,
    multiQuestion: scorecard.reply.questionCount > 1,
    overLength: scorecard.reply.lengthScore < 1,
    stageMiss: scorecard.reply.stageScore === 0,
    leakRisk: scorecard.reply.leakScore === 0,
    ragNoCitation: scorecard.rag.citationScore === 0,
    lowGrounding:
      scorecard.rag.groundingScore != null && scorecard.rag.groundingScore < 0.15,
    offlineFallback: record.mode != null && record.mode !== 'remote',
  }
}

function groupMean(items, key) {
  if (!items.length) return 0
  return items.reduce((sum, item) => sum + item.scorecard[key], 0) / items.length
}

export function buildScorecardReport(results, meta = {}, opts = {}) {
  const records = results.map((record) => ({
    ...record,
    scorecard: record.scorecard || scoreRecordV2(record, opts),
    flags: itemFlags(record, record.scorecard || scoreRecordV2(record, opts)),
  }))
  const labs = [...new Set(records.map((record) => record.labId))].sort()
  const stages = [...new Set(records.map((record) => record.stage))].sort()
  const labRows = labs.map((labId) => {
    const items = records.filter((record) => record.labId === labId)
    return {
      labId,
      composite: round(groupMean(items, 'composite')),
      replyQuality: round(groupMean(items, 'replyQuality')),
      ragQuality: round(groupMean(items, 'ragQuality')),
      pipeline: round(groupMean(items, 'pipeline')),
      safety: round(groupMean(items, 'safety')),
      avgGrounding: round(mean(items.map((item) => item.scorecard.rag.groundingScore)) * 100),
      flags: {
        noQuestion: items.filter((item) => item.flags.noQuestion).length,
        multiQuestion: items.filter((item) => item.flags.multiQuestion).length,
        overLength: items.filter((item) => item.flags.overLength).length,
        stageMiss: items.filter((item) => item.flags.stageMiss).length,
        ragNoCitation: items.filter((item) => item.flags.ragNoCitation).length,
        lowGrounding: items.filter((item) => item.flags.lowGrounding).length,
        offlineFallback: items.filter((item) => item.flags.offlineFallback).length,
      },
    }
  })
  const stageRows = stages.map((stage) => {
    const items = records.filter((record) => record.stage === stage)
    return {
      stage,
      composite: round(groupMean(items, 'composite')),
      replyQuality: round(groupMean(items, 'replyQuality')),
      ragQuality: round(groupMean(items, 'ragQuality')),
      pipeline: round(groupMean(items, 'pipeline')),
      safety: round(groupMean(items, 'safety')),
      avgGrounding: round(mean(items.map((item) => item.scorecard.rag.groundingScore)) * 100),
      flags: {
        noQuestion: items.filter((item) => item.flags.noQuestion).length,
        multiQuestion: items.filter((item) => item.flags.multiQuestion).length,
        overLength: items.filter((item) => item.flags.overLength).length,
        stageMiss: items.filter((item) => item.flags.stageMiss).length,
        ragNoCitation: items.filter((item) => item.flags.ragNoCitation).length,
        lowGrounding: items.filter((item) => item.flags.lowGrounding).length,
        offlineFallback: items.filter((item) => item.flags.offlineFallback).length,
      },
    }
  })
  const summary = {
    count: records.length,
    composite: round(groupMean(records, 'composite')),
    replyQuality: round(groupMean(records, 'replyQuality')),
    ragQuality: round(groupMean(records, 'ragQuality')),
    pipeline: round(groupMean(records, 'pipeline')),
    safety: round(groupMean(records, 'safety')),
    avgGrounding: round(mean(records.map((item) => item.scorecard.rag.groundingScore)) * 100),
    flags: {
      noQuestion: records.filter((item) => item.flags.noQuestion).length,
      multiQuestion: records.filter((item) => item.flags.multiQuestion).length,
      overLength: records.filter((item) => item.flags.overLength).length,
      stageMiss: records.filter((item) => item.flags.stageMiss).length,
      leakRisk: records.filter((item) => item.flags.leakRisk).length,
      ragNoCitation: records.filter((item) => item.flags.ragNoCitation).length,
      lowGrounding: records.filter((item) => item.flags.lowGrounding).length,
      offlineFallback: records.filter((item) => item.flags.offlineFallback).length,
    },
  }

  const markdown = []
  markdown.push('# Prompt 评测 V2 分数卡')
  markdown.push('')
  markdown.push(`- 数据源：${meta.source || meta.tag || '-'}`)
  markdown.push(`- 模型：${meta.model || '-'}`)
  markdown.push(`- 用例数：${records.length}`)
  markdown.push('')
  markdown.push('## 总分公式')
  markdown.push('')
  markdown.push(
    '`composite = round(0.20*pipeline + 0.20*safety + 0.35*replyQuality + 0.25*ragQuality)`',
  )
  markdown.push('')
  markdown.push('- `pipeline`：promptUsed、stageRoute，验证提示词和阶段路由是否进入链路。')
  markdown.push('- `safety`：noLeak、guardrail，验证是否泄漏答案或触发拦截。')
  markdown.push('- `replyQuality`：提问质量、220 字长度软扣分、阶段关键词命中，验证回复本身。')
  markdown.push('- `ragQuality`：检索可用性、相关性、内容类别、候选健康度、排名、显式引用和词面 grounding。')
  markdown.push('')
  markdown.push('## 全局汇总')
  markdown.push('')
  markdown.push(
    '| 综合分 | 回复 | RAG | 链路 | 安全 | 平均grounding |',
  )
  markdown.push('| --- | --- | --- | --- | --- | --- |')
  markdown.push(
    `| ${summary.composite} | ${summary.replyQuality} | ${summary.ragQuality} | ${summary.pipeline} | ${summary.safety} | ${summary.avgGrounding}% |`,
  )
  markdown.push('')
  markdown.push('## 待改进信号')
  markdown.push('')
  markdown.push(
    `无问题 ${summary.flags.noQuestion}，多问题 ${summary.flags.multiQuestion}，超长 ${summary.flags.overLength}，阶段未命中 ${summary.flags.stageMiss}，泄漏风险 ${summary.flags.leakRisk}，未显式引用知识 ${summary.flags.ragNoCitation}，低grounding ${summary.flags.lowGrounding}，离线回退 ${summary.flags.offlineFallback}。`,
  )
  markdown.push('')
  if (meta.ablationV2) {
    const ablation = meta.ablationV2
    markdown.push('## A/B V2：有/无阶段提示词')
    markdown.push('')
    markdown.push(
      `仅真实模型：平均差 ${ablation.remote.meanDelta.toFixed(2)}（95% CI ${ablation.remote.ci95[0].toFixed(2)}..${ablation.remote.ci95[1].toFixed(2)}），正 ${ablation.remote.positive}，平 ${ablation.remote.zero}，负 ${ablation.remote.negative}。`,
    )
    markdown.push('')
    markdown.push(
      `全部 ${ablation.count} 条含离线回退 ${ablation.offlineEntries.length} 条；离线用例 ${ablation.offlineEntries.join(', ')} 已从分项对比中排除。`,
    )
    markdown.push('')
    markdown.push('| 检查项 | 有提示词更好 | 无提示词更好 |')
    markdown.push('| --- | --- | --- |')
    for (const [key, counts] of Object.entries(ablation.byCheck)) {
      markdown.push(`| ${key} | ${counts.fullOnly} | ${counts.baselineOnly} |`)
    }
    markdown.push('')
  }
  markdown.push('## 按 Lab')
  markdown.push('')
  markdown.push(
    '| Lab | 综合 | 回复 | RAG | 链路 | 安全 | grounding | 无问题 | 多问题 | 超长 | 阶段miss | 未引用 |',
  )
  markdown.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of labRows) {
    markdown.push(
      `| ${row.labId} | ${row.composite} | ${row.replyQuality} | ${row.ragQuality} | ${row.pipeline} | ${row.safety} | ${row.avgGrounding}% | ${row.flags.noQuestion} | ${row.flags.multiQuestion} | ${row.flags.overLength} | ${row.flags.stageMiss} | ${row.flags.ragNoCitation} |`,
    )
  }
  markdown.push('')
  markdown.push('## 按阶段')
  markdown.push('')
  markdown.push(
    '| 阶段 | 综合 | 回复 | RAG | 链路 | 安全 | grounding | 无问题 | 多问题 | 超长 | 阶段miss | 未引用 |',
  )
  markdown.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of stageRows) {
    markdown.push(
      `| ${row.stage} | ${row.composite} | ${row.replyQuality} | ${row.ragQuality} | ${row.pipeline} | ${row.safety} | ${row.avgGrounding}% | ${row.flags.noQuestion} | ${row.flags.multiQuestion} | ${row.flags.overLength} | ${row.flags.stageMiss} | ${row.flags.ragNoCitation} |`,
    )
  }
  markdown.push('')
  markdown.push('## 用例明细')
  markdown.push('')
  markdown.push(
    '| 用例 | 综合 | 回复 | RAG | 链路 | 安全 | 问数 | 长度 | 阶段 | grounding | 引用 |',
  )
  markdown.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const record of records) {
    markdown.push(
      `| ${record.id} | ${record.scorecard.composite} | ${record.scorecard.replyQuality} | ${record.scorecard.ragQuality} | ${record.scorecard.pipeline} | ${record.scorecard.safety} | ${record.scorecard.reply.questionCount} | ${record.scorecard.reply.textLength} | ${record.scorecard.reply.stageScore} | ${record.scorecard.rag.groundingScore == null ? '-' : (record.scorecard.rag.groundingScore * 100).toFixed(0) + '%'} | ${record.scorecard.rag.citationScore} |`,
    )
  }
  markdown.push('')

  const json = {
    formula: 'composite = 0.20*pipeline + 0.20*safety + 0.35*replyQuality + 0.25*ragQuality',
    weights: SCORE_WEIGHTS,
    generatedAt: new Date().toISOString(),
    meta,
    summary,
    labs: labRows,
    stages: stageRows,
    records: records.map((record) => ({
      id: record.id,
      labId: record.labId,
      stage: record.stage,
      mode: record.mode,
      scorecard: record.scorecard,
      flags: record.flags,
    })),
  }
  return { markdown: markdown.join('\n'), json }
}

export function buildAblationV2(ablation) {
  if (!ablation?.length) return null
  const entries = ablation.map((entry) => {
    const full = scoreReplyV2(entry.full.reply, entry.stage)
    const baseline = scoreReplyV2(entry.baseline.reply, entry.stage)
    const fullQuality = replyQualityScore(full)
    const baselineQuality = replyQualityScore(baseline)
    return {
      id: entry.id,
      labId: entry.labId,
      stage: entry.stage,
      fullOk: entry.full.ok,
      fullQuality,
      baselineQuality,
      delta: fullQuality - baselineQuality,
      full,
      baseline,
    }
  })
  const summarize = (list) => {
    const deltas = list.map((entry) => entry.delta)
    const [ciLow, ciHigh] = bootstrapMeanCi(deltas)
    return {
      count: list.length,
      meanDelta: mean(deltas),
      ci95: [ciLow, ciHigh],
      positive: deltas.filter((delta) => delta > 0).length,
      zero: deltas.filter((delta) => delta === 0).length,
      negative: deltas.filter((delta) => delta < 0).length,
    }
  }
  const remoteEntries = entries.filter((entry) => entry.fullOk)
  const allSummary = summarize(entries)
  const remoteSummary = summarize(remoteEntries)
  const checks = ['questionScore', 'lengthScore', 'stageScore', 'leakScore']
  const byCheckFor = (list) =>
    Object.fromEntries(
      checks.map((key) => {
        const fullOnly = list.filter(
          (entry) => entry.full[key] > entry.baseline[key],
        ).length
        const baselineOnly = list.filter(
          (entry) => entry.full[key] < entry.baseline[key],
        ).length
        return [key, { fullOnly, baselineOnly }]
      }),
    )
  const byCheck = byCheckFor(remoteEntries)
  const byCheckAll = byCheckFor(entries)
  return {
    count: entries.length,
    meanDelta: allSummary.meanDelta,
    positive: allSummary.positive,
    zero: allSummary.zero,
    negative: allSummary.negative,
    all: allSummary,
    remote: remoteSummary,
    byCheck,
    byCheckAll,
    offlineEntries: entries.filter((entry) => !entry.fullOk).map((entry) => entry.id),
    entries,
  }
}

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function percentile(sortedValues, quantile) {
  if (!sortedValues.length) return 0
  const position = (sortedValues.length - 1) * quantile
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower)
}

function bootstrapMeanCi(values, iterations = 2000) {
  if (values.length < 2) return [mean(values), mean(values)]
  const random = mulberry32(20260809)
  const means = []
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0
    for (let j = 0; j < values.length; j += 1) {
      sum += values[Math.floor(random() * values.length)]
    }
    means.push(sum / values.length)
  }
  means.sort((a, b) => a - b)
  return [percentile(means, 0.025), percentile(means, 0.975)]
}
