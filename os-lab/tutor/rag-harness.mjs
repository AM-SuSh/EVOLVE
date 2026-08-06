import { readFile } from 'node:fs/promises'

const LAB_ID_RE = /^lab[1-8]$/
const STAGE_IDS = new Set(['orient', 'read', 'run', 'debug', 'reflect', 'transfer'])
const DEFAULT_ALLOWED_CONTENT_CLASSES = new Set(['student-safe', 'guided-hint'])

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isText(value, max = 4_000) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

function normalizeList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
}

function matchesPattern(text, pattern) {
  const value = String(text || '')
  const needle = String(pattern || '')
  if (!needle) return false
  try {
    return new RegExp(needle, 'iu').test(value)
  } catch {
    return value.toLowerCase().includes(needle.toLowerCase())
  }
}

function countGlobalChunks(knowledge, labId) {
  return knowledge.filter((item) => {
    const scopes = normalizeList(item.labScopes)
    return scopes.includes('global') && !scopes.includes(labId)
  }).length
}

export const DEFAULT_RAG_THRESHOLDS = Object.freeze({
  maxKnowledgeCount: 5,
  maxGlobalCount: 2,
})

export function validateRagHarnessCase(testCase) {
  if (
    !isRecord(testCase) ||
    testCase.version !== 1 ||
    !isText(testCase.id, 120) ||
    !LAB_ID_RE.test(String(testCase.labId || '')) ||
    !STAGE_IDS.has(String(testCase.stage || '')) ||
    !isText(testCase.message, 20_000) ||
    !isRecord(testCase.expected)
  ) {
    return false
  }

  if (
    !Array.isArray(testCase.evidenceRefs || []) ||
    normalizeList(testCase.evidenceRefs).some((ref) => !isText(ref, 120))
  ) {
    return false
  }

  const allowedStages = testCase.expected.allowedStages
  const knowledge = testCase.expected.knowledge
  const promptPatterns = testCase.expected.promptPatterns || []
  const forbiddenPromptPatterns = testCase.expected.forbiddenPromptPatterns || []
  const retrieval = testCase.expected.retrieval || null

  if (
    !Array.isArray(allowedStages) ||
    !allowedStages.length ||
    allowedStages.some((stage) => !STAGE_IDS.has(stage)) ||
    !isRecord(knowledge)
  ) {
    return false
  }

  const validateStringArray = (value, max = 120) =>
    value === undefined || (Array.isArray(value) && value.every((item) => isText(item, max)))

  return Boolean(
    validateStringArray(knowledge.requiredCitations) &&
      validateStringArray(knowledge.forbiddenCitations) &&
      validateStringArray(knowledge.requiredSourceIds) &&
      validateStringArray(knowledge.forbiddenSourceIds) &&
      validateStringArray(knowledge.requiredSourceTitles) &&
      validateStringArray(knowledge.forbiddenSourceTitles) &&
      validateStringArray(knowledge.requiredLabScopes) &&
      validateStringArray(knowledge.forbiddenLabScopes) &&
      validateStringArray(knowledge.requiredContentClasses) &&
      validateStringArray(knowledge.forbiddenContentClasses) &&
      validateStringArray(promptPatterns, 500) &&
      validateStringArray(forbiddenPromptPatterns, 500) &&
      (!retrieval ||
        (typeof retrieval === 'object' &&
          !Array.isArray(retrieval) &&
          [
            ['lexicalCandidatesMin', retrieval.lexicalCandidatesMin],
            ['vectorCandidatesMin', retrieval.vectorCandidatesMin],
            ['eligibleChunksMin', retrieval.eligibleChunksMin],
          ].every(([, value]) => value === undefined || Number.isFinite(Number(value))) &&
          (retrieval.fallbackReasonIncludes === undefined || isText(retrieval.fallbackReasonIncludes, 500)))),
  )
}

