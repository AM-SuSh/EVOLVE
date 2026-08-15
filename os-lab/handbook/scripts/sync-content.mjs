#!/usr/bin/env node
/**
 * 将 os-lab 教学 Markdown 同步到 handbook 子目录，供 VitePress 构建。
 * 源文件仍以 labs/、docs/ 为唯一维护点；同步目录已 gitignore。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HANDBOOK_ROOT = path.resolve(__dirname, '..')
const OS_LAB_ROOT = path.resolve(HANDBOOK_ROOT, '..')
const REPO_ROOT = path.resolve(OS_LAB_ROOT, '..')

// exercises 保留在清理列表中，用于删掉历史同步残留；题目已并入各 Lab【任务二】，不再复制。
const SYNC_DIRS = ['labs', 'exercises', 'answers', 'project', 'setup', 'learn']

const COPY_JOBS = [
  {
    from: path.join(OS_LAB_ROOT, 'docs'),
    to: path.join(HANDBOOK_ROOT, 'project'),
    filter: (f) => f.endsWith('.md'),
    hideSidebar: true,
  },
]

const SINGLE_FILES = [
  { from: path.join(REPO_ROOT, 'docs', 'environment_setup.md'), to: path.join(HANDBOOK_ROOT, 'setup', 'environment.md') },
  {
    from: path.join(REPO_ROOT, 'docs', 'os-lab.md'),
    to: path.join(HANDBOOK_ROOT, 'setup', 'verify-full.md'),
    hideSidebar: true,
  },
  {
    from: path.join(REPO_ROOT, 'docs', 'reference-report.md'),
    to: path.join(HANDBOOK_ROOT, 'project', 'reference-report.md'),
    hideSidebar: true,
  },
  {
    from: path.join(REPO_ROOT, 'xv6-comparison.md'),
    to: path.join(HANDBOOK_ROOT, 'project', 'xv6-comparison.md'),
    hideSidebar: true,
  },
  {
    from: path.join(REPO_ROOT, '赛题.md'),
    to: path.join(HANDBOOK_ROOT, 'project', 'competition.md'),
    hideSidebar: true,
  },
  { from: path.join(REPO_ROOT, 'scripts', 'activate-os-env.ps1'), to: path.join(HANDBOOK_ROOT, 'public', 'downloads', 'activate-os-env.ps1'), raw: true },
]

/** 仓库根目录 OSTEP 中译 PDF → 站点 /downloads/ostep-zh.pdf（文件名含空格/中文，按内容匹配）。 */
function resolveOstepPdf() {
  try {
    const name = fs.readdirSync(REPO_ROOT).find((f) => /OSTEP/i.test(f) && f.toLowerCase().endsWith('.pdf'))
    return name ? path.join(REPO_ROOT, name) : null
  } catch {
    return null
  }
}

