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

const SYNC_DIRS = ['labs', 'answers', 'project', 'setup']

const COPY_JOBS = [
  { from: path.join(OS_LAB_ROOT, 'labs'), to: path.join(HANDBOOK_ROOT, 'labs'), filter: (f) => f.endsWith('.md') },
  { from: path.join(OS_LAB_ROOT, 'labs', 'answers'), to: path.join(HANDBOOK_ROOT, 'answers'), filter: (f) => f.endsWith('.md') },
  { from: path.join(OS_LAB_ROOT, 'docs'), to: path.join(HANDBOOK_ROOT, 'project'), filter: (f) => f.endsWith('.md') },
]

const SINGLE_FILES = [
  { from: path.join(REPO_ROOT, 'docs', 'environment_setup.md'), to: path.join(HANDBOOK_ROOT, 'setup', 'environment.md') },
  { from: path.join(REPO_ROOT, 'docs', 'os-lab.md'), to: path.join(HANDBOOK_ROOT, 'setup', 'verify-full.md') },
]

function rewriteLinks(text) {
  return (
    text
      // 仓库 docs 相对路径
      .replace(/\]\(\.\.\/\.\.\/docs\/environment_setup\.md\)/g, '](/setup/environment)')
      .replace(/\]\(\.\.\/\.\.\/docs\/os-lab\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      .replace(/\]\(\.\.\/\.\.\/docs\/os-lab_verify\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      .replace(/\]\(\.\/environment_setup\.md\)/g, '](/setup/environment)')
      .replace(/\]\(\.\/os-lab\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      .replace(/\]\(\.\/os-lab_verify\.md(?:#[^)]*)?\)/g, '](/setup/verify-full)')
      // os-lab 内部
      .replace(/\]\(\.\.\/docs\/([^)]+)\)/g, '](/project/$1)')
      .replace(/\]\(\.\.\/os-lab\/docs\/([^)]+)\)/g, '](/project/$1)')
      .replace(/\]\(\.\.\/os-lab\/labs\/([^)]+)\)/g, '](/labs/$1)')
      .replace(/\]\(\.\.\/os-lab\/README\.md\)/g, '](/guide/start)')
      .replace(/\]\(\.\.\/os-lab\/tests\/README\.md\)/g, '](/guide/verify)')
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
  )
}

function copyDir(src, dest, filter) {
  if (!fs.existsSync(src)) {
    console.warn(`skip missing: ${src}`)
    return 0
  }
  fs.mkdirSync(dest, { recursive: true })
  let count = 0
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name)
    if (!fs.statSync(srcPath).isFile() || !filter(name)) continue
    const body = rewriteLinks(fs.readFileSync(srcPath, 'utf8'))
    const banner = `<!-- 由 scripts/sync-content.mjs 从 ${path.relative(REPO_ROOT, srcPath)} 同步，请勿直接编辑 -->\n\n`
    fs.writeFileSync(path.join(dest, name), banner + body, 'utf8')
    count++
  }
  return count
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`skip missing: ${src}`)
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const body = rewriteLinks(fs.readFileSync(src, 'utf8'))
  const banner = `<!-- 由 scripts/sync-content.mjs 从 ${path.relative(REPO_ROOT, src)} 同步 -->\n\n`
  fs.writeFileSync(dest, banner + body, 'utf8')
}

function rmSyncDirs() {
  for (const dir of SYNC_DIRS) {
    const p = path.join(HANDBOOK_ROOT, dir)
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
  }
  // 历史遗留：曾同步 exercises/，现已废弃，构建前一并清理
  const legacyExercises = path.join(HANDBOOK_ROOT, 'exercises')
  if (fs.existsSync(legacyExercises)) fs.rmSync(legacyExercises, { recursive: true, force: true })
}

console.log('sync handbook content...')
rmSyncDirs()

let total = 0
for (const job of COPY_JOBS) {
  total += copyDir(job.from, job.to, job.filter)
}
for (const job of SINGLE_FILES) {
  copyFile(job.from, job.to)
  total++
}

console.log(`synced ${total} markdown files`)