export function evaluateRagHarnessResult(testCase, result) {
  if (!validateRagHarnessCase(testCase)) {
    throw new TypeError(`invalid rag harness case: ${testCase?.id || 'unknown'}`)
  }

  const safe = isRecord(result) ? result : {}
  const reply = String(safe.reply || '')
  const stage = String(safe.stage || '')
  const prompt = String(safe.prompt || '')
  const knowledge = Array.isArray(safe.knowledge) ? safe.knowledge.filter(isRecord) : []
  const retrieval = isRecord(safe.retrieval) ? safe.retrieval : {}
  const expected = testCase.expected || {}
  const knowledgeExpectation = expected.knowledge || {}
  const promptPatterns = normalizeList(expected.promptPatterns)
  const forbiddenPromptPatterns = normalizeList(expected.forbiddenPromptPatterns)
  const requiredCitations = normalizeList(knowledgeExpectation.requiredCitations)
  const forbiddenCitations = normalizeList(knowledgeExpectation.forbiddenCitations)
  const requiredSourceIds = normalizeList(knowledgeExpectation.requiredSourceIds)
  const forbiddenSourceIds = normalizeList(knowledgeExpectation.forbiddenSourceIds)
  const requiredSourceTitles = normalizeList(knowledgeExpectation.requiredSourceTitles)
  const forbiddenSourceTitles = normalizeList(knowledgeExpectation.forbiddenSourceTitles)
  const requiredLabScopes = normalizeList(knowledgeExpectation.requiredLabScopes)
  const forbiddenLabScopes = normalizeList(knowledgeExpectation.forbiddenLabScopes)
  const requiredContentClasses = normalizeList(knowledgeExpectation.requiredContentClasses)
  const forbiddenContentClasses = normalizeList(knowledgeExpectation.forbiddenContentClasses)
  const allowedStages = expected.allowedStages || []
  const knowledgeCount = knowledge.length
  const globalCount = countGlobalChunks(knowledge, testCase.labId)
  const observedCitations = new Set(knowledge.map((item) => String(item.citation || '')).filter(Boolean))
  const observedSourceIds = new Set(knowledge.map((item) => String(item.sourceId || '')).filter(Boolean))
  const observedSourceTitles = new Set(knowledge.map((item) => String(item.sourceTitle || '')).filter(Boolean))
  const observedLabScopes = new Set(knowledge.flatMap((item) => normalizeList(item.labScopes)))
  const observedContentClasses = new Set(knowledge.map((item) => String(item.contentClass || '')).filter(Boolean))
  const promptPatternHits = promptPatterns.filter((pattern) => matchesPattern(prompt, pattern))
  const forbiddenPromptHits = forbiddenPromptPatterns.filter((pattern) => matchesPattern(prompt, pattern))
  const requiredCitationMissing = requiredCitations.filter((citation) => !observedCitations.has(citation))
  const forbiddenCitationHits = forbiddenCitations.filter((citation) => observedCitations.has(citation))
  const requiredSourceIdMissing = requiredSourceIds.filter((sourceId) => !observedSourceIds.has(sourceId))
  const forbiddenSourceIdHits = forbiddenSourceIds.filter((sourceId) => observedSourceIds.has(sourceId))
  const requiredSourceTitleMissing = requiredSourceTitles.filter((title) => !observedSourceTitles.has(title))
  const forbiddenSourceTitleHits = forbiddenSourceTitles.filter((title) => observedSourceTitles.has(title))
  const requiredLabScopeMissing = requiredLabScopes.filter((scope) => !observedLabScopes.has(scope))
  const forbiddenLabScopeHits = forbiddenLabScopes.filter((scope) => observedLabScopes.has(scope))
  const requiredContentClassMissing = requiredContentClasses.filter((contentClass) => !observedContentClasses.has(contentClass))
  const forbiddenContentClassHits = forbiddenContentClasses.filter((contentClass) => observedContentClasses.has(contentClass))
  const metadataMissing = knowledge.flatMap((item, index) => {
    const missing = []
    if (!isText(item.citation, 240)) missing.push('citation')
    if (!isText(item.sourceId, 240)) missing.push('sourceId')
    if (!isText(item.sourceTitle, 500)) missing.push('sourceTitle')
    if (!Array.isArray(item.sectionPath)) missing.push('sectionPath')
    if (!isText(item.contentClass, 120)) missing.push('contentClass')
    if (!normalizeList(item.labScopes).length) missing.push('labScopes')
    return missing.length ? [`chunk[${index}]:${missing.join('+')}`] : []
  })
  const illegalContentClassHits = knowledge
    .filter((item) => !DEFAULT_ALLOWED_CONTENT_CLASSES.has(String(item.contentClass || '')))
    .map((item) => `${item.citation || item.sourceId || 'unknown'}:${String(item.contentClass || '')}`)

  const maxKnowledgeCount = Number(knowledgeExpectation.maxCount ?? DEFAULT_RAG_THRESHOLDS.maxKnowledgeCount)
  const maxGlobalCount = Number(knowledgeExpectation.maxGlobalCount ?? DEFAULT_RAG_THRESHOLDS.maxGlobalCount)
  const knowledgeCountOk = knowledgeCount >= Number(knowledgeExpectation.minCount ?? 0) && knowledgeCount <= maxKnowledgeCount
  const globalCountOk = globalCount <= maxGlobalCount
  const promptOk =
    promptPatterns.every((pattern) => promptPatternHits.includes(pattern)) &&
    forbiddenPromptHits.length === 0 &&
    (knowledgeCount === 0 || matchesPattern(prompt, '<knowledge-chunk'))
  const retrievalExpectation = expected.retrieval || null
  const retrievalMissing = []
  let retrievalOk = true
  if (retrievalExpectation) {
    if (retrieval.lexicalCandidates === undefined) retrievalMissing.push('missing lexicalCandidates')
    if (retrieval.vectorCandidates === undefined) retrievalMissing.push('missing vectorCandidates')
    if (retrieval.eligibleChunks === undefined) retrievalMissing.push('missing eligibleChunks')
    if (
      retrievalExpectation.lexicalCandidatesMin !== undefined &&
      Number(retrieval.lexicalCandidates || 0) < Number(retrievalExpectation.lexicalCandidatesMin)
    ) {
      retrievalMissing.push(`lexicalCandidates < ${retrievalExpectation.lexicalCandidatesMin}`)
    }
    if (
      retrievalExpectation.vectorCandidatesMin !== undefined &&
      Number(retrieval.vectorCandidates || 0) < Number(retrievalExpectation.vectorCandidatesMin)
    ) {
      retrievalMissing.push(`vectorCandidates < ${retrievalExpectation.vectorCandidatesMin}`)
    }
    if (
      retrievalExpectation.eligibleChunksMin !== undefined &&
      Number(retrieval.eligibleChunks || 0) < Number(retrievalExpectation.eligibleChunksMin)
    ) {
      retrievalMissing.push(`eligibleChunks < ${retrievalExpectation.eligibleChunksMin}`)
    }
    if (
      retrievalExpectation.fallbackReasonIncludes &&
      !String(retrieval.fallbackReason || '').includes(retrievalExpectation.fallbackReasonIncludes)
    ) {
      retrievalMissing.push(`fallbackReason missing ${retrievalExpectation.fallbackReasonIncludes}`)
    }
    retrievalOk = retrievalMissing.length === 0
  }

  const stageOk = allowedStages.includes(stage)
  const knowledgeOk =
    knowledgeCountOk &&
    globalCountOk &&
    requiredCitationMissing.length === 0 &&
    forbiddenCitationHits.length === 0 &&
    requiredSourceIdMissing.length === 0 &&
    forbiddenSourceIdHits.length === 0 &&
    requiredSourceTitleMissing.length === 0 &&
    forbiddenSourceTitleHits.length === 0 &&
    requiredLabScopeMissing.length === 0 &&
    forbiddenLabScopeHits.length === 0 &&
    requiredContentClassMissing.length === 0 &&
    forbiddenContentClassHits.length === 0 &&
    illegalContentClassHits.length === 0 &&
    metadataMissing.length === 0
  const ok = stageOk && knowledgeOk && promptOk && retrievalOk

  const failures = []
  if (!stageOk) failures.push(`stage:${stage}`)
  if (!knowledgeCountOk) failures.push(`knowledge-count:${knowledgeCount}`)
  if (!globalCountOk) failures.push(`global-count:${globalCount}`)
  if (requiredCitationMissing.length) failures.push(`missing-citations:${requiredCitationMissing.join(',')}`)
  if (forbiddenCitationHits.length) failures.push(`forbidden-citations:${forbiddenCitationHits.join(',')}`)
  if (requiredSourceIdMissing.length) failures.push(`missing-sources:${requiredSourceIdMissing.join(',')}`)
  if (forbiddenSourceIdHits.length) failures.push(`forbidden-sources:${forbiddenSourceIdHits.join(',')}`)
  if (requiredSourceTitleMissing.length) failures.push(`missing-source-titles:${requiredSourceTitleMissing.join(',')}`)
  if (forbiddenSourceTitleHits.length) failures.push(`forbidden-source-titles:${forbiddenSourceTitleHits.join(',')}`)
  if (requiredLabScopeMissing.length) failures.push(`missing-lab-scopes:${requiredLabScopeMissing.join(',')}`)
  if (forbiddenLabScopeHits.length) failures.push(`forbidden-lab-scopes:${forbiddenLabScopeHits.join(',')}`)
  if (requiredContentClassMissing.length) failures.push(`missing-classes:${requiredContentClassMissing.join(',')}`)
  if (forbiddenContentClassHits.length) failures.push(`forbidden-classes:${forbiddenContentClassHits.join(',')}`)
  if (illegalContentClassHits.length) failures.push(`illegal-classes:${illegalContentClassHits.join(',')}`)
  if (metadataMissing.length) failures.push(`metadata:${metadataMissing.join(',')}`)
  if (!promptOk) failures.push(`prompt:${promptPatternHits.join(',') || 'mismatch'}`)
  if (!retrievalOk) failures.push(`retrieval:${retrievalMissing.join(',')}`)

  return {
    id: testCase.id,
    labId: testCase.labId,
    stage,
    stageOk,
    reply,
    knowledge,
    knowledgeCount,
    globalCount,
    knowledgeOk,
    prompt,
    promptOk,
    promptPatternHits,
    forbiddenPromptHits,
    retrieval,
    retrievalOk,
    retrievalMissing,
    requiredCitationMissing,
    forbiddenCitationHits,
    requiredSourceIdMissing,
    forbiddenSourceIdHits,
    requiredSourceTitleMissing,
    forbiddenSourceTitleHits,
    requiredLabScopeMissing,
    forbiddenLabScopeHits,
    requiredContentClassMissing,
    forbiddenContentClassHits,
    illegalContentClassHits,
    metadataMissing,
    ok,
    failures,
  }
}

