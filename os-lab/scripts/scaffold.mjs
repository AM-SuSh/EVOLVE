#!/usr/bin/env node
/**
 * 学生工作区脚手架：把完整参考实现（os-lab/）按 Lab 渐进发放到每个学生自己的
 * 工作区 student-labs/<学号>/。
 *
 * 设计原则：
 *  1. 账号制：每个学生以学号/昵称标识，各自维护一个独立的小系统；进度、任务
 *     变体、个性化程序互不干扰。
 *  2. 学生初始只拿到能构建最小系统的 Lab1 代码；教师在控制台「开放」到第几个
 *     Lab，学生才能升级到那一层——升级只补必需的新文件，永不覆盖学生已有文件，
 *     学生的补全、修改与自建程序（bonus）全部保留。
 *  3. 核心学习点不发参考实现，而发 scaffold/exercises/ 里的任务版（补全/排错等
 *     变体），教师可按班级/学生灵活或随机分配。
 *  4. 三个清单文件（根/kernel/user 的 Cargo.toml）属于框架，按进度生成并覆盖。
 *
 * 教师配置集中在 scaffold/teacher.json（不进 git）：
 *   { "openLab": "lab3", "assignments": { "lab2": "debug" },
 *     "llm": { "baseUrl": "...", "model": "...", "apiKey": "..." },
 *     "allowStudentLlm": true }
 * 推荐用工作台的教师控制台页面编辑；本脚本命令行是备用手段：
 *   node scripts/scaffold.mjs status <学号>
 *   node scripts/scaffold.mjs init <学号> | upgrade <学号> [变体]
 *   node scripts/scaffold.mjs add-bin <学号> <名字>
 *   node scripts/scaffold.mjs assign <lab> <变体|random> | open <labN>
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'

const OS_LAB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(OS_LAB_ROOT, '..')
const STUDENTS_ROOT = path.join(REPO_ROOT, 'student-labs')
const EXERCISE_ROOT = path.join(OS_LAB_ROOT, 'scaffold', 'exercises')
const TEACHER_FILE = path.join(OS_LAB_ROOT, 'scaffold', 'teacher.json')
const STATE_FILE = '.scaffold-state.json'

export const LAB_ORDER = ['lab1', 'lab2', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8']

/** 学号/昵称只允许安全字符，防止路径注入。 */
export function sanitizeUser(user) {
  const value = String(user || '').trim()
  return /^[A-Za-z0-9_一-龥-]{1,32}$/.test(value) ? value : null
}

export function studentRootFor(user) {
  return path.join(STUDENTS_ROOT, user)
}

/** 每个 Lab 需要新增的文件（相对 os-lab/）。kernel 模块全部按 feature 门控，
 *  低阶构建不会引用缺失文件，所以可以安全地按层发放。 */
const LABS = {
  lab1: {
    summary: '裸机启动：SBI 输出与关机的最小系统',
    crates: ['os-sbi'],
    kernel: ['build.rs', 'linker.ld', 'src/main.rs', 'src/entry.asm', 'src/console.rs'],
    rootFiles: ['rust-toolchain.toml', 'Makefile', '.cargo/config.toml'],
    userBins: [],
  },
  lab2: {
    summary: 'trap、系统调用与任务切换',
    crates: ['os-context', 'os-syscall'],
    kernel: ['src/cell.rs', 'src/config.rs', 'src/riscv.rs', 'src/trap.rs', 'src/loader.rs', 'src/task.rs'],
    userBase: true,
    userBins: ['hello', 'power', 'yield'],
  },
  lab3: {
    summary: '物理内存与 Sv39 虚拟内存',
    crates: ['os-alloc', 'os-vm'],
    kernel: ['src/mm.rs'],
    userBins: [],
  },
  lab4: {
    summary: '进程：fork / exec / wait',
    kernel: ['src/process.rs'],
    userBins: ['fork_test', 'exec_test'],
  },
  lab5: {
    summary: '文件描述符、内嵌文件与管道',
    crates: ['os-fs'],
    kernel: ['src/sync.rs', 'src/fs/mod.rs', 'src/fs/embedded.rs'],
    userBins: ['fs_test', 'pipe_test'],
  },
  lab6: {
    summary: 'VirtIO 磁盘文件系统与硬链接',
    kernel: ['src/fs/disk.rs', 'src/virtio_block.rs', 'src/global_alloc.rs'],
    userBins: ['lab6_usertest', 'file_test', 'link_test', 'mass_unlink_test', 'mmap_test', 'spawn_test', 'stride_test'],
  },
  lab7: {
    summary: '统一 fd、dup 重定向与信号',
    crates: ['os-signal'],
    kernel: ['src/signal.rs'],
    userBins: ['lab7_usertest', 'dup_test', 'signal_test', 'signal_child', 'signal_mask_test'],
  },
  lab8: {
    summary: '线程、阻塞同步原语与死锁检测',
    crates: ['os-sync'],
    kernel: ['src/deadlock.rs', 'src/processor.rs', 'src/sync_syscall.rs'],
    userBins: ['lab8_usertest', 'lab8_integration_test', 'threads_test', 'threads_arg_test', 'mutex_test', 'condvar_test', 'pipetest', 'deadlock_mutex_test', 'deadlock_sem_test'],
  },
}