function rewriteLinks(text) {
  return (
    text
      // 仓库 docs 相对路径
      .replace(/\]\(\.\.\/\.\.\/docs\/environment_setup\.md\)/g, '](/setup/environment)')
      .replace(/\]\(\.\.\/handbook\/guide\/([a-z-]+)\.md\)/g, '](/guide/$1)')
      .replace(/\]\(\.\.\/\.\.\/docs\/os-lab\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      .replace(/\]\(\.\.\/\.\.\/docs\/os-lab_verify\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      .replace(/\]\(\.\/environment_setup\.md\)/g, '](/setup/environment)')
      .replace(/\]\(\.\/os-lab\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      .replace(/\]\(\.\/os-lab_verify\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      .replace(/\]\(\.\.\/(?:Task|赛题)\.md\)/g, '](/project/competition)')
      .replace(/\]\(\.\.\/scripts\/activate-os-env\.ps1\)/g, '](/downloads/activate-os-env.ps1)')
      .replace(/\]\(reference-report\.md\)/g, '](/project/reference-report)')
      .replace(/\]\(\.\.\/reference-patches\/(?:README\.md)?\)/g, '](/project/reference-report)')
      .replace(/\]\(\.\.\/项目总报告\.md(?:#[^)]*)?\)/g, '](/project/design-report)')
      .replace(/\]\(\.\.\/README\.md(?:#[^)]*)?\)/g, '](/)')
      .replace(/\]\(\.\.\/\.\.\/xv6-comparison\.md(?:#[^)]*)?\)/g, '](/project/xv6-comparison)')
      .replace(/\]\(\.\.\/xv6-comparison\.md(?:#[^)]*)?\)/g, '](/project/xv6-comparison)')
      // os-lab 内部
      .replace(/\]\(\.\.\/docs\/([^)]+)\)/g, '](/project/$1)')
      .replace(/\]\(\.\.\/os-lab\/docs\/([^)]+)\)/g, '](/project/$1)')
      .replace(/\]\(\.\.\/os-lab\/labs\/([^)]+)\)/g, '](/labs/$1)')
      .replace(/\]\(\.\.\/os-lab\/README\.md\)/g, '](/guide/start)')
      .replace(/\]\(\.\.\/os-lab\/tests\/README\.md\)/g, '](/guide/ai-tutor)')
      .replace(/\]\(\/guide\/verify\)/g, '](/guide/ai-tutor)')
      .replace(/\]\(\/guide\/progress\)/g, '](/guide/ai-tutor)')
      .replace(/\]\(\/setup\/verify-full(?:#[^)]*)?\)/g, '](/setup/environment)')
      .replace(/\]\(\.\.\/labs\/([^)]+)\)/g, '](/labs/$1)')
      .replace(/\]\(\.\.\/lab(\d)[^)]*\)/g, (_, n) => {
        const map = {
          1: '/labs/lab1-bare-metal',
          2: '/labs/lab2-trap-and-task',
          3: '/labs/lab3-memory',
          4: '/labs/lab4-process',
          5: '/labs/lab5-fs-and-sync',
          6: '/labs/lab6-disk-fs',
          7: '/labs/lab7-ipc-signal',
          8: '/labs/lab8-thread-sync',
        }
        return `](${map[n] || '/labs/overview'})`
      })
      .replace(/\]\(\.\.\/answers\/([^)]+)\)/g, '](/answers/$1)')
      .replace(/\]\(lab(\d)-[^)]*\.md\)/g, (_, n) => {
        const map = {
          1: '/labs/lab1-bare-metal',
          2: '/labs/lab2-trap-and-task',
          3: '/labs/lab3-memory',
          4: '/labs/lab4-process',
          5: '/labs/lab5-fs-and-sync',
          6: '/labs/lab6-disk-fs',
          7: '/labs/lab7-ipc-signal',
          8: '/labs/lab8-thread-sync',
        }
        return `](${map[n]})`
      })
      .replace(/\]\(answers\/\)/g, '](/answers/README)')
      // 历史 exercises 链接改写到对应实验正文（题目已并入【任务二】）
      .replace(/\]\((?:\.\.\/)?exercises\/lab(\d)-exercises(?:\.md)?\)/g, (_, n) => {
        const map = {
          1: '/labs/lab1-bare-metal',
          2: '/labs/lab2-trap-and-task',
          3: '/labs/lab3-memory',
          4: '/labs/lab4-process',
          5: '/labs/lab5-fs-and-sync',
          6: '/labs/lab6-disk-fs',
          7: '/labs/lab7-ipc-signal',
          8: '/labs/lab8-thread-sync',
        }
        return `](${map[n] || '/labs/overview'})`
      })
      .replace(/\]\(\/exercises\/lab(\d)-exercises\)/g, (_, n) => {
        const map = {
          1: '/labs/lab1-bare-metal',
          2: '/labs/lab2-trap-and-task',
          3: '/labs/lab3-memory',
          4: '/labs/lab4-process',
          5: '/labs/lab5-fs-and-sync',
          6: '/labs/lab6-disk-fs',
          7: '/labs/lab7-ipc-signal',
          8: '/labs/lab8-thread-sync',
        }
        return `](${map[n] || '/labs/overview'})`
      })
      .replace(/\]\((?:\.\.\/)?answers\/([^)]+)\.md\)/g, '](/answers/$1)')
      .replace(/\]\(environment_setup\)/g, '](/setup/environment)')
      .replace(/\]\(environment_setup\.md\)/g, '](/setup/environment)')
      .replace(/\]\(os-lab\)/g, '](/setup/verify-full)')
      .replace(/\]\(os-lab\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      .replace(/\]\(\.\/answers\/\)/g, '](/answers/README)')
      .replace(/\]\(\.\/answers\/index\)/g, '](/answers/README)')
      .replace(/\]\(overview\.md\)/g, '](/labs/overview)')
      // 已是站点内绝对路径的 lab 链接（去掉 .md）
      .replace(/\]\(\/labs\/([^)]+)\.md\)/g, '](/labs/$1)')
      .replace(/\]\(\/answers\/([^)]+)\.md\)/g, '](/answers/$1)')
      // 前序规则可能产出 /labs/answers/ 这类目录链接，收敛到答案说明页
      .replace(/\]\(\/labs\/answers\/\)/g, '](/answers/README)')
      // 学生实验正文不再生成静态页，统一回到受权限控制的学习工作台。
      .replace(/\]\(\/labs\/lab([1-8])-[^)]*\)/g, '](/learn/lab$1)')
      .replace(/\]\(\/labs\/overview\)/g, '](/guide/ai-tutor)')
      .replace(/\]\(\/answers\/[^)]*\)/g, '](/guide/ai-tutor)')
  )
}

function withHiddenSidebar(body) {
  if (/^---\r?\n[\s\S]*?\r?\n---/.test(body)) {
    return body.replace(/^---\r?\n/, '---\nsidebar: false\n')
  }
  return `---\nsidebar: false\n---\n\n${body}`
}