function ratio(numerator, denominator, emptyValue = 1) {
  return denominator ? numerator / denominator : emptyValue
}

export function summarizeRagHarness(results) {
  const knowledgeCases = results.length
  const knowledgeResults = results.filter((item) => item.knowledgeCount > 0)
  const knowledgeHits = results.filter((item) => item.knowledgeCount > 0)
  const promptHits = results.filter((item) => item.promptOk)
  const retrievalHits = results.filter((item) => item.retrievalOk)
  const stages = results.filter((item) => item.stageOk)
  const failures = results.filter((item) => !item.ok)
  return {
    ok: failures.length === 0,
    metrics: {
      cases: results.length,
      stageAccuracy: ratio(stages.length, results.length),
      knowledgeHitRate: ratio(knowledgeHits.length, knowledgeCases, 0),
      knowledgeCapRate: ratio(results.filter((item) => item.knowledgeOk).length, knowledgeCases),
      knowledgeMetadataRate: ratio(
        knowledgeResults.filter((item) => item.metadataMissing.length === 0).length,
        knowledgeResults.length,
      ),
      promptAlignmentRate: ratio(promptHits.length, results.length),
      retrievalAlignmentRate: ratio(retrievalHits.length, results.length),
      teacherLeakageRate: ratio(results.filter((item) => item.illegalContentClassHits.length > 0).length, results.length, 0),
    },
    failures,
  }
}

export async function runRagHarness(cases, adapter) {
  if (!Array.isArray(cases) || cases.length === 0) throw new TypeError('rag harness requires at least one case')
  if (typeof adapter !== 'function') throw new TypeError('rag harness adapter must be a function')
  const results = []
  for (const testCase of cases) {
    results.push(evaluateRagHarnessResult(testCase, await adapter(testCase)))
  }
  return summarizeRagHarness(results)
}

export async function loadRagHarnessCases(file) {
  const parsed = JSON.parse(await readFile(file, 'utf8'))
  if (!Array.isArray(parsed) || parsed.some((testCase) => !validateRagHarnessCase(testCase))) {
    throw new TypeError('rag harness fixture contains an invalid case')
  }
  return parsed
}
