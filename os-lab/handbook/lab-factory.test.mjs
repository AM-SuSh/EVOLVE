import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'

import { inspectLabPackage, listPublishedLabs, publishLabPackage, scaffoldDryRun, testLabPackage } from './lab-factory.mjs'
import { applyNext, getExerciseCatalog, resetLab } from '../scripts/scaffold.mjs'

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
  assert.deepEqual(dryRun.variants.map((item) => item.variant).sort(), ['debug', 'fill'])
  assert.equal(dryRun.variants.every((item) => item.fileCount > 0 && /^[a-f0-9]{64}$/.test(item.manifestHash)), true)
})

test('C6 every published variant source carries a file header task marker', async () => {
  for (const labId of ['lab2', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8']) {
    const inspected = await inspectLabPackage(labId, options)
    assert.equal(inspected.ok, true, `${labId}: ${inspected.errors?.join('\n')}`)
  }
})

test('C6 rejects undeclared Lab2 variants', async () => {
  const dryRun = await scaffoldDryRun('lab2', { ...options, variant: 'unknown' })
  assert.equal(dryRun.ok, false)
  assert.match(dryRun.errors.join('\n'), /未知变体: unknown/)

  const previousStudentsRoot = process.env.OS_LAB_STUDENTS_ROOT
  process.env.OS_LAB_STUDENTS_ROOT = path.join(temporary, 'rejected-variants-students')
  try {
    const teacher = { openLab: 'lab2', assignments: {} }
    assert.equal((await applyNext('rejected-variant-student', undefined, teacher)).lab, 'lab1')
    const rejected = await applyNext('rejected-variant-student', 'unknown', teacher)
    assert.equal(rejected.ok, false)
    assert.match(rejected.log.join('\n'), /不支持任务变体「unknown」/)
  } finally {
    if (previousStudentsRoot === undefined) delete process.env.OS_LAB_STUDENTS_ROOT
    else process.env.OS_LAB_STUDENTS_ROOT = previousStudentsRoot
  }
})

test('C6 reset restores the full workspace snapshot taken at issue time', async () => {
  const previousStudentsRoot = process.env.OS_LAB_STUDENTS_ROOT
  const previousCatalogPath = process.env.OS_LAB_FACTORY_CATALOG_PATH
  const studentsRoot = path.join(temporary, 'reset-students')
  process.env.OS_LAB_STUDENTS_ROOT = studentsRoot
  process.env.OS_LAB_FACTORY_CATALOG_PATH = path.join(repositoryRoot, 'lab-packages', 'published.json')
  try {
    const teacher = {
      openLab: 'lab3',
      assignments: { lab2: 'fill', lab3: 'debug' },
    }
    assert.equal((await applyNext('reset-student', undefined, teacher)).lab, 'lab1')
    assert.equal((await applyNext('reset-student', undefined, teacher)).lab, 'lab2')
    assert.equal((await applyNext('reset-student', undefined, teacher)).lab, 'lab3')

    const studentRoot = path.join(studentsRoot, 'reset-student')
    const taskPath = path.join(studentRoot, 'kernel', 'src', 'task.rs')
    const mmPath = path.join(studentRoot, 'kernel', 'src', 'mm.rs')
    const cargoPath = path.join(studentRoot, 'Cargo.toml')
    const taskBaseline = await readFile(taskPath, 'utf8')
    const mmBaseline = await readFile(mmPath, 'utf8')
    const cargoBaseline = await readFile(cargoPath, 'utf8')
    const extraPath = path.join(studentRoot, 'user', 'src', 'bin', 'after_lab3_extra.rs')
    await writeFile(taskPath, `${taskBaseline}\n// lab2 user edit\n`, 'utf8')
    await writeFile(mmPath, `${mmBaseline}\n// lab3 user edit\n`, 'utf8')
    await writeFile(cargoPath, cargoBaseline.replace('[workspace]', '# user edit\n[workspace]'), 'utf8')
    await writeFile(extraPath, '// added after lab3 was issued\n', 'utf8')

    const lab3Reset = await resetLab('reset-student', 'lab3')
    assert.equal(lab3Reset.ok, true, lab3Reset.log?.join('\n'))
    assert.equal(lab3Reset.snapshot, true)
    assert.equal(await readFile(taskPath, 'utf8'), taskBaseline)
    assert.equal(await readFile(mmPath, 'utf8'), mmBaseline)
    assert.equal(await readFile(cargoPath, 'utf8'), cargoBaseline)
    await assert.rejects(readFile(extraPath, 'utf8'))
    const stateAfterLab3Reset = JSON.parse(await readFile(path.join(studentRoot, '.scaffold-state.json'), 'utf8'))
    assert.deepEqual(stateAfterLab3Reset.applied, ['lab1', 'lab2', 'lab3'])

    await writeFile(taskPath, `${taskBaseline}\n// lab2 edit after lab3 reset\n`, 'utf8')
    const lab2Reset = await resetLab('reset-student', 'lab2')
    assert.equal(lab2Reset.ok, true, lab2Reset.log?.join('\n'))
    assert.equal(lab2Reset.snapshot, true)
    assert.equal(await readFile(taskPath, 'utf8'), taskBaseline)
    await assert.rejects(readFile(mmPath, 'utf8'))
    const stateAfterLab2Reset = JSON.parse(await readFile(path.join(studentRoot, '.scaffold-state.json'), 'utf8'))
    assert.deepEqual(stateAfterLab2Reset.applied, ['lab1', 'lab2'])
  } finally {
    if (previousStudentsRoot === undefined) delete process.env.OS_LAB_STUDENTS_ROOT
    else process.env.OS_LAB_STUDENTS_ROOT = previousStudentsRoot
    if (previousCatalogPath === undefined) delete process.env.OS_LAB_FACTORY_CATALOG_PATH
    else process.env.OS_LAB_FACTORY_CATALOG_PATH = previousCatalogPath
  }
})

test('C6 reset falls back to baseline restore when snapshot is missing', async () => {
  const previousStudentsRoot = process.env.OS_LAB_STUDENTS_ROOT
  const previousCatalogPath = process.env.OS_LAB_FACTORY_CATALOG_PATH
  const studentsRoot = path.join(temporary, 'fallback-reset-students')
  process.env.OS_LAB_STUDENTS_ROOT = studentsRoot
  process.env.OS_LAB_FACTORY_CATALOG_PATH = path.join(repositoryRoot, 'lab-packages', 'published.json')
  try {
    const teacher = { openLab: 'lab2', assignments: { lab2: 'fill' } }
    assert.equal((await applyNext('fallback-student', undefined, teacher)).lab, 'lab1')
    assert.equal((await applyNext('fallback-student', undefined, teacher)).lab, 'lab2')

    const studentRoot = path.join(studentsRoot, 'fallback-student')
    const taskPath = path.join(studentRoot, 'kernel', 'src', 'task.rs')
    const taskBaseline = await readFile(taskPath, 'utf8')
    await rm(path.join(studentsRoot, '.snapshots', 'fallback-student', 'lab2'), {
      recursive: true,
      force: true,
    })
    await writeFile(taskPath, `${taskBaseline}\n// should be reset\n`, 'utf8')

    const reset = await resetLab('fallback-student', 'lab2')
    assert.equal(reset.ok, true, reset.log?.join('\n'))
    assert.equal(reset.snapshot, false)
    assert.equal(await readFile(taskPath, 'utf8'), taskBaseline)
    const state = JSON.parse(await readFile(path.join(studentRoot, '.scaffold-state.json'), 'utf8'))
    assert.deepEqual(state.applied, ['lab1', 'lab2'])
  } finally {
    if (previousStudentsRoot === undefined) delete process.env.OS_LAB_STUDENTS_ROOT
    else process.env.OS_LAB_STUDENTS_ROOT = previousStudentsRoot
    if (previousCatalogPath === undefined) delete process.env.OS_LAB_FACTORY_CATALOG_PATH
    else process.env.OS_LAB_FACTORY_CATALOG_PATH = previousCatalogPath
  }
})

test('B+C sequentially issue every published Lab3-Lab8 debug variant with exact sources', async () => {
  const previousStudentsRoot = process.env.OS_LAB_STUDENTS_ROOT
  const previousCatalogPath = process.env.OS_LAB_FACTORY_CATALOG_PATH
  const studentsRoot = path.join(temporary, 'lab3-lab8-students')
  process.env.OS_LAB_STUDENTS_ROOT = studentsRoot
  process.env.OS_LAB_FACTORY_CATALOG_PATH = path.join(repositoryRoot, 'lab-packages', 'published.json')
  try {
    const teacher = {
      openLab: 'lab8',
      assignments: {
        lab2: 'fill',
        lab3: 'debug',
        lab4: 'debug',
        lab5: 'debug',
        lab6: 'debug',
        lab7: 'debug',
        lab8: 'debug',
      },
    }
    for (const expectedLab of ['lab1', 'lab2', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8']) {
      const issued = await applyNext('bc-alignment-student', undefined, teacher)
      assert.equal(issued.ok, true, issued.log?.join('\n'))
      assert.equal(issued.lab, expectedLab)
    }

    const studentRoot = path.join(studentsRoot, 'bc-alignment-student')
    const state = JSON.parse(await readFile(path.join(studentRoot, '.scaffold-state.json'), 'utf8'))
    assert.deepEqual(state.applied, ['lab1', 'lab2', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8'])
    for (const labId of ['lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8']) {
      assert.equal(state.variants[labId], 'debug')
    }

    const issuedSources = {
      lab3: 'kernel/src/mm.rs',
      lab4: 'kernel/src/process.rs',
      lab5: 'kernel/src/fs/embedded.rs',
      lab6: 'user/src/bin/link_test.rs',
      lab7: 'kernel/src/signal.rs',
      lab8: 'user/src/bin/lab8_integration_test.rs',
    }
    const catalog = getExerciseCatalog()
    for (const [labId, target] of Object.entries(issuedSources)) {
      const publishedSource = catalog[labId].variants.debug.sources[target]
      assert.ok(publishedSource, `${labId} debug source missing for ${target}`)
      assert.equal(
        await readFile(path.join(studentRoot, target), 'utf8'),
        await readFile(path.join(repositoryRoot, publishedSource), 'utf8'),
        `${labId} issued source differs from the published debug source`,
      )
    }
  } finally {
    if (previousStudentsRoot === undefined) delete process.env.OS_LAB_STUDENTS_ROOT
    else process.env.OS_LAB_STUDENTS_ROOT = previousStudentsRoot
    if (previousCatalogPath === undefined) delete process.env.OS_LAB_FACTORY_CATALOG_PATH
    else process.env.OS_LAB_FACTORY_CATALOG_PATH = previousCatalogPath
  }
})

test('C6 rebuilds disk-lab variants in the QEMU target without baseline user artifacts', async () => {
  let call = 0
  let baselineMarker
  const baselineOutput = [
    'file_test pass', 'Test link OK!', 'mmap_test pass', 'spawn_test pass',
    'stride_test pass', 'fs_test pass', 'pipe_test pass', 'All processes exited.',
  ].join('\n')
  const executor = async (_command, _args, commandOptions) => {
    call += 1
    assert.equal(commandOptions.env.CARGO_TARGET_DIR, path.join(commandOptions.cwd, 'target'))
    if (call === 1) {
      baselineMarker = path.join(commandOptions.cwd, 'target', 'user-apps', 'baseline-marker')
      await mkdir(path.dirname(baselineMarker), { recursive: true })
      await writeFile(baselineMarker, 'baseline artifact', 'utf8')
    }
    if (call === 4) await assert.rejects(readFile(baselineMarker, 'utf8'))
    if (call === 3) return { code: 0, output: baselineOutput }
    if (call === 6) return { code: 0, output: 'file_test pass\nAll processes exited.\n' }
    return { code: 0, output: '' }
  }

  const run = await testLabPackage('lab6', { ...options, variant: 'debug', executor, author: 'cache-test' })
  assert.equal(run.ok, true)
  assert.equal(run.negativeMatched, true)
  assert.equal(call, 6)
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
