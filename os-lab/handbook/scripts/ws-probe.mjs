#!/usr/bin/env node
/**
 * 用 CDP 驱动本机 Chrome 检查学习工作台：横向溢出、控制台报错、阶段联动。
 * 只用于开发期自查，不参与构建。
 *
 *   node scripts/ws-probe.mjs <baseUrl> [width] [height]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] || 'http://localhost:4188'
const width = Number(process.argv[3] || 1366)
const height = Number(process.argv[4] || 768)
const port = 9333

const chromePath =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  // 不加这一条时 Windows 的 DPI 缩放会让实际视口宽于 --window-size。
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ws-probe-'))}`,
  `--window-size=${width},${height}`,
  'about:blank',
])
chrome.on('error', (error) => {
  console.error('无法启动 Chrome：', error.message)
  process.exit(1)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((item) => item.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      // Chrome 还没起来。
    }
    await sleep(250)
  }
  throw new Error('Chrome 调试端口没有就绪')
}

function connect(url) {
  const socket = new WebSocket(url)
  const pending = new Map()
  const logs = []
  let id = 0

  socket.addEventListener('message', (event) => {
    const frame = JSON.parse(event.data)
    if (frame.id && pending.has(frame.id)) {
      const { resolve, reject } = pending.get(frame.id)
      pending.delete(frame.id)
      frame.error ? reject(new Error(frame.error.message)) : resolve(frame.result)
      return
    }
    if (frame.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(frame.params.type)) {
      logs.push(`${frame.params.type}: ${frame.params.args.map((a) => a.value ?? a.description).join(' ')}`)
    }
    if (frame.method === 'Runtime.exceptionThrown') {
      logs.push(`exception: ${frame.params.exceptionDetails.exception?.description || frame.params.exceptionDetails.text}`)
    }
  })

  const ready = new Promise((resolve) => socket.addEventListener('open', resolve))
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  return { ready, send, logs, close: () => socket.close() }
}

async function evaluate(client, expression) {
  const { result } = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  return result.value
}

const client = connect(await findTarget())
await client.ready
await client.send('Runtime.enable')
await client.send('Page.enable')
// 用 CDP 精确设定视口，绕开宿主 DPI 缩放。
await client.send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 700,
})

async function goto(path) {
  await client.send('Page.navigate', { url: `${base}${path}` })
  await sleep(2500)
}

// 只报告"根因"：本身溢出、但父元素没溢出的元素。
const OVERFLOW = `(() => {
  const docWidth = document.documentElement.clientWidth
  const over = el => el.getBoundingClientRect().right > docWidth + 1
  const label = el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\\s+/).join('.') : '')
  const roots = [...document.querySelectorAll('body *')].filter(
    el => over(el) && !(el.parentElement && el.parentElement !== document.body && over(el.parentElement)),
  )
  return {
    docWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: roots.slice(0, 6).map(el => label(el) + ' -> right ' + Math.round(el.getBoundingClientRect().right)),
  }
})()`

console.log(`\n=== ${width}x${height} ===`)

for (const path of ['/learn/lab2', '/guide/ai-tutor']) {
  await goto(path)
  const overflow = await evaluate(client, OVERFLOW)
  console.log(`\n${path}`)
  console.log(`  视口 ${overflow.docWidth} / scrollWidth ${overflow.scrollWidth}` +
    (overflow.scrollWidth > overflow.docWidth ? '  ← 横向溢出' : '  ✓'))
  overflow.offenders.forEach((item) => console.log(`    溢出: ${item}`))
}

// 阶段联动：切到「验证」应滚动到「三、实验任务」并弹出证据面板。
await goto('/learn/lab2')
const before = await evaluate(client, `document.querySelector('.ws-manual-scroll').scrollTop`)
await evaluate(client, `[...document.querySelectorAll('.ws-stage-strip button')][2].click()`)
await sleep(1400)
const after = await evaluate(
  client,
  `({
     scrollTop: document.querySelector('.ws-manual-scroll').scrollTop,
     heading: document.querySelector('.ws-manual-where strong')?.textContent.trim(),
     evidence: !!document.querySelector('.ws-evidence'),
     evidenceLabel: document.querySelector('.ws-manual-evidence-toggle span')?.textContent.trim(),
     reading: document.querySelector('.ws-stage-reading')?.textContent.trim(),
     activeStage: document.querySelector('.ws-stage-strip button.active')?.textContent.trim(),
   })`,
)
console.log('\n阶段联动（点「验证」）')
console.log(`  scrollTop ${before} -> ${after.scrollTop}`)
console.log(`  当前章节: ${after.heading}`)
console.log(`  当前阶段: ${after.activeStage}`)
console.log(`  证据面板: ${after.evidence ? '已展开' : '未展开'} · ${after.evidenceLabel || '-'}`)
console.log(`  阅读上下文: ${after.reading || '-'}`)

// 折叠「五、AI 提问模板」
const collapsed = await evaluate(
  client,
  `(() => {
     const h = document.querySelector('.ws-section-collapsible')
     if (!h) return null
     const hiddenBefore = h.nextElementSibling?.classList.contains('ws-section-collapsed')
     h.click()
     const hiddenAfter = h.nextElementSibling?.classList.contains('ws-section-collapsed')
     return { title: h.textContent.replace(/[#\\s]+$/,'').trim(), hiddenBefore, hiddenAfter }
   })()`,
)
console.log('\n提问模板折叠')
console.log(`  ${collapsed ? `${collapsed.title}: 默认隐藏=${collapsed.hiddenBefore} 点击后隐藏=${collapsed.hiddenAfter}` : '未找到'}`)

// mermaid
await goto('/labs/overview')
const mermaid = await evaluate(
  client,
  `({ blocks: document.querySelectorAll('.mermaid').length,
      svgs: document.querySelectorAll('.mermaid svg').length,
      raw: document.querySelectorAll('.language-mermaid').length })`,
)
console.log('\nmermaid（/labs/overview）')
console.log(`  容器 ${mermaid.blocks} · 渲染出的 svg ${mermaid.svgs} · 残留源码块 ${mermaid.raw}`)

console.log('\n控制台错误/警告')
console.log(client.logs.length ? client.logs.map((l) => '  ' + l).join('\n') : '  无')

client.close()
chrome.kill()
process.exit(0)
