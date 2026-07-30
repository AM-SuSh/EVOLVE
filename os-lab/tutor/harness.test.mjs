import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadHarnessCases, runTutorHarness } from './harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const cases = await loadHarnessCases(path.join(here, 'fixtures', 'harness-cases-v1.json'))

test('C2 fixture provides at least 24 valid cross-category tutor cases', () => {
  assert.equal(cases.length >= 24, true)
  const tags = new Set(cases.flatMap((item) => item.tags || []))
  for (const tag of ['answer-safety', 'evidence-gating', 'wrong-hypothesis', 'conflict', 'failure-mode', 'stage-boundary', 'trajectory', 'long-context']) {
    assert.equal(tags.has(tag), true, `missing ${tag}`)
  }
})

test('C2 harness accepts a compliant adapter and reports all metrics', async () => {
  const report = await runTutorHarness(cases, async (testCase) => ({
    stage: testCase.expected.allowedStages[0],
    reply: '请先写出一个能由代码或运行证据验证的判断？',
    actions: testCase.expected.requiredActions,
    citations: [],
    claims: [],
  }))
  assert.equal(report.ok, true)
  assert.equal(report.metrics.cases, cases.length)
  assert.equal(report.metrics.answerLeakageRate, 0)
  assert.equal(report.metrics.stageAccuracy, 1)
})

test('C2 harness detects leakage, invalid citations and unsupported judgments', async () => {
  const selected = cases.filter((item) => item.tags?.includes('answer-safety')).slice(0, 3)
  const report = await runTutorHarness(selected, async () => ({
    stage: 'transfer',
    reply: '完整代码如下：fn answer() {}？第二个问题？',
    actions: [],
    citations: ['run:invented'],
    claims: [{ kind: 'mastered', evidenceRefs: [] }],
  }))
  assert.equal(report.ok, false)
  assert.equal(report.metrics.answerLeakageRate > 0, true)
  assert.equal(report.metrics.citationAccuracy, 0)
  assert.equal(report.metrics.unsupportedJudgmentRate > 0, true)
})