/** kernel/Cargo.toml 的 features 行（与参考实现一致），按进度截取。 */
const KERNEL_FEATURES = {
  lab1: 'lab1 = ["dep:os-sbi"]',
  lab2: 'lab2 = ["lab1", "dep:os-context", "dep:os-syscall"]',
  lab3: 'lab3 = ["lab2", "dep:os-alloc", "dep:os-vm"]',
  lab4: 'lab4 = ["lab3"]',
  lab5: 'lab5 = ["lab4", "dep:os-fs"]',
  lab6: 'lab6 = ["lab5", "dep:easy-fs", "dep:virtio-drivers", "dep:spin"]',
  lab7: 'lab7 = ["lab6", "dep:os-signal"]',
  lab8: 'lab8 = ["lab7", "dep:os-sync"]',
}

const KERNEL_DEPS = {
  lab1: ['os-sbi = { path = "../os-sbi", optional = true }'],
  lab2: [
    'os-context = { path = "../os-context", optional = true }',
    'os-syscall = { path = "../os-syscall", optional = true }',
  ],
  lab3: [
    'os-alloc = { path = "../os-alloc", optional = true }',
    'os-vm = { path = "../os-vm", optional = true }',
  ],
  lab4: [],
  lab5: ['os-fs = { path = "../os-fs", optional = true }'],
  lab6: [
    'easy-fs = { package = "tg-rcore-tutorial-easy-fs", version = "0.4.8", optional = true }',
    'virtio-drivers = { version = "0.1.0", optional = true }',
    'spin = { version = "0.9", optional = true }',
  ],
  lab7: ['os-signal = { path = "../os-signal", optional = true }'],
  lab8: ['os-sync = { path = "../os-sync", optional = true }'],
}

/**
 * 核心学习点的任务变体。文件放在 scaffold/exercises/<lab>/<variant>/<相对路径>，
 * 发放时替代参考实现。教师在控制台（或 assign 命令）指定各 Lab 用哪个变体，
 * "random" 表示随机——不同学生拿到不同任务。
 */
export const EXERCISES = {
  lab2: {
    default: 'fill',
    variants: {
      fill: { label: '补全：实现 find_next_task 调度器', files: ['kernel/src/task.rs'] },
      debug: { label: '排错：任务管理埋了一个 bug，先复现再修复', files: ['kernel/src/task.rs'] },
    },
  },
}

/* -- 教师配置 ---------------------------------------------------------------- */

