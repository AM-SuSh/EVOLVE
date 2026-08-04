import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

import { collectTraceEvents } from '../tutor/contracts.mjs'
import { getRunRecipe } from '../tutor/run-recipes.mjs'

const handbookRoot = path.dirname(fileURLToPath(import.meta.url))
const defaultOsLabRoot = path.resolve(handbookRoot, '..')
const defaultPackageRoot = path.join(defaultOsLabRoot, 'lab-packages')
const defaultReleaseRoot = path.join(defaultPackageRoot, 'releases')
const defaultRunRoot = path.join(defaultOsLabRoot, 'learning', 'factory-runs')

/** 与 tutor-server 一致：未 activate 时仍能找到本机 cargo / qemu。 */
const TOOL_BIN_DIRS = [
  process.env.CARGO_HOME ? path.join(process.env.CARGO_HOME, 'bin') : '',
  'D:\\AppGallery\\Rust\\cargo\\bin',
  'D:\\Rust\\cargo\\bin',
  path.join(process.env.USERPROFILE || os.homedir() || '', '.cargo', 'bin'),
  process.env.OS_LAB_QEMU_DIR || '',
  'D:\\AppGallery\\QEMU',
  'D:\\QEMU',
].filter(Boolean)

const resolvedBinCache = new Map()

function enrichFactoryEnv(baseEnv = process.env) {
  const env = { ...baseEnv }
  // 与 resolve 到的 cargo 对齐，避免进程继承错误的 CARGO_HOME/RUSTUP_HOME。
  if (existsSync('D:\\AppGallery\\Rust\\cargo\\bin\\cargo.exe')) {
    env.CARGO_HOME = 'D:\\AppGallery\\Rust\\cargo'
    env.RUSTUP_HOME = 'D:\\AppGallery\\Rust\\rustup'
  } else if (existsSync('D:\\Rust\\cargo\\bin\\cargo.exe')) {
    env.CARGO_HOME = 'D:\\Rust\\cargo'
    env.RUSTUP_HOME = 'D:\\Rust\\rustup'
  } else if (!env.CARGO_HOME) {
    const homeCargo = path.join(process.env.USERPROFILE || os.homedir() || '', '.cargo')
    if (existsSync(path.join(homeCargo, 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo'))) {
      env.CARGO_HOME = homeCargo
    }
  }
  const extra = TOOL_BIN_DIRS.filter((dir) => Boolean(dir) && existsSync(dir))
  if (extra.length) {
    const merged = [...extra, env.Path || env.PATH || ''].join(path.delimiter)
    env.Path = merged
    env.PATH = merged
  }
  return env
}

function resolveToolBin(cmd) {
  if (resolvedBinCache.has(cmd)) return resolvedBinCache.get(cmd)
  const bare = String(cmd || '').replace(/\.exe$/i, '')
  const exe = process.platform === 'win32' ? `${bare}.exe` : bare
  const pathDirs = `${process.env.Path || process.env.PATH || ''}`.split(path.delimiter)
  for (const dir of [...TOOL_BIN_DIRS, ...pathDirs]) {
    if (!dir) continue
    const candidate = path.join(dir, exe)
    if (existsSync(candidate)) {
      resolvedBinCache.set(cmd, candidate)
      return candidate
    }
  }
  resolvedBinCache.set(cmd, cmd)
  return cmd
}

function roots(options = {}) {
  const osLabRoot = path.resolve(options.osLabRoot || process.env.OS_LAB_FACTORY_OS_ROOT || defaultOsLabRoot)
  const packageRoot = path.resolve(options.packageRoot || process.env.OS_LAB_FACTORY_PACKAGE_ROOT || path.join(osLabRoot, 'lab-packages'))
  return {
    osLabRoot,
    packageRoot,
    schemaPath: path.resolve(options.schemaPath || path.join(osLabRoot, 'tutor', 'schema', 'lab-spec-v1.schema.json')),
    releaseRoot: path.resolve(options.releaseRoot || process.env.OS_LAB_FACTORY_RELEASE_ROOT || path.join(packageRoot, 'releases')),
    runRoot: path.resolve(options.runRoot || process.env.OS_LAB_FACTORY_DATA_DIR || defaultRunRoot),
    catalogPath: path.resolve(options.catalogPath || process.env.OS_LAB_FACTORY_CATALOG_PATH || path.join(packageRoot, 'published.json')),
  }
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex')
}

function resolvePointer(schema, ref) {
  return ref.slice(2).split('/').reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], schema)
}

