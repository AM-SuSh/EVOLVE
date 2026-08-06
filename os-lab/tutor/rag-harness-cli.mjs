import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadRagHarnessCases, runRagHarness } from './rag-harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, 'fixtures', 'rag-harness-cases-v1.json')
const adapterArg = process.argv.find((arg) => arg.startsWith('--adapter='))

function list(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
}

function defaultAdapter(testCase) {
  const expected = testCase.expected || {}
  const knowledgeExpected = expected.knowledge || {}
  const citations = list(knowledgeExpected.requiredCitations)
  const sourceIds = list(knowledgeExpected.requiredSourceIds)
  const sourceTitles = list(knowledgeExpected.requiredSourceTitles)
  const contentClasses = list(knowledgeExpected.requiredContentClasses)
  const scopes = list(knowledgeExpected.requiredLabScopes)
  const minCount = Number(knowledgeExpected.minCount || 0)
  const count = Math.max(
    minCount,
    citations.length,
    sourceIds.length,
    sourceTitles.length,
    contentClasses.length,
    scopes.length ? 1 : 0,
  )
  const knowledge = Array.from({ length: count }, (_, index) => ({
    citation: citations[index] || `kb:harness-${testCase.id}-${index + 1}`,
    sourceId: sourceIds[index] || sourceIds[0] || 'platform-lab-manuals',
    sourceTitle: sourceTitles[index] || sourceTitles[0] || 'Harness Fixture Source',
    sectionPath: ['Harness', testCase.id],
    contentClass: contentClasses[index] || contentClasses[0] || 'student-safe',
    labScopes: scopes.length ? [scopes[index] || scopes[0]] : [testCase.labId],
  }))
  const retrievalExpected = expected.retrieval || {}
  const promptPatterns = list(expected.promptPatterns)
  const fallbackReason = String(retrievalExpected.fallbackReasonIncludes || '')
  return {
    stage: expected.allowedStages?.[0] || testCase.stage,
    reply: '先写出一个能由代码或运行结果验证的判断，再决定下一步观察。',
    knowledge,
    retrieval: {
      provider: 'local-feature-hash',
      model: 'local-feature-hash-v1-384',
      lexicalCandidates: Math.max(knowledge.length, Number(retrievalExpected.lexicalCandidatesMin || 0)),
      vectorCandidates: Math.max(knowledge.length, Number(retrievalExpected.vectorCandidatesMin || 0)),
      eligibleChunks: Math.max(knowledge.length, Number(retrievalExpected.eligibleChunksMin || 0)),
      fallbackReason,
    },
    prompt: knowledge.length ? [...new Set(['<knowledge-chunk', ...promptPatterns])].join('\n') : '',
  }
}

let adapter = defaultAdapter
if (adapterArg) {
  const adapterPath = path.resolve(process.cwd(), adapterArg.slice('--adapter='.length))
  const imported = await import(pathToFileURL(adapterPath).href)
  adapter = imported.default || imported.adapter
  if (typeof adapter !== 'function') {
    throw new TypeError('adapter module must export a default function or adapter')
  }
}

const cases = await loadRagHarnessCases(fixture)
const report = await runRagHarness(cases, adapter)
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.ok ? 0 : 1