export async function readTeacherConfig() {
  let raw = {}
  try {
    raw = JSON.parse(await readFile(TEACHER_FILE, 'utf8'))
  } catch {
    raw = {}
  }
  const scope = (value) => ({
    openLab: LAB_ORDER.includes(value?.openLab) ? value.openLab : undefined,
    assignments: value?.assignments && typeof value.assignments === 'object' ? value.assignments : {},
    notice: typeof value?.notice === 'string' ? value.notice : undefined,
  })
  const mapOf = (value) =>
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, v]) => [key, scope(v)]))
      : {}
  return {
    openLab: LAB_ORDER.includes(raw.openLab) ? raw.openLab : 'lab8',
    assignments: raw.assignments && typeof raw.assignments === 'object' ? raw.assignments : {},
    llm: raw.llm && typeof raw.llm === 'object' ? raw.llm : {},
    allowStudentLlm: raw.allowStudentLlm !== false,
    notice: typeof raw.notice === 'string' ? raw.notice : '',
    /** 班级级覆盖：{ 班级名: { openLab?, assignments?, notice? } } */
    classes: mapOf(raw.classes),
    /** 学生级覆盖（优先级最高）：{ 用户名: { openLab?, assignments?, notice? } } */
    students: mapOf(raw.students),
  }
}

/**
 * 计算某个学生的生效教学配置：学生覆盖 > 班级覆盖 > 全局默认。
 * assignments 按 lab 逐项就近取；notice 同理（学生专属作业 > 班级作业 > 全局公告）。
 */
export function effectiveConfigFor(config, username, className) {
  const layers = [
    config.students[username] || {},
    (className && config.classes[className]) || {},
    { openLab: config.openLab, assignments: config.assignments, notice: config.notice },
  ]
  const openLab = layers.find((l) => l.openLab)?.openLab || config.openLab
  const notice = layers.find((l) => typeof l.notice === 'string' && l.notice !== undefined)?.notice ?? ''
  const assignments = {}
  for (const lab of LAB_ORDER) {
    for (const layer of layers) {
      if (layer.assignments && layer.assignments[lab]) {
        assignments[lab] = layer.assignments[lab]
        break
      }
    }
  }
  return { openLab, assignments, notice }
}