function validateNode(value, rule, schema, location, errors) {
  if (rule.$ref) return validateNode(value, resolvePointer(schema, rule.$ref), schema, location, errors)
  if ('const' in rule && value !== rule.const) errors.push(`${location}: 必须等于 ${JSON.stringify(rule.const)}`)
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${location}: 必须是 ${rule.enum.join(' / ')}`)
  const typeOk = !rule.type ||
    (rule.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) ||
    (rule.type === 'array' && Array.isArray(value)) ||
    (rule.type === 'string' && typeof value === 'string') ||
    (rule.type === 'integer' && Number.isInteger(value))
  if (!typeOk) {
    errors.push(`${location}: 类型必须为 ${rule.type}`)
    return
  }
  if (typeof value === 'string') {
    if (rule.minLength && value.length < rule.minLength) errors.push(`${location}: 内容过短`)
    if (rule.maxLength && value.length > rule.maxLength) errors.push(`${location}: 内容过长`)
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${location}: 格式不符合 ${rule.pattern}`)
  }
  if (Array.isArray(value)) {
    if (rule.minItems && value.length < rule.minItems) errors.push(`${location}: 至少需要 ${rule.minItems} 项`)
    if (rule.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${location}: 不允许重复项`)
    if (rule.items) value.forEach((item, index) => validateNode(item, rule.items, schema, `${location}[${index}]`, errors))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of rule.required || []) if (!(key in value)) errors.push(`${location}.${key}: 缺少必填字段`)
    const properties = rule.properties || {}
    if (rule.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in properties)) errors.push(`${location}.${key}: schema 不允许该字段`)
    }
    if (rule.minProperties && Object.keys(value).length < rule.minProperties) errors.push(`${location}: 字段数量不足`)
    for (const [key, child] of Object.entries(value)) {
      const childRule = properties[key] || (typeof rule.additionalProperties === 'object' ? rule.additionalProperties : null)
      if (childRule) validateNode(child, childRule, schema, `${location}.${key}`, errors)
    }
  }
}

function referencedPaths(spec) {
  return [
    ['manual', spec.manual],
    ['answers', spec.answers],
    ['tutor_context', spec.tutor_context],
    ['rubric_ref', spec.rubric_ref],
    ['mock_traces_ref', spec.mock_traces_ref],
    ...(spec.knowledge || []).map((item, index) => [`knowledge[${index}].concept_ref`, item.concept_ref]),
    ...Object.entries(spec.variants || {}).flatMap(([name, item]) => [
      [`variants.${name}.manifest`, item.manifest],
      [`variants.${name}.source`, item.source],
    ]),
  ].filter(([, value]) => value)
}

async function exists(target) {
  try { await stat(target); return true } catch { return false }
}

export async function inspectLabPackage(labId, options = {}) {
  const config = roots(options)
  const safeLabId = /^lab[1-8]$/.test(String(labId || '')) ? String(labId) : ''
  if (!safeLabId) return { ok: false, errors: ['labId: 必须是 lab1-lab8'] }
  const specPath = path.join(config.packageRoot, safeLabId, 'lab.yaml')
  let raw
  let spec
  let schema
  try {
    [raw, schema] = await Promise.all([readFile(specPath, 'utf8'), readFile(config.schemaPath, 'utf8').then(JSON.parse)])
    spec = parseYaml(raw)
  } catch (error) {
    return { ok: false, labId: safeLabId, errors: [`读取 Lab 包失败: ${error.message}`] }
  }
  const errors = []
  validateNode(spec, schema, schema, '$', errors)
  if (spec.id !== safeLabId) errors.push(`$.id: 目录 ${safeLabId} 与声明 ${spec.id} 不一致`)
  const specDir = path.dirname(specPath)
  for (const [field, relative] of referencedPaths(spec)) {
    const clean = String(relative).split('#')[0]
    const resolved = path.resolve(specDir, clean)
    if (resolved !== config.osLabRoot && !resolved.startsWith(`${config.osLabRoot}${path.sep}`)) {
      errors.push(`$.${field}: 引用越出 os-lab 根目录`)
    } else if (!(await exists(resolved))) {
      errors.push(`$.${field}: 引用不存在 (${relative})`)
    }
  }
  const recipe = getRunRecipe(safeLabId)
  if (!recipe || recipe.id !== spec.verification?.recipe) errors.push('$.verification.recipe: 与服务端可信 recipe 不一致')
  const assertionIds = new Set((spec.verification?.assertions || []).map((item) => item.id))
  for (const item of spec.verification?.negative_assertions || []) {
    if (assertionIds.has(item.id)) errors.push(`$.verification.negative_assertions: ${item.id} 与正向断言重复`)
  }
  return { ok: errors.length === 0, labId: safeLabId, version: spec.version, specHash: hashText(raw), specPath, spec, errors }
}

async function copySource(source, target) {
  const info = await stat(source)
  await mkdir(path.dirname(target), { recursive: true })
  await cp(source, target, { recursive: info.isDirectory(), force: true })
}

async function collectFiles(root, current = root, result = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name)
    if (entry.isDirectory()) await collectFiles(root, target, result)
    else if (entry.isFile()) result.push(target)
  }
  return result
}

export async function scaffoldDryRun(labId, options = {}) {
  const inspected = await inspectLabPackage(labId, options)
  if (!inspected.ok) return { ...inspected, stage: 'schema' }
  const config = roots(options)
  const temporary = await mkdtemp(path.join(options.tempRoot || os.tmpdir(), 'os-lab-factory-dry-'))
  try {
    const variantNames = options.variant ? [options.variant] : Object.keys(inspected.spec.variants)
    const variants = []
    for (const variant of variantNames) {
      if (!inspected.spec.variants[variant]) return { ok: false, stage: 'dry-run', errors: [`未知变体: ${variant}`] }
      const workspace = path.join(temporary, variant)
      for (const relative of inspected.spec.starter_files.added) {
        const clean = relative.replace(/[\\/]$/, '')
        await copySource(path.join(config.osLabRoot, clean), path.join(workspace, clean))
      }
      const targets = inspected.spec.starter_files.editable_by_variant[variant] || []
      if (targets.length !== 1) return { ok: false, stage: 'dry-run', errors: [`${variant}: 当前发布器要求一个明确的变体目标文件`] }
      const source = path.resolve(path.dirname(inspected.specPath), inspected.spec.variants[variant].source)
      await copySource(source, path.join(workspace, targets[0]))
      for (const generated of inspected.spec.starter_files.generated) {
        const target = path.join(workspace, generated)
        if (!(await exists(target))) {
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, `# generated by lab factory for ${inspected.labId}\n`, 'utf8')
        }
      }
      const files = await collectFiles(workspace)
      variants.push({
        variant,
        target: targets[0],
        fileCount: files.length,
        manifestHash: hashText((await Promise.all(files.sort().map(async (file) => `${path.relative(workspace, file).replaceAll('\\', '/')}:${hashText(await readFile(file))}`))).join('\n')),
      })
    }
    return { ok: true, stage: 'dry-run', labId: inspected.labId, version: inspected.version, specHash: inspected.specHash, variants }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const bin = resolveToolBin(command)
    const env = enrichFactoryEnv(options.env || process.env)
    if (!existsSync(bin)) {
      resolve({
        code: -1,
        output: `找不到可执行文件 ${command}（解析为 ${bin}）。已搜索: ${TOOL_BIN_DIRS.join(' | ') || '（无）'}。请确认本机已安装 Rust，并重启 npm run tutor。`,
      })
      return
    }
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    const append = (chunk) => { if (output.length < 200_000) output += chunk.toString('utf8').slice(0, 200_000 - output.length) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs || 300_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, output: `spawn ${bin}: ${error.message}` })
    })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, output }) })
  })
}

