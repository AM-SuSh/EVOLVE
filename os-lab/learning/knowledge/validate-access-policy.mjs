import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sources = JSON.parse(await readFile(path.join(here, 'sources.json'), 'utf8'))
const policy = JSON.parse(await readFile(path.join(here, 'access-policy.json'), 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(policy.schemaVersion === 1, 'policy schemaVersion must be 1')
assert(typeof policy.policyVersion === 'string' && policy.policyVersion.length > 0, 'policyVersion is required')

const sourceIds = new Set(sources.sources.map((source) => source.id))
const classIds = new Set(Object.keys(policy.contentClasses || {}))
const bindings = Array.isArray(policy.sourceBindings) ? policy.sourceBindings : []
const boundIds = new Set()

assert(classIds.has('student-safe'), 'student-safe class is required')
assert(classIds.has('guided-hint'), 'guided-hint class is required')
assert(classIds.has('teacher-only'), 'teacher-only class is required')
assert(classIds.has('system-metadata'), 'system-metadata class is required')

for (const binding of bindings) {
  assert(sourceIds.has(binding.sourceId), `unknown source binding: ${binding.sourceId}`)
  assert(!boundIds.has(binding.sourceId), `duplicate source binding: ${binding.sourceId}`)
  boundIds.add(binding.sourceId)
  assert(classIds.has(binding.defaultClass), `unknown defaultClass for ${binding.sourceId}`)
  assert(Number.isInteger(binding.authorityRank), `authorityRank must be an integer for ${binding.sourceId}`)
  for (const override of binding.pathOverrides || []) {
    assert(typeof override.pattern === 'string' && override.pattern.length > 0, `invalid path override for ${binding.sourceId}`)
    assert(classIds.has(override.contentClass), `unknown override class for ${binding.sourceId}`)
  }
}

assert(boundIds.size === sourceIds.size, `every selected source must have one binding: ${boundIds.size}/${sourceIds.size}`)

const tutorClasses = new Set(policy.retrievalRules?.tutor?.allowedClasses || [])
assert(tutorClasses.has('student-safe'), 'Tutor must allow student-safe content')
assert(tutorClasses.has('guided-hint'), 'Tutor must allow guided-hint content')
assert(!tutorClasses.has('teacher-only'), 'Tutor must not allow teacher-only content')
assert(!tutorClasses.has('system-metadata'), 'Tutor full-text retrieval must not allow system metadata')

for (const classId of tutorClasses) {
  assert(policy.contentClasses[classId].retrievableBy.includes('tutor'), `Tutor class is not retrievable: ${classId}`)
}

assert(Array.isArray(policy.hardDenyPaths) && policy.hardDenyPaths.length >= 5, 'hardDenyPaths must cover sensitive repositories')
assert(policy.teacherUploads?.defaultClass === 'teacher-only', 'teacher uploads must default to teacher-only')
assert(policy.teacherUploads?.defaultStatus === 'pending-review', 'teacher uploads must default to pending-review')
assert(policy.teacherUploads?.indexOnlyWhenStatus === 'published', 'only published teacher uploads may be indexed')

const authorityIds = new Set(policy.authorityOrder || [])
for (const sourceId of sourceIds) {
  if (sourceId === 'platform-published-catalog') continue
  assert(authorityIds.has(sourceId), `source missing from authorityOrder: ${sourceId}`)
}

console.log(JSON.stringify({
  ok: true,
  policyVersion: policy.policyVersion,
  contentClasses: classIds.size,
  sourceBindings: bindings.length,
  hardDenyPaths: policy.hardDenyPaths.length,
  tutorAllowedClasses: [...tutorClasses],
  teacherUploadDefault: `${policy.teacherUploads.defaultStatus}/${policy.teacherUploads.defaultClass}`,
}, null, 2))