function copyDir(src, dest, filter, hideSidebar = false) {
  if (!fs.existsSync(src)) {
    console.warn(`skip missing: ${src}`)
    return 0
  }
  fs.mkdirSync(dest, { recursive: true })
  let count = 0
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name)
    if (!fs.statSync(srcPath).isFile() || !filter(name)) continue
    let body = rewriteLinks(fs.readFileSync(srcPath, 'utf8'))
    if (hideSidebar) body = withHiddenSidebar(body)
    const banner = `<!-- 由 scripts/sync-content.mjs 从 ${path.relative(REPO_ROOT, srcPath)} 同步，请勿直接编辑 -->\n\n`
    fs.writeFileSync(path.join(dest, name), banner + body, 'utf8')
    count++
  }
  return count
}

function copyFile(src, dest, hideSidebar = false) {
  if (!fs.existsSync(src)) {
    console.warn(`skip missing: ${src}`)
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  let body = rewriteLinks(fs.readFileSync(src, 'utf8'))
  if (hideSidebar) body = withHiddenSidebar(body)
  const banner = `<!-- 由 scripts/sync-content.mjs 从 ${path.relative(REPO_ROOT, src)} 同步 -->\n\n`
  fs.writeFileSync(dest, banner + body, 'utf8')
}

function copySingleFile(job) {
  if (!fs.existsSync(job.from)) {
    console.warn(`skip missing: ${job.from}`)
    return
  }
  if (!job.raw) {
    copyFile(job.from, job.to, Boolean(job.hideSidebar))
    return
  }
  fs.mkdirSync(path.dirname(job.to), { recursive: true })
  fs.copyFileSync(job.from, job.to)
}

/**
 * 学习工作台只生成不含正文的路由壳。实验手册由 tutor-server 在登录后按
 * 教师发布范围和可信学习进度返回，避免静态构建泄露未开放内容。
 */
const WORKSPACE_LAYERS = {
  lab1: '启动底座',
  lab2: '执行与切换',
  lab3: '地址空间',
  lab4: '进程能力',
  lab5: '文件与并发',
  lab6: '持久存储',
  lab7: '进程通信',
  lab8: '并发同步',
}

function writeWorkspacePages() {
  const dataPath = path.join(HANDBOOK_ROOT, 'data', 'labs.json')
  if (!fs.existsSync(dataPath)) {
    console.warn(`skip missing: ${dataPath}`)
    return 0
  }
  const { labs } = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  const catalogPath = process.env.OS_LAB_FACTORY_CATALOG_PATH || path.join(OS_LAB_ROOT, 'lab-packages', 'published.json')
  let published = { labs: {} }
  try { published = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) } catch { /* no published Lab packages */ }
  for (const lab of labs) {
    const release = published.labs?.[lab.id]
    if (!release) continue
    lab.title = release.title
    lab.feature = release.feature
    lab.verifyCmd = release.verification?.command || lab.verifyCmd
    lab.expected = (release.verification?.assertions || []).map((item) => item.text).filter(Boolean)
  }
  const outDir = path.join(HANDBOOK_ROOT, 'learn')
  fs.mkdirSync(outDir, { recursive: true })
  let count = 0
  for (const lab of labs) {
    const source = `${lab.guide.replace(/^\/labs\//, '')}.md`
    if (!fs.existsSync(path.join(OS_LAB_ROOT, 'labs', source))) {
      console.warn(`skip workspace page, missing manual: os-lab/labs/${source}`)
      continue
    }
    const layer = WORKSPACE_LAYERS[lab.id] || lab.subtitle
    // frontmatter 必须位于文件最开头，说明性 banner 只能放在其后。
    const body = [
      '---',
      'layout: page',
      'workspace: true',
      `labId: ${lab.id}`,
      `title: ${lab.id.toUpperCase()} ${layer} · 引导式学习`,
      `description: 在实验手册与 AI 导师并排的工作台中学习「${lab.title}」`,
      'sidebar: false',
      'aside: false',
      'editLink: false',
      'lastUpdated: false',
      '---',
      '',
      '<!-- 由 scripts/sync-content.mjs 生成，请勿直接编辑 -->',
      '',
      '<!-- 正文由工作台在登录后从 tutor-server 获取。 -->',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(outDir, `${lab.id}.md`), body, 'utf8')
    count++
  }
  return count
}

function rmSyncDirs() {
  for (const dir of SYNC_DIRS) {
    const p = path.join(HANDBOOK_ROOT, dir)
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
  }
}

console.log('sync handbook content...')
rmSyncDirs()

let total = 0
for (const job of COPY_JOBS) {
  total += copyDir(job.from, job.to, job.filter, Boolean(job.hideSidebar))
}
for (const job of SINGLE_FILES) {
  copySingleFile(job)
  total++
}

const ostepPdf = resolveOstepPdf()
if (ostepPdf) {
  copySingleFile({
    from: ostepPdf,
    to: path.join(HANDBOOK_ROOT, 'public', 'downloads', 'ostep-zh.pdf'),
    raw: true,
  })
  total++
} else {
  console.warn('skip missing: OSTEP PDF in repo root')
}

const workspacePages = writeWorkspacePages()
total += workspacePages

console.log(`synced ${total} markdown files (${workspacePages} workspace pages)`)
