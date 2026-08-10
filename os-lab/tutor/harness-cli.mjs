import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadHarnessCases, runTutorHarness } from './harness.mjs'
import { inferTutorIntent } from './turn-policy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, 'fixtures', 'harness-cases-v1.json')
const adapterArg = process.argv.find((arg) => arg.startsWith('--adapter='))

let adapter
if (adapterArg) {
  const adapterPath = path.resolve(process.cwd(), adapterArg.slice('--adapter='.length))
  const imported = await import(pathToFileURL(adapterPath).href)
  adapter = imported.default || imported.adapter
  if (typeof adapter !== 'function') throw new TypeError('adapter module must export a default function or adapter')
} else {
  adapter = async (testCase) => ({
    stage: testCase.expected.allowedStages[0],
    intent: testCase.expected.intent || inferTutorIntent(testCase.turns.at(-1)?.student || ''),
    reply: '请先给出一个可由代码或运行结果验证的判断？',
    actions: testCase.expected.requiredActions,
    citations: [],
    claims: [],
  })
}

const report = await runTutorHarness(await loadHarnessCases(fixture), adapter)
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.ok ? 0 : 1
