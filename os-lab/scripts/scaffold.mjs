#!/usr/bin/env node
/**
 * 学生工作区脚手架：把完整参考实现（os-lab/）按 Lab 渐进发放到 student-lab/。
 *
 * 设计原则：
 *  1. 学生初始只拿到能构建最小系统的 Lab1 代码；每完成一层再「升级」注入下一层
 *     的必要新文件——整个系统随学习进度逐渐长大，而不是一开始就是完整答案。
 *  2. 升级永不覆盖学生已有文件：学生对自己系统的所有修改、扩展（bonus 小游戏、
 *     自定义用户程序等）都会保留，每个人的系统因此可以个性化生长。
 *  3. 核心学习点不发参考实现，而发 scaffold/exercises/ 里的挖空版（TODO 任务），
 *     学生补全后系统才能继续运行。
 *  4. 三个清单文件（根/kernel/user 的 Cargo.toml）属于框架，按当前进度生成并覆盖，
 *     学生不应手工修改它们（新增自己的用户程序用 `node scripts/scaffold.mjs add-bin <名字>`）。
 *
 * 用法（在 os-lab/ 下执行，或经工作台「我的系统」按钮）：
 *   node scripts/scaffold.mjs status        查看学生工作区进度
 *   node scripts/scaffold.mjs init         初始化（发放 Lab1）
 *   node scripts/scaffold.mjs upgrade      升级到下一个 Lab
 *   node scripts/scaffold.mjs add-bin xxx  登记学生自建的用户程序 bin（个性化扩展）
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'

const OS_LAB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const STUDENT_ROOT = path.resolve(OS_LAB_ROOT, '..', 'student-lab')
const EXERCISE_ROOT = path.join(OS_LAB_ROOT, 'scaffold', 'exercises')
const STATE_FILE = '.scaffold-state.json'

export const LAB_ORDER = ['lab1', 'lab2', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8']

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

/** 核心学习点的挖空版（相对 student-lab/ 的路径 → scaffold/exercises/<lab>/ 同路径）。 */
const EXERCISES = {
  lab2: ['kernel/src/task.rs'],
}

/* -- 状态 ------------------------------------------------------------------- */

export async function readState() {
  try {
    const raw = await readFile(path.join(STUDENT_ROOT, STATE_FILE), 'utf8')
    const state = JSON.parse(raw)
    return {
      applied: Array.isArray(state.applied) ? state.applied.filter((l) => LAB_ORDER.includes(l)) : [],
      extraBins: Array.isArray(state.extraBins) ? state.extraBins : [],
    }
  } catch {
    return { applied: [], extraBins: [] }
  }
}

