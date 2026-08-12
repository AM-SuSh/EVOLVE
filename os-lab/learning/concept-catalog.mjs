import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const osLabRoot = path.resolve(here, '..')
const labPackagesRoot = path.join(osLabRoot, 'lab-packages')
const requireFromHandbook = createRequire(path.join(osLabRoot, 'handbook', 'package.json'))
const { parse: parseYaml, parseAllDocuments } = requireFromHandbook('yaml')

export const CATALOG_LABS = Object.freeze(Array.from({ length: 8 }, (_, index) => `lab${index + 1}`))

function array(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value]
}

function strings(value) {
  return array(value).map((item) => String(item || '').trim()).filter(Boolean)
}

function readYaml(file) {
  return parseYaml(readFileSync(file, 'utf8')) || {}
}

function conceptDocuments(file) {
  if (!existsSync(file)) return []
  const documents = parseAllDocuments(readFileSync(file, 'utf8'))
  return documents.flatMap((document) => {
    if (document.errors.length) throw document.errors[0]
    const value = document.toJS() || {}
    return Array.isArray(value.concepts) ? value.concepts : [value]
  })
}

function conceptDetails(raw = {}) {
  const layers = raw.layers || {}
  return {
    title: String(raw.title || raw.id || '').trim(),
    level: String(raw.level || '').trim(),
    summary: String(raw.summary || layers.course_concept || '').trim(),
    sourceAnchors: strings(raw.source_anchors || layers.project_impl),
    invariants: strings(raw.invariants),
    observableEvidence: strings(raw.observable_evidence || layers.observable_evidence),
    transfer: strings(raw.transfer || layers.transfer),
    misconceptions: [
      ...array(raw.common_mistakes).map((item, index) => ({
        id: `common-mistake-${index + 1}`,
        statement: String(item || '').trim(),
        counter: '',
      })),
      ...array(raw.relations?.commonly_confused_with).map((item, index) => ({
        id: String(item?.id || `commonly-confused-${index + 1}`).trim(),
        statement: String(item?.statement || item?.note || '').trim(),
        counter: String(item?.counter || '').trim(),
      })),
    ].filter((item) => item.id && (item.statement || item.counter)),
  }
}

function loadLabCatalog(labId) {
  const root = path.join(labPackagesRoot, labId)
  const specFile = path.join(root, 'lab.yaml')
  if (!existsSync(specFile)) throw new Error(`${labId} 缺少 lab-packages/${labId}/lab.yaml`)
  const spec = readYaml(specFile)
  const checkpointsFile = path.join(root, 'checkpoints.yaml')
  const checkpointsSpec = existsSync(checkpointsFile) ? readYaml(checkpointsFile) : {}
  const assertions = array(spec.verification?.assertions)
  const labMisconceptions = array(spec.misconceptions).map((item, index) => ({
    id: String(item?.id || `lab-misconception-${index + 1}`).trim(),
    statement: String(item?.statement || '').trim(),
    counter: String(item?.counter || '').trim(),
  })).filter((item) => item.id)

  const concepts = array(spec.knowledge).map((entry) => {
    const conceptId = String(entry?.id || '').trim()
    const [relativeFile] = String(entry?.concept_ref || '').split('#')
    const documents = relativeFile ? conceptDocuments(path.resolve(root, relativeFile)) : []
    const raw = documents.find((item) => String(item?.id || '').trim() === conceptId) || {}
    const details = conceptDetails(raw)
    const assertionIds = assertions
      .filter((assertion) => strings(assertion?.assesses).includes(conceptId))
      .map((assertion) => String(assertion.id || '').trim())
      .filter(Boolean)
    return {
      conceptId,
      labId,
      title: details.title || conceptId,
      level: String(entry?.level || details.level || 'concept'),
      summary: details.summary,
      sourceAnchors: details.sourceAnchors,
      invariants: details.invariants,
      observableEvidence: details.observableEvidence,
      transfer: details.transfer,
      assertionIds,
      misconceptions: [...details.misconceptions, ...labMisconceptions],
      passCriteria: {
        requiresExplanation: true,
        requiresTrustedRun: assertionIds.length > 0,
        requiresTransfer: false,
      },
    }
  }).filter((concept) => concept.conceptId)

  return {
    labId,
    title: String(spec.title || labId.toUpperCase()),
    recipeId: String(spec.verification?.recipe || ''),
    concepts,
    conceptIds: concepts.map((concept) => concept.conceptId),
    assertions: assertions.map((assertion) => ({
      id: String(assertion?.id || '').trim(),
      assesses: strings(assertion?.assesses),
      text: String(assertion?.text || '').trim(),
    })).filter((assertion) => assertion.id),
    checkpoints: array(checkpointsSpec.checkpoints).map((checkpoint) => ({
      id: String(checkpoint?.id || '').trim(),
      stage: String(checkpoint?.stage || '').trim(),
      prompt: String(checkpoint?.prompt || checkpoint?.question || '').trim(),
      passWhen: String(checkpoint?.pass_when || '').trim(),
    })).filter((checkpoint) => checkpoint.id),
    transferPrompts: array(checkpointsSpec.transfer_items)
      .map((item) => String(item?.prompt || '').trim())
      .filter(Boolean),
    misconceptions: labMisconceptions,
  }
}

let cachedCatalog = null

export function loadConceptCatalog(options = {}) {
  if (cachedCatalog && options.fresh !== true) return cachedCatalog
  const labs = Object.fromEntries(CATALOG_LABS.map((labId) => [labId, loadLabCatalog(labId)]))
  const concepts = Object.fromEntries(
    Object.values(labs).flatMap((lab) => lab.concepts.map((concept) => [concept.conceptId, concept])),
  )
  cachedCatalog = Object.freeze({ version: 'concept-catalog-v1', labs, concepts })
  return cachedCatalog
}

export function conceptsForLab(labId) {
  return loadConceptCatalog().labs[labId]?.concepts || []
}

export function conceptForLab(labId, conceptId) {
  const concept = loadConceptCatalog().concepts[conceptId]
  return concept?.labId === labId ? concept : null
}

