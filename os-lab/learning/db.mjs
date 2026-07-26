/**
 * 账号 / 会话 / 报告 数据库（SQLite，Node 22 内置 node:sqlite，零外部依赖）。
 * 文件：os-lab/learning/os-lab.db（gitignore）。
 *
 * 角色模型：首次启动自动预置管理员账号 admin / admin123（教师，请尽快改密码）；
 * 注册入口只产生学生账号，注册时必须填写班级——教师端按班级管理。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
mkdirSync(here, { recursive: true })
const db = new DatabaseSync(path.join(here, 'os-lab.db'))

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  lab_id TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, lab_id)
);
`)

const SESSION_DAYS = 30

const USERNAME_RE = /^[A-Za-z0-9_一-龥-]{1,32}$/

function hash(password, salt) {
  return scryptSync(password, salt, 32).toString('hex')
}

function now() {
  return new Date().toISOString()
}

// 老库升级：补班级列 / 报告批语列。
try {
  db.exec('ALTER TABLE users ADD COLUMN class_name TEXT NOT NULL DEFAULT ""')
} catch {
  /* 列已存在 */
}
try {
  db.exec('ALTER TABLE reports ADD COLUMN feedback TEXT NOT NULL DEFAULT ""')
} catch {
  /* 列已存在 */
}

function insertUser(name, password, role, className) {
  const salt = randomBytes(16).toString('hex')
  db.prepare(
    'INSERT INTO users (username, password_hash, salt, role, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(name, hash(password, salt), salt, role, className, now())
}

// 预置管理员：admin / admin123（教师角色）。首次启动创建，请尽快在界面改密码。
if (!db.prepare("SELECT id FROM users WHERE username = 'admin'").get()) {
  insertUser('admin', 'admin123', 'teacher', '')
}

export function register(username, password, className) {
  const name = String(username || '').trim()
  const cls = String(className || '').trim()
  if (!USERNAME_RE.test(name)) {
    return { ok: false, error: '用户名需为 1-32 位字母、数字、中文、_ 或 -' }
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return { ok: false, error: '密码至少 6 位（最多 72 位）' }
  }
  if (!/^[A-Za-z0-9_一-龥-]{1,32}$/.test(cls)) {
    return { ok: false, error: '请填写班级（1-32 位，如 计科2301）' }
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(name)
  if (exists) return { ok: false, error: '用户名已被注册' }
  insertUser(name, password, 'student', cls)
  return { ...login(name, password), registered: true }
}

/** 登录状态下修改自己的密码（admin 首登后应立即使用）。 */
export function changePassword(userId, oldPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!user) return { ok: false, error: '用户不存在' }
  const expected = Buffer.from(user.password_hash, 'hex')
  const actual = Buffer.from(hash(String(oldPassword || ''), user.salt), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: '原密码不正确' }
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 72) {
    return { ok: false, error: '新密码至少 6 位' }
  }
  const salt = randomBytes(16).toString('hex')
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
    .run(hash(newPassword, salt), salt, userId)
  return { ok: true }
}

export function login(username, password) {
  const name = String(username || '').trim()
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(name)
  if (!user) return { ok: false, error: '用户名或密码不正确' }
  const expected = Buffer.from(user.password_hash, 'hex')
  const actual = Buffer.from(hash(String(password || ''), user.salt), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: '用户名或密码不正确' }
  }
  const token = randomUUID()
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, user.id, now(), expires)
  return { ok: true, token, username: user.username, role: user.role, className: user.class_name || '' }
}

export function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(String(token))
  return { ok: true }
}

/** 从请求 token 解析登录用户；无效/过期返回 null。 */
export function resolveSession(token) {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.class_name, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    )
    .get(String(token))
  if (!row) return null
  if (row.expires_at < now()) {
    logout(token)
    return null
  }
  return { id: row.id, username: row.username, role: row.role, className: row.class_name || '' }
}

/* -- 学生报告 ---------------------------------------------------------------- */

export function submitReport(userId, labId, content) {
  db.prepare(
    `INSERT INTO reports (user_id, lab_id, content, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, lab_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
  ).run(userId, labId, content, now())
  return { ok: true }
}

export function listMyReports(userId) {
  return db
    .prepare(
      'SELECT lab_id AS labId, updated_at AS updatedAt, feedback FROM reports WHERE user_id = ? ORDER BY lab_id',
    )
    .all(userId)
}

export function listAllReports() {
  return db
    .prepare(
      `SELECT u.username AS user, u.class_name AS className, r.lab_id AS labId, r.updated_at AS updatedAt, r.content, r.feedback
       FROM reports r JOIN users u ON u.id = r.user_id ORDER BY u.class_name, u.username, r.lab_id`,
    )
    .all()
}

/** 教师批阅：给某学生某 Lab 的报告写批语。 */
export function setReportFeedback(username, labId, feedback) {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(String(username || ''))
  if (!user) return { ok: false, error: '学生不存在' }
  const changed = db
    .prepare('UPDATE reports SET feedback = ? WHERE user_id = ? AND lab_id = ?')
    .run(String(feedback || '').slice(0, 8000), user.id, String(labId || ''))
  return changed.changes > 0 ? { ok: true } : { ok: false, error: '该报告不存在' }
}

export function listUsers() {
  return db
    .prepare('SELECT username, role, class_name AS className, created_at AS createdAt FROM users ORDER BY class_name, username')
    .all()
}