async function writeState(state) {
  await writeFile(
    path.join(STUDENT_ROOT, STATE_FILE),
    `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
}

export async function scaffoldStatus() {
  const state = await readState()
  const current = state.applied[state.applied.length - 1] || null
  const next = LAB_ORDER[state.applied.length] || null
  return {
    root: 'student-lab',
    exists: state.applied.length > 0,
    applied: state.applied,
    current,
    next,
    nextSummary: next ? LABS[next].summary : null,
    extraBins: state.extraBins,
  }
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
async function copyDirNoOverwrite(src, dst, log) {
  await mkdir(dst, { recursive: true })
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (entry.name === 'target' || entry.name.startsWith('.')) continue
    const from = path.join(src, entry.name)
    const to = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDirNoOverwrite(from, to, log)
    } else if (await exists(to)) {
      log.push(`保留 ${path.relative(STUDENT_ROOT, to)}（已存在，未覆盖）`)
    } else {
      await cp(from, to)
      log.push(`新增 ${path.relative(STUDENT_ROOT, to)}`)
    }
  }
}

async function copyFileNoOverwrite(src, dst, log, note = '') {
  if (await exists(dst)) {
    log.push(`保留 ${path.relative(STUDENT_ROOT, dst)}（已存在，未覆盖）`)
    return
  }
  await mkdir(path.dirname(dst), { recursive: true })
  await cp(src, dst)
  log.push(`新增 ${path.relative(STUDENT_ROOT, dst)}${note}`)
}

/* -- 清单文件生成 ------------------------------------------------------------ */

function labsUpTo(labId) {
  return LAB_ORDER.slice(0, LAB_ORDER.indexOf(labId) + 1)
}

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
  // yield 是关键字，真实 bin 文件名是 yield.rs、bin 名为 yield —— 与参考实现一致。
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

async function regenerateManifests(state, log) {
  const { applied, extraBins } = state
  await writeFile(path.join(STUDENT_ROOT, 'Cargo.toml'), rootCargoToml(applied), 'utf8')
  await writeFile(path.join(STUDENT_ROOT, 'kernel', 'Cargo.toml'), kernelCargoToml(applied), 'utf8')
  if (applied.includes('lab2')) {
    await writeFile(path.join(STUDENT_ROOT, 'user', 'Cargo.toml'), userCargoToml(applied, extraBins), 'utf8')
  }
  log.push('更新 Cargo.toml 清单（框架文件，按进度生成）')
}

/* -- 应用一个 Lab ------------------------------------------------------------ */

async function applyLab(labId, state, log) {
  const lab = LABS[labId]
  const exercisePaths = new Set(EXERCISES[labId] || [])

  for (const file of lab.rootFiles || []) {
    await copyFileNoOverwrite(path.join(OS_LAB_ROOT, file), path.join(STUDENT_ROOT, file), log)
  }
  for (const crate of lab.crates || []) {
    await copyDirNoOverwrite(path.join(OS_LAB_ROOT, crate), path.join(STUDENT_ROOT, crate), log)
  }
  for (const file of lab.kernel || []) {
    const rel = `kernel/${file}`
    if (exercisePaths.has(rel)) continue
    await copyFileNoOverwrite(path.join(OS_LAB_ROOT, rel), path.join(STUDENT_ROOT, rel), log)
  }
  if (lab.userBase) {
    for (const file of ['build.rs', 'linker.ld', 'src/entry.asm', 'src/lib.rs', 'src/syscall.rs']) {
      const src = path.join(OS_LAB_ROOT, 'user', file)
      if (await exists(src)) {
        await copyFileNoOverwrite(src, path.join(STUDENT_ROOT, 'user', file), log)
      }
    }
  }
  for (const bin of lab.userBins || []) {
    const rel = `user/src/bin/${bin}.rs`
    if (exercisePaths.has(rel)) continue
    await copyFileNoOverwrite(path.join(OS_LAB_ROOT, rel), path.join(STUDENT_ROOT, rel), log)
  }
  // 挖空任务：来自 scaffold/exercises/，替代参考实现发放。
  for (const rel of exercisePaths) {
    const overlay = path.join(EXERCISE_ROOT, labId, rel)
    if (await exists(overlay)) {
      await copyFileNoOverwrite(overlay, path.join(STUDENT_ROOT, rel), log, '（含 TODO 任务，需要你补全）')
    } else {
      await copyFileNoOverwrite(path.join(OS_LAB_ROOT, rel), path.join(STUDENT_ROOT, rel), log)
    }
  }

  state.applied.push(labId)
  await regenerateManifests(state, log)
  await writeState(state)
  log.push(`✔ ${labId} 已就位：${lab.summary}`)
}

/* -- 对外命令 ---------------------------------------------------------------- */

export async function applyNext() {
  const state = await readState()
  const next = LAB_ORDER[state.applied.length]
  if (!next) return { ok: false, log: ['八个 Lab 已全部发放，剩下的完善由你自由发挥。'] }
  const log = []
  await mkdir(STUDENT_ROOT, { recursive: true })
  if (state.applied.length === 0) {
    await writeFile(path.join(STUDENT_ROOT, '.gitignore'), 'target/\n', 'utf8')
    log.push('创建 student-lab/（你的系统从这里开始生长）')
  }
  await applyLab(next, state, log)
  return { ok: true, lab: next, log }
}

export async function addUserBin(name) {
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(name)) {
    return { ok: false, log: ['bin 名只能用小写字母/数字/下划线，且以字母开头'] }
  }
  const state = await readState()
  if (!state.applied.includes('lab2')) {
    return { ok: false, log: ['先升级到 lab2（有了用户态）再添加自己的程序'] }
  }
  const log = []
  const rel = `user/src/bin/${name}.rs`
  const target = path.join(STUDENT_ROOT, rel)
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
  await regenerateManifests(state, log)
  await writeState(state)
  log.push(`✔ ${name} 已登记，运行：cargo build -p user --bin ${name} --release`)
  return { ok: true, log }
}

/* -- CLI --------------------------------------------------------------------- */

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  const command = process.argv[2] || 'status'
  if (command === 'status') {
    const status = await scaffoldStatus()
    console.log(
      status.exists
        ? `student-lab 进度：${status.applied.join(' → ')}${status.next ? `（下一步：${status.next} · ${status.nextSummary}）` : '（已全部发放）'}`
        : `student-lab 尚未初始化。运行 node scripts/scaffold.mjs init 发放 Lab1。`,
    )
  } else if (command === 'init' || command === 'upgrade') {
    const result = await applyNext()
    for (const line of result.log) console.log(line)
    process.exitCode = result.ok ? 0 : 1
  } else if (command === 'add-bin') {
    const result = await addUserBin(String(process.argv[3] || ''))
    for (const line of result.log) console.log(line)
    process.exitCode = result.ok ? 0 : 1
  } else {
    console.log('用法：node scripts/scaffold.mjs status|init|upgrade|add-bin <名字>')
    process.exitCode = 1
  }
}
