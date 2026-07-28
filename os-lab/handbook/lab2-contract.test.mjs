import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { parse } from 'yaml'

import { getRunRecipeContract } from '../tutor/run-recipes.mjs'

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
