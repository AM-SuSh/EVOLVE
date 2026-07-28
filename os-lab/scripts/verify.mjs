import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectTraceEvents } from '../tutor/contracts.mjs'
import { evaluateRunAssertions, getRunRecipe } from '../tutor/run-recipes.mjs'

const osLabRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const handbookRoot = path.join(osLabRoot, 'handbook')
const npmBin = 'npm'
const cargoBin = process.platform === 'win32' ? 'cargo.exe' : 'cargo'
const rustcBin = process.platform === 'win32' ? 'rustc.exe' : 'rustc'
const scope = process.argv[2] || 'baseline'
const labFlag = process.argv.indexOf('--lab')
const labId = labFlag >= 0 ? process.argv[labFlag + 1] : 'lab2'

function killTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${command} ${args.join(' ')}`)
    const child = spawn(command, args, {
      cwd: options.cwd || osLabRoot,
      env: process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: Boolean(options.shell),
    })
    let output = ''
    if (options.capture) {
      const forward = (chunk) => {
        const text = chunk.toString('utf8')
        output += text
        process.stdout.write(text)
      }
      child.stdout.on('data', forward)
      child.stderr.on('data', forward)
    }
    const timer = setTimeout(() => killTree(child), options.timeoutMs || 300_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, output })
    })
  })
}

async function handbook() {
  const result = await run(npmBin, ['run', 'build'], { cwd: handbookRoot, shell: process.platform === 'win32' })
  if (result.code !== 0) throw new Error(`handbook 构建失败（exit ${result.code}）`)
}

async function host() {
  const rustc = await run(rustcBin, ['-vV'], { capture: true, timeoutMs: 30_000 })
  if (rustc.code !== 0) throw new Error('无法读取 Rust host target')
  const hostTarget = rustc.output.match(/^host:\s*(\S+)/m)?.[1]
  if (!hostTarget) throw new Error('rustc -vV 未返回 host target')
  const result = await run(
    cargoBin,
    ['test', '-p', 'os-context', '-p', 'os-syscall', '--target', hostTarget],
    { cwd: osLabRoot },
  )
  if (result.code !== 0) throw new Error(`host 测试失败（exit ${result.code}）`)
}

async function qemu(targetLab) {
  const recipe = getRunRecipe(targetLab)
  if (!recipe) throw new Error(`未知 Lab：${targetLab}`)
  let output = ''
  let exitCode = 0
  for (const step of recipe.steps) {
    const result = await run(step.cmd, step.args, { cwd: osLabRoot, capture: true })
    output += result.output
    exitCode = result.code
    if (exitCode !== 0) break
  }
  const traces = collectTraceEvents(output)
  const assertions = evaluateRunAssertions(recipe.id, output, traces)
  console.log('\n可信断言：')
  for (const assertion of assertions) {
    console.log(`${assertion.passed ? '[PASS]' : '[FAIL]'} ${assertion.label}: ${assertion.observed}`)
  }
  if (exitCode !== 0 || !assertions.length || assertions.some((item) => !item.passed)) {
    throw new Error(`${targetLab} QEMU 可信验证失败`)
  }
}

async function main() {
  if (!['baseline', 'handbook', 'host', 'qemu'].includes(scope)) {
    throw new Error('用法：node scripts/verify.mjs [baseline|handbook|host|qemu] [--lab lab2]')
  }
  if (scope === 'baseline' || scope === 'handbook') await handbook()
  if (scope === 'baseline' || scope === 'host') await host()
  if (scope === 'baseline' || scope === 'qemu') await qemu(labId)
  console.log(`\n验证完成：${scope}${scope === 'baseline' || scope === 'qemu' ? ` / ${labId}` : ''}`)
}

main().catch((error) => {
  console.error(`\n验证失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
