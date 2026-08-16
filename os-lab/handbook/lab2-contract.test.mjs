import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { parse } from 'yaml'

import { getRunRecipe, getRunRecipeContract } from '../tutor/run-recipes.mjs'

const handbookRoot = new URL('.', import.meta.url)
const schemaRoot = new URL('../tutor/schema/', handbookRoot)

function readJson(relativeUrl) {
  return JSON.parse(fs.readFileSync(relativeUrl, 'utf8'))
}

function resolveSpecReference(specUrl, reference) {
  const [file] = reference.split('#', 1)
  return new URL(file, specUrl)
}

test('Lab2 spec and trusted runtime recipe stay aligned', () => {
  const specPath = new URL('../lab-packages/lab2/lab.yaml', import.meta.url)
  const spec = parse(fs.readFileSync(specPath, 'utf8'))
  const runtime = getRunRecipeContract('lab2')

  assert.ok(runtime)
  assert.equal(spec.verification.recipe, runtime.recipeId)
  assert.deepEqual(
    spec.verification.assertions.map((assertion) => assertion.id),
    runtime.outputAssertionIds,
  )
  assert.deepEqual(spec.verification.observable_trace, runtime.traceTypes)
})

test('Lab3-Lab8 specs and trusted runtime recipes require trace evidence', () => {
  for (let index = 3; index <= 8; index += 1) {
    const labId = `lab${index}`
    const specPath = new URL(`../lab-packages/${labId}/lab.yaml`, import.meta.url)
    const spec = parse(fs.readFileSync(specPath, 'utf8'))
    const runtime = getRunRecipeContract(labId)
    const recipe = getRunRecipe(labId)

    assert.ok(runtime, labId)
    assert.equal(spec.schema_version, 2, labId)
    assert.equal(spec.verification.recipe, runtime.recipeId, labId)
    assert.ok(spec.verification.command_with_trace, labId)
    assert.deepEqual(spec.verification.observable_trace, runtime.traceTypes, labId)
    assert.ok(runtime.traceTypes.length > 0, labId)
    assert.ok(recipe.steps.some((step) => step.args.some((arg) => String(arg).includes('trace-edu'))), labId)
  }
})

test('Trace v2 extends event types without mutating the frozen Trace v1 schema', () => {
  const v1 = readJson(new URL('trace-v1.schema.json', schemaRoot))
  const v2 = readJson(new URL('trace-v2.schema.json', schemaRoot))
  assert.equal(v1.properties.v.const, 1)
  assert.deepEqual(v1.properties.type.enum, ['trap_enter', 'task_switch'])
  assert.equal(v2.properties.v.const, 2)
  assert.deepEqual(v2.properties.type.enum, ['trap_enter', 'task_switch', 'syscall', 'address_space'])
})

test('M0 freezes the four public contracts and all Lab2 references resolve', () => {
  const baseline = readJson(new URL('m0-contract-baseline-v1.json', schemaRoot))
  assert.equal(baseline.status, 'frozen')
  assert.deepEqual(Object.keys(baseline.contracts).sort(), [
    'labSpec',
    'learningEvent',
    'runResult',
    'teachingTrace',
  ])

  const expected = {
    labSpec: ['lab-spec-v1.schema.json', 1, 'schema_version'],
    learningEvent: ['event-v2.schema.json', 2, 'version'],
    runResult: ['run-result-v1.schema.json', 1, 'version'],
    teachingTrace: ['trace-v1.schema.json', 1, 'v'],
  }
  for (const [name, [file, version, versionField]] of Object.entries(expected)) {
    const contract = baseline.contracts[name]
    assert.equal(contract.schema, file)
    assert.equal(contract.version, version)
    const schema = readJson(new URL(file, schemaRoot))
    assert.equal(schema.$id, `https://os-lab.local/schema/${file}`)
    assert.equal(schema.properties[versionField].const, version)
  }

  const specPath = new URL('../lab-packages/lab2/lab.yaml', import.meta.url)
  const spec = parse(fs.readFileSync(specPath, 'utf8'))
  assert.equal(spec.schema_version, 1)
  assert.equal(spec.version, '1.0.0')
  assert.equal(spec.status, 'stable')

  const references = [
    spec.manual,
    spec.answers,
    spec.tutor_context,
    spec.rubric_ref,
    spec.mock_traces_ref,
    ...spec.knowledge.map((item) => item.concept_ref),
    ...Object.values(spec.variants).flatMap((variant) => [variant.manifest, variant.source]),
  ]
  for (const reference of references) {
    assert.equal(fs.existsSync(resolveSpecReference(specPath, reference)), true, reference)
  }
})