function evaluateSpecAssertions(spec, output) {
  const text = String(output || '')
  const traces = collectTraceEvents(text)
  return (spec.verification.assertions || []).map((assertion) => {
    let passed = false
    if (assertion.kind === 'output-contains') passed = text.includes(assertion.text)
    if (assertion.kind === 'output-count') passed = text.split(assertion.text).length - 1 >= Number(assertion.min || 1)
    if (assertion.kind === 'trace-present') passed = traces.some((event) => event.type === assertion.text)
    return { id: assertion.id, passed }
  })
}

async function copyIsolatedWorkspace(source, target) {
  const excluded = new Set(['target', 'node_modules', '.vitepress', 'sessions', 'factory-runs', 'releases'])
  await cp(source, target, {
    recursive: true,
    filter: (item) => !item.split(path.sep).some((part) => excluded.has(part)) && !/\.db(?:-journal)?$/.test(item),
  })
}

export async function testLabPackage(labId, options = {}) {
  const dryRun = await scaffoldDryRun(labId, options)
  if (!dryRun.ok) return dryRun
  const inspected = await inspectLabPackage(labId, options)
  const variant = options.variant || Object.keys(inspected.spec.variants)[0]
  if (!inspected.spec.variants[variant]) return { ok: false, stage: 'test', errors: [`未知变体: ${variant}`] }
  const config = roots(options)
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const temporary = await mkdtemp(path.join(options.tempRoot || os.tmpdir(), 'os-lab-factory-test-'))
  const workspace = path.join(temporary, 'workspace')
  const execute = options.executor || runCommand
  let commands = []
  let baselineAssertions = []
  let variantAssertions = []
  try {
    await copyIsolatedWorkspace(config.osLabRoot, workspace)
    const recipe = getRunRecipe(inspected.labId)
    const usesWorkspaceTarget = recipe.steps.some((step) => step.cmd === 'qemu-system-riscv64')
    const runPhase = async (phase) => {
      const phaseTarget = usesWorkspaceTarget
        ? path.join(workspace, 'target')
        : path.join(temporary, `${phase}-target`)
      const commandOptions = { cwd: workspace, timeoutMs: options.timeoutMs, env: { ...process.env, CARGO_TARGET_DIR: phaseTarget } }
      const buildArgs = ['check', '-p', 'kernel', '--features', inspected.spec.feature, '--release', '--target-dir', phaseTarget]
      const build = await execute(process.platform === 'win32' ? 'cargo.exe' : 'cargo', buildArgs, commandOptions)
      commands.push({ kind: `${phase}-build`, command: `cargo ${buildArgs.join(' ')}`, exitCode: build.code, outputHash: hashText(build.output || ''), outputTail: String(build.output || '').slice(-4000) })
      let output = ''
      if (build.code === 0) {
        for (const step of recipe.steps) {
          const result = await execute(step.cmd, step.args, commandOptions)
          output += result.output || ''
          commands.push({ kind: `${phase}-trusted-test`, command: `${step.cmd} ${step.args.join(' ')}`, exitCode: result.code, outputHash: hashText(result.output || ''), outputTail: String(result.output || '').slice(-4000) })
          if (result.code !== 0) break
        }
      }
      return { build, output, assertions: evaluateSpecAssertions(inspected.spec, output) }
    }
    const baseline = await runPhase('baseline')
    baselineAssertions = baseline.assertions

    const target = inspected.spec.starter_files.editable_by_variant[variant]?.[0]
    if (!target) throw new Error(`${variant} 没有声明可编辑目标`)
    const source = path.resolve(path.dirname(inspected.specPath), inspected.spec.variants[variant].source)
    await copySource(source, path.join(workspace, target))
    // kernel/build.rs keeps user binaries and disk images under workspace/target.
    // Remove all baseline artifacts before compiling the planted variant.
    await rm(path.join(workspace, 'target'), { recursive: true, force: true })
    const variantResult = await runPhase('variant')
    variantAssertions = variantResult.assertions
  } catch (error) {
    commands.push({ kind: 'factory', command: 'prepare isolated workspace', exitCode: -1, outputHash: hashText(error.message), outputTail: error.message })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  const baselineCommands = commands.filter((item) => item.kind.startsWith('baseline-'))
  const variantCommands = commands.filter((item) => item.kind.startsWith('variant-'))
  const baselinePassed = baselineCommands.length >= 2 && baselineCommands.every((item) => item.exitCode === 0) && baselineAssertions.length > 0 && baselineAssertions.every((item) => item.passed)
  const variantBuildPassed = variantCommands.some((item) => item.kind === 'variant-build' && item.exitCode === 0)
  const failedAssertionIds = new Set(variantAssertions.filter((item) => !item.passed).map((item) => item.id))
  const manifestPath = path.resolve(path.dirname(inspected.specPath), inspected.spec.variants[variant].manifest)
  const manifest = parseYaml(await readFile(manifestPath, 'utf8'))
  const negativeMatched = (manifest.negative_tests || []).some((item) =>
    (item.expect_fail === true && failedAssertionIds.size > 0) ||
    (item.expect_fail_assertions || []).some((id) => failedAssertionIds.has(id)),
  )
  const passed = baselinePassed && variantBuildPassed && negativeMatched
  const record = {
    runId, labId: inspected.labId, version: inspected.version, variant, specHash: inspected.specHash,
    status: passed ? 'passed' : 'failed', isolated: true, commands, baselineAssertions, variantAssertions,
    negativeMatched, startedAt, finishedAt: new Date().toISOString(),
    author: String(options.author || ''),
  }
  await mkdir(config.runRoot, { recursive: true })
  await writeFile(path.join(config.runRoot, `${runId}.json`), `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return { ok: passed, stage: 'test', ...record }
}

async function variantCatalog(spec, specPath, osLabRoot) {
  const variants = {}
  for (const [name, variant] of Object.entries(spec.variants)) {
    const manifestPath = path.resolve(path.dirname(specPath), variant.manifest)
    const manifest = parseYaml(await readFile(manifestPath, 'utf8'))
    const targets = spec.starter_files.editable_by_variant[name] || []
    variants[name] = {
      label: String(manifest.learning_goal || manifest.id || name).trim().split(/\r?\n/)[0].slice(0, 160),
      files: targets,
      sources: Object.fromEntries(targets.map((target) => [target, path.relative(osLabRoot, path.resolve(path.dirname(specPath), variant.source)).replaceAll('\\', '/')])),
      manifest: path.relative(osLabRoot, manifestPath).replaceAll('\\', '/'),
    }
  }
  return variants
}

function catalogReference(specPath, reference, osLabRoot) {
  return path.relative(osLabRoot, path.resolve(path.dirname(specPath), String(reference).split('#')[0])).replaceAll('\\', '/')
}

export async function publishLabPackage(labId, input, options = {}) {
  const config = roots(options)
  if (input?.approved !== true || !String(input.approvalNote || '').trim()) return { ok: false, error: '发布必须由教师明确批准并填写审批说明' }
  const inspected = await inspectLabPackage(labId, options)
  if (!inspected.ok) return { ok: false, error: 'Lab schema 校验未通过', errors: inspected.errors }
  let testRecord
  try { testRecord = JSON.parse(await readFile(path.join(config.runRoot, `${input.testRunId}.json`), 'utf8')) } catch { return { ok: false, error: '找不到隔离测试记录' } }
  if (testRecord.status !== 'passed' || testRecord.labId !== inspected.labId || testRecord.version !== inspected.version || testRecord.specHash !== inspected.specHash) {
    return { ok: false, error: '测试记录未通过或与当前 Lab 版本不匹配' }
  }
  const releaseDir = path.join(config.releaseRoot, inspected.labId, inspected.version)
  if (await exists(releaseDir)) return { ok: false, error: '该 Lab 版本已经发布，不允许覆盖' }
  const temporary = `${releaseDir}.tmp-${randomUUID()}`
  const publishedAt = new Date().toISOString()
  const releaseTest = {
    runId: testRecord.runId,
    labId: testRecord.labId,
    version: testRecord.version,
    variant: testRecord.variant,
    specHash: testRecord.specHash,
    status: testRecord.status,
    isolated: testRecord.isolated === true,
    commands: (testRecord.commands || []).map(({ kind, exitCode, outputHash }) => ({ kind, exitCode, outputHash })),
    baselineAssertions: testRecord.baselineAssertions || [],
    variantAssertions: testRecord.variantAssertions || [],
    negativeMatched: testRecord.negativeMatched === true,
    startedAt: testRecord.startedAt,
    finishedAt: testRecord.finishedAt,
    author: testRecord.author,
  }
  const release = {
    schemaVersion: 1,
    labId: inspected.labId,
    version: inspected.version,
    title: inspected.spec.title,
    status: inspected.spec.status,
    feature: inspected.spec.feature,
    manual: catalogReference(inspected.specPath, inspected.spec.manual, config.osLabRoot),
    answers: catalogReference(inspected.specPath, inspected.spec.answers, config.osLabRoot),
    tutorContext: catalogReference(inspected.specPath, inspected.spec.tutor_context, config.osLabRoot),
    verification: inspected.spec.verification,
    variants: await variantCatalog(inspected.spec, inspected.specPath, config.osLabRoot),
    source: { specHash: inspected.specHash, specPath: path.relative(config.osLabRoot, inspected.specPath).replaceAll('\\', '/') },
    test: releaseTest,
    approval: { approved: true, teacher: String(input.teacher || ''), note: String(input.approvalNote).trim().slice(0, 2000), approvedAt: publishedAt },
    author: String(input.author || testRecord.author || input.teacher || ''),
    publishedAt,
  }
  await mkdir(temporary, { recursive: true })
  await writeFile(path.join(temporary, 'release.json'), `${JSON.stringify(release, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await mkdir(path.dirname(releaseDir), { recursive: true })
  await rename(temporary, releaseDir)

  const catalogPath = config.catalogPath
  let catalog = { schemaVersion: 1, labs: {} }
  try { catalog = JSON.parse(await readFile(catalogPath, 'utf8')) } catch { /* first publication */ }
  catalog.labs[inspected.labId] = {
    version: release.version, title: release.title, feature: release.feature, status: release.status,
    manual: release.manual, answers: release.answers, tutorContext: release.tutorContext,
    verification: release.verification, variants: release.variants,
    release: path.relative(path.dirname(catalogPath), path.join(releaseDir, 'release.json')).replaceAll('\\', '/'),
  }
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  return { ok: true, labId: release.labId, version: release.version, publishedAt, release: catalog.labs[inspected.labId].release }
}

export async function listPublishedLabs(options = {}) {
  const config = roots(options)
  try { return JSON.parse(await readFile(config.catalogPath, 'utf8')) } catch { return { schemaVersion: 1, labs: {} } }
}
