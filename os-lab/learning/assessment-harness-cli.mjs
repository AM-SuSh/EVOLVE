import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createAssessmentReviewPlan, evaluateAssessmentReviewAnswer } from './assessment-agent.mjs'
import { loadAssessmentHarnessCases, runAssessmentHarness } from './assessment-harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, 'fixtures', 'assessment-harness-cases-v1.json')
const adapterArg = process.argv.find((arg) => arg.startsWith('--adapter='))

let adapter
if (adapterArg) {
  const adapterPath = path.resolve(process.cwd(), adapterArg.slice('--adapter='.length))
  const imported = await import(pathToFileURL(adapterPath).href)
  adapter = imported.default || imported.adapter
  if (typeof adapter !== 'function') throw new TypeError('adapter module must export a default function or adapter')
} else {
  // 默认走确定性管线；接远程 Assessment 模型时通过 --adapter= 注入 llm 配置。
  adapter = async (testCase, bundle) => testCase.type === 'plan'
    ? createAssessmentReviewPlan(bundle, { previousQuestions: testCase.previousQuestions })
    : evaluateAssessmentReviewAnswer(testCase.question, testCase.answer, bundle)
}

const report = await runAssessmentHarness(await loadAssessmentHarnessCases(fixture), adapter)
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.ok ? 0 : 1
