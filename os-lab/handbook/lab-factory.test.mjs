import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'

import { inspectLabPackage, listPublishedLabs, publishLabPackage, scaffoldDryRun, testLabPackage } from './lab-factory.mjs'
import { applyNext, getExerciseCatalog } from '../scripts/scaffold.mjs'

const repositoryRoot = path.resolve(new URL('../', import.meta.url).pathname.slice(process.platform === 'win32' ? 1 : 0))
const temporary = await mkdtemp(path.join(os.tmpdir(), 'os-lab-factory-contract-'))
const releaseRoot = path.join(temporary, 'releases')
const runRoot = path.join(temporary, 'runs')
const options = {
  osLabRoot: repositoryRoot,
  packageRoot: path.join(repositoryRoot, 'lab-packages'),
  releaseRoot,
  runRoot,
  catalogPath: path.join(temporary, 'published.json'),
}

after(() => rm(temporary, { recursive: true, force: true }))

test('C6 validates frozen schema and materializes every declared Lab2 variant in a dry-run', async () => {
  const inspected = await inspectLabPackage('lab2', options)
  assert.equal(inspected.ok, true, inspected.errors?.join('\n'))
  const dryRun = await scaffoldDryRun('lab2', options)
  assert.equal(dryRun.ok, true)
  assert.deepEqual(dryRun.variants.map((item) => item.variant).sort(), ['debug', 'fill', 'remedial'])
  assert.equal(dryRun.variants.every((item) => item.fileCount > 0 && /^[a-f0-9]{64}$/.test(item.manifestHash)), true)
})

test('C6 requires an isolated passing test and explicit teacher approval for immutable publication', async () => {
  let call = 0
  const passingOutput = 'Hello from user app!\n409684505\nYield round\nYield round\nYield round\nYield round\nYield round\nAll user apps exited.\n'
  const executor = async () => {
    call += 1
    if (call === 4) return { code: 0, output: 'variant output intentionally misses trusted assertions' }
    return { code: 0, output: call === 2 ? passingOutput : '' }
  }
  const run = await testLabPackage('lab3', { ...options, variant: 'debug', executor, author: 'member-c-test' })
  assert.equal(run.ok, true)
  assert.equal(run.isolated, true)
  assert.equal(run.commands.length, 4)
  assert.equal(run.negativeMatched, true)

  const denied = await publishLabPackage('lab3', { testRunId: run.runId, approved: false }, options)
  assert.equal(denied.ok, false)
  const published = await publishLabPackage('lab3', {
    testRunId: run.runId,
    approved: true,
    approvalNote: '教学与工程检查通过，发布到测试班。',
    teacher: 'teacher-test',
    author: 'member-c-test',
  }, options)
  assert.equal(published.ok, true)
  const release = JSON.parse(await readFile(path.join(releaseRoot, 'lab3', run.version, 'release.json'), 'utf8'))
  assert.equal(release.author, 'member-c-test')
  assert.equal(release.test.status, 'passed')
  assert.equal(release.approval.teacher, 'teacher-test')
  const catalog = await listPublishedLabs(options)
  assert.equal(catalog.labs.lab3.variants.debug.files[0], 'kernel/src/mm.rs')
  assert.equal(catalog.labs.lab3.manual, 'labs/lab3-memory.md')
  const previousCatalogPath = process.env.OS_LAB_FACTORY_CATALOG_PATH
  process.env.OS_LAB_FACTORY_CATALOG_PATH = options.catalogPath
  assert.equal(getExerciseCatalog().lab3.variants.debug.sources['kernel/src/mm.rs'], 'scaffold/exercises/lab3/debug/kernel/src/mm.rs')
  const previousStudentsRoot = process.env.OS_LAB_STUDENTS_ROOT
  const studentsRoot = path.join(temporary, 'students')
  process.env.OS_LAB_STUDENTS_ROOT = studentsRoot
  try {
    const teacher = { openLab: 'lab3', assignments: {} }
    assert.equal((await applyNext('factory-student', undefined, teacher)).lab, 'lab1')
    assert.equal((await applyNext('factory-student', 'fill', teacher)).lab, 'lab2')
    const issued = await applyNext('factory-student', 'debug', teacher)
    assert.equal(issued.ok, true)
    assert.equal(issued.lab, 'lab3')
    const state = JSON.parse(await readFile(path.join(studentsRoot, 'factory-student', '.scaffold-state.json'), 'utf8'))
    assert.equal(state.variants.lab3, 'debug')
    assert.match(
      await readFile(path.join(studentsRoot, 'factory-student', 'kernel', 'src', 'mm.rs'), 'utf8'),
      /PLANTED BUG: preserve R\/W\/X but strip U/,
    )
  } finally {
    if (previousStudentsRoot === undefined) delete process.env.OS_LAB_STUDENTS_ROOT
    else process.env.OS_LAB_STUDENTS_ROOT = previousStudentsRoot
    if (previousCatalogPath === undefined) delete process.env.OS_LAB_FACTORY_CATALOG_PATH
    else process.env.OS_LAB_FACTORY_CATALOG_PATH = previousCatalogPath
  }

  const overwrite = await publishLabPackage('lab3', {
    testRunId: run.runId, approved: true, approvalNote: '再次发布', teacher: 'teacher-test',
  }, options)
  assert.equal(overwrite.ok, false)
  assert.match(overwrite.error, /不允许覆盖/)
})

test('C6 failed isolated test cannot become a release credential', async () => {
  const failed = await testLabPackage('lab3', {
    ...options,
    variant: 'debug',
    executor: async () => ({ code: 1, output: 'compile failed' }),
  })
  assert.equal(failed.ok, false)
  const result = await publishLabPackage('lab3', {
    testRunId: failed.runId, approved: true, approvalNote: '不应发布', teacher: 'teacher-test',
  }, { ...options, releaseRoot: path.join(temporary, 'failed-releases') })
  assert.equal(result.ok, false)
  assert.match(result.error, /未通过/)
})