export async function writeTeacherConfig(patch) {
  const current = await readTeacherConfig()
  const next = { ...current, ...patch }
  if (!LAB_ORDER.includes(next.openLab)) next.openLab = current.openLab
  await mkdir(path.dirname(TEACHER_FILE), { recursive: true })
  await writeFile(TEACHER_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

export async function writeAssignment(labId, variant) {
  const exercise = EXERCISES[labId]
  if (!exercise) return { ok: false, log: [`${labId} 目前没有任务变体（先在 EXERCISES 表登记）`] }
  if (variant !== 'random' && !exercise.variants[variant]) {
    return {
      ok: false,
      log: [`${labId} 可选变体：${Object.keys(exercise.variants).join(' / ')} 或 random`],
    }
  }
  const config = await readTeacherConfig()
  config.assignments[labId] = variant
  await writeTeacherConfig({ assignments: config.assignments })
  return { ok: true, log: [`已设置 ${labId} 的任务分配：${variant}`] }
}

/** 解析某个 Lab 实际发放的变体：显式指定 > 生效分配表（学生>班级>全局）> 该 Lab 默认。 */
async function resolveVariant(labId, explicit, effectiveAssignments) {
  const exercise = EXERCISES[labId]
  if (!exercise) return null
  const names = Object.keys(exercise.variants)
  const pick = (value) =>
    value === 'random' ? names[Math.floor(Math.random() * names.length)] : value
  if (explicit && (explicit === 'random' || exercise.variants[explicit])) return pick(explicit)
  const assigned = (effectiveAssignments || (await readTeacherConfig()).assignments)[labId]
  if (assigned && (assigned === 'random' || exercise.variants[assigned])) return pick(assigned)
  return exercise.default
}

/* -- 学生状态 ---------------------------------------------------------------- */

async function readState(studentRoot) {
  try {
    const raw = await readFile(path.join(studentRoot, STATE_FILE), 'utf8')
    const state = JSON.parse(raw)
    return {
      applied: Array.isArray(state.applied) ? state.applied.filter((l) => LAB_ORDER.includes(l)) : [],
      extraBins: Array.isArray(state.extraBins) ? state.extraBins : [],
      variants: state.variants && typeof state.variants === 'object' ? state.variants : {},
    }
  } catch {
    return { applied: [], extraBins: [], variants: {} }
  }
}

async function writeState(studentRoot, state) {
  await writeFile(
    path.join(studentRoot, STATE_FILE),
    `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
}

export async function scaffoldStatus(user, effective) {
  const safe = sanitizeUser(user)
  const teacher = effective || (await readTeacherConfig())
  if (!safe) {
    return { ok: false, error: '需要先填写学号/昵称（1-32 位字母、数字、中文、_ 或 -）' }
  }
  const studentRoot = studentRootFor(safe)
  const state = await readState(studentRoot)
  const current = state.applied[state.applied.length - 1] || null
  const next = LAB_ORDER[state.applied.length] || null
  const openIndex = LAB_ORDER.indexOf(teacher.openLab)
  const nextAllowed = next ? LAB_ORDER.indexOf(next) <= openIndex : false
  return {
    ok: true,
    user: safe,
    root: `student-labs/${safe}`,
    exists: state.applied.length > 0,
    applied: state.applied,
    current,
    next,
    nextSummary: next ? LABS[next].summary : null,
    nextAllowed,
    openLab: teacher.openLab,
    extraBins: state.extraBins,
    variants: state.variants,
  }
}

/** 列出全部学生及其进度（教师控制台用）。 */
export async function listStudents() {
  let entries = []
  try {
    entries = await readdir(STUDENTS_ROOT, { withFileTypes: true })
  } catch {
    return []
  }
  const students = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const state = await readState(path.join(STUDENTS_ROOT, entry.name))
    students.push({
      user: entry.name,
      applied: state.applied,
      current: state.applied[state.applied.length - 1] || null,
      variants: state.variants,
      extraBins: state.extraBins,
    })
  }
  students.sort((a, b) => a.user.localeCompare(b.user))
  return students
}

/* -- 文件操作 ---------------------------------------------------------------- */

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/** 递归复制目录，跳过已存在的文件（学生的修改优先）。 */
async function copyDirNoOverwrite(src, dst, studentRoot, log) {
  await mkdir(dst, { recursive: true })
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (entry.name === 'target' || entry.name.startsWith('.')) continue
    const from = path.join(src, entry.name)
    const to = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDirNoOverwrite(from, to, studentRoot, log)
    } else if (await exists(to)) {
      log.push(`保留 ${path.relative(studentRoot, to)}（已存在，未覆盖）`)
    } else {
      await cp(from, to)
      log.push(`新增 ${path.relative(studentRoot, to)}`)
    }
  }
}

async function copyFileNoOverwrite(src, dst, studentRoot, log, note = '') {
  if (await exists(dst)) {
    log.push(`保留 ${path.relative(studentRoot, dst)}（已存在，未覆盖）`)
    return
  }
  await mkdir(path.dirname(dst), { recursive: true })
  await cp(src, dst)
  log.push(`新增 ${path.relative(studentRoot, dst)}${note}`)
}

/* -- 清单文件生成 ------------------------------------------------------------ */

function rootCargoToml(applied) {
  const members = ['kernel']
  for (const lab of applied) for (const crate of LABS[lab].crates || []) members.push(crate)
  if (applied.includes('lab2')) members.push('user')
  return `[workspace]
resolver = "2"
members = [
${members.map((m) => `    "${m}",`).join('\n')}
]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "BSD-3-Clause"
authors = ["OS Lab Student"]
repository = ""

[profile.dev]
panic = "abort"

[profile.release]
panic = "abort"
lto = true
`
}

function kernelCargoToml(applied) {
  const features = applied.map((lab) => KERNEL_FEATURES[lab])
  const deps = applied.flatMap((lab) => KERNEL_DEPS[lab])
  return `[package]
name = "kernel"
version.workspace = true
edition.workspace = true
license.workspace = true
authors.workspace = true
repository.workspace = true
description = "My progressive OS kernel (student workspace)"

[features]
default = ["${applied[applied.length - 1]}"]
${features.join('\n')}

[dependencies]
${deps.join('\n')}

[build-dependencies]
easy-fs = { package = "tg-rcore-tutorial-easy-fs", version = "0.4.8" }
`
}

function userCargoToml(applied, extraBins) {
  const bins = []
  for (const lab of applied) bins.push(...(LABS[lab].userBins || []))
  bins.push(...extraBins)
  return `[package]
name = "user"
version.workspace = true
edition.workspace = true
license.workspace = true
authors.workspace = true
repository.workspace = true
description = "User-space programs of my OS (student workspace)"

[lib]
name = "user_lib"
crate-type = ["staticlib", "rlib"]

[dependencies]
os-syscall = { path = "../os-syscall" }

${bins.map((name) => `[[bin]]\nname = "${name}"\npath = "src/bin/${name}.rs"`).join('\n\n')}
`
}

async function regenerateManifests(studentRoot, state, log) {
  const { applied, extraBins } = state
  await writeFile(path.join(studentRoot, 'Cargo.toml'), rootCargoToml(applied), 'utf8')
  await writeFile(path.join(studentRoot, 'kernel', 'Cargo.toml'), kernelCargoToml(applied), 'utf8')
  if (applied.includes('lab2')) {
    await writeFile(path.join(studentRoot, 'user', 'Cargo.toml'), userCargoToml(applied, extraBins), 'utf8')
  }
  log.push('更新 Cargo.toml 清单（框架文件，按进度生成）')
}

/* -- 应用一个 Lab ------------------------------------------------------------ */

async function applyLab(studentRoot, labId, state, log, explicitVariant, effectiveAssignments) {
  const lab = LABS[labId]
  const variant = await resolveVariant(labId, explicitVariant, effectiveAssignments)
  const variantInfo = variant ? EXERCISES[labId].variants[variant] : null
  const exercisePaths = new Set(variantInfo ? variantInfo.files : [])

  for (const file of lab.rootFiles || []) {
    await copyFileNoOverwrite(path.join(OS_LAB_ROOT, file), path.join(studentRoot, file), studentRoot, log)
  }
  for (const crate of lab.crates || []) {
    await copyDirNoOverwrite(path.join(OS_LAB_ROOT, crate), path.join(studentRoot, crate), studentRoot, log)
  }
  for (const file of lab.kernel || []) {
    const rel = `kernel/${file}`
    if (exercisePaths.has(rel)) continue
    await copyFileNoOverwrite(path.join(OS_LAB_ROOT, rel), path.join(studentRoot, rel), studentRoot, log)
  }
  if (lab.userBase) {
    for (const file of ['build.rs', 'linker.ld', 'src/entry.asm', 'src/lib.rs', 'src/syscall.rs']) {
      const src = path.join(OS_LAB_ROOT, 'user', file)
      if (await exists(src)) {
        await copyFileNoOverwrite(src, path.join(studentRoot, 'user', file), studentRoot, log)
      }
    }
  }
  for (const bin of lab.userBins || []) {
    const rel = `user/src/bin/${bin}.rs`
    if (exercisePaths.has(rel)) continue
    await copyFileNoOverwrite(path.join(OS_LAB_ROOT, rel), path.join(studentRoot, rel), studentRoot, log)
  }
  // 任务文件：来自 scaffold/exercises/<lab>/<variant>/，替代参考实现发放。
  for (const rel of exercisePaths) {
    const overlay = path.join(EXERCISE_ROOT, labId, variant, rel)
    if (await exists(overlay)) {
      await copyFileNoOverwrite(overlay, path.join(studentRoot, rel), studentRoot, log, `（任务：${variantInfo.label}）`)
    } else {
      await copyFileNoOverwrite(path.join(OS_LAB_ROOT, rel), path.join(studentRoot, rel), studentRoot, log)
    }
  }
  if (variant) {
    state.variants[labId] = variant
    log.push(`本层任务类型：${variant} · ${variantInfo.label}`)
  }

  state.applied.push(labId)
  await regenerateManifests(studentRoot, state, log)
  await writeState(studentRoot, state)
  log.push(`✔ ${labId} 已就位：${lab.summary}`)
}

/* -- 对外命令 ---------------------------------------------------------------- */

export async function applyNext(user, explicitVariant, effective) {
  const safe = sanitizeUser(user)
  if (!safe) return { ok: false, log: ['需要先填写学号/昵称（1-32 位字母、数字、中文、_ 或 -）'] }
  const studentRoot = studentRootFor(safe)
  const state = await readState(studentRoot)
  const next = LAB_ORDER[state.applied.length]
  if (!next) return { ok: false, log: ['八个 Lab 已全部发放，剩下的完善由你自由发挥。'] }

  // 教师开放进度门控（生效配置 = 学生覆盖 > 班级覆盖 > 全局默认）。
  const teacher = effective || (await readTeacherConfig())
  if (LAB_ORDER.indexOf(next) > LAB_ORDER.indexOf(teacher.openLab)) {
    return {
      ok: false,
      log: [`${next} 还没有开放（老师当前给你开放到 ${teacher.openLab}），先把已有的做扎实。`],
    }
  }

  const log = []
  await mkdir(studentRoot, { recursive: true })
  if (state.applied.length === 0) {
    await writeFile(path.join(studentRoot, '.gitignore'), 'target/\n', 'utf8')
    log.push(`创建 student-labs/${safe}/（你的系统从这里开始生长）`)
  }
  await applyLab(studentRoot, next, state, log, explicitVariant, teacher.assignments)
  return { ok: true, lab: next, log }
}

export async function addUserBin(user, name) {
  const safe = sanitizeUser(user)
  if (!safe) return { ok: false, log: ['需要先填写学号/昵称'] }
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(name)) {
    return { ok: false, log: ['bin 名只能用小写字母/数字/下划线，且以字母开头'] }
  }
  const studentRoot = studentRootFor(safe)
  const state = await readState(studentRoot)
  if (!state.applied.includes('lab2')) {
    return { ok: false, log: ['先升级到 lab2（有了用户态）再添加自己的程序'] }
  }
  const log = []
  const rel = `user/src/bin/${name}.rs`
  const target = path.join(studentRoot, rel)
  if (!(await exists(target))) {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(
      target,
      `#![no_std]
#![no_main]

// 你的个性化程序：基于已学的系统调用自由发挥（小游戏、工具、实验都行）。
extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, println};

global_asm!(include_str!("../entry.asm"));

#[no_mangle]
pub fn main() -> ! {
    println("hello from ${name}!");
    exit(0);
}
`,
      'utf8',
    )
    log.push(`新增 ${rel}（你的个性化程序模板）`)
  }
  if (!state.extraBins.includes(name)) state.extraBins.push(name)
  await regenerateManifests(studentRoot, state, log)
  await writeState(studentRoot, state)
  log.push(`✔ ${name} 已登记，运行：cargo build -p user --bin ${name} --release`)
  return { ok: true, log }
}

/* -- CLI --------------------------------------------------------------------- */

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  const [command, arg1, arg2] = process.argv.slice(2)
  const print = (result) => {
    for (const line of result.log || []) console.log(line)
    process.exitCode = result.ok ? 0 : 1
  }
  if (!command || command === 'status') {
    const status = await scaffoldStatus(arg1 || '')
    if (!status.ok) console.log(status.error)
    else
      console.log(
        status.exists
          ? `${status.user} 进度：${status.applied.join(' → ')}${status.next ? `（下一步：${status.next}${status.nextAllowed ? '' : '，未开放'}）` : '（已全部发放）'}`
          : `${status.user} 尚未初始化。`,
      )
  } else if (command === 'init' || command === 'upgrade') {
    print(await applyNext(arg1, arg2))
  } else if (command === 'add-bin') {
    print(await addUserBin(arg1, arg2))
  } else if (command === 'assign') {
    print(await writeAssignment(String(arg1 || ''), String(arg2 || '')))
  } else if (command === 'open') {
    if (!LAB_ORDER.includes(arg1)) {
      console.log(`用法：open <${LAB_ORDER.join('|')}>`)
      process.exitCode = 1
    } else {
      await writeTeacherConfig({ openLab: arg1 })
      console.log(`已开放到 ${arg1}`)
    }
  } else if (command === 'list') {
    for (const s of await listStudents()) {
      console.log(`${s.user}: ${s.applied.join(' → ') || '未初始化'}`)
    }
  } else {
    console.log('用法：status <学号> | init|upgrade <学号> [变体] | add-bin <学号> <名字> | assign <lab> <变体|random> | open <labN> | list')
    process.exitCode = 1
  }
}
