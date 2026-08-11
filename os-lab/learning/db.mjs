/**
 * 账号 / 会话 / 报告 数据库（SQLite，Node 22 内置 node:sqlite，零外部依赖）。
 * 文件：os-lab/learning/os-lab.db（gitignore）。
 *
 * 角色模型：首次启动自动预置管理员账号 admin / admin123（教师，请尽快改密码）；
 * 注册入口只产生学生账号，注册时必须选择老师创建的班级——教师端按班级管理。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
mkdirSync(here, { recursive: true })
const dbPath = process.env.OS_LAB_DB_PATH || path.join(here, 'os-lab.db')
const db = new DatabaseSync(dbPath)
db.exec('PRAGMA foreign_keys = ON;')

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
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
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

function applyMigration(version, sql) {
  if (db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version)) return
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, now())
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// 老库升级：补班级列 / 报告批语列。
try {
  db.exec('ALTER TABLE users ADD COLUMN class_name TEXT NOT NULL DEFAULT ""')
} catch {
  /* 列已存在 */
}

applyMigration('20260728_member_c_run_event_v1', `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  learning_session_id TEXT NOT NULL DEFAULT '',
  lab_id TEXT NOT NULL,
  recipe_id TEXT,
  command_json TEXT NOT NULL,
  workspace_version TEXT NOT NULL,
  trusted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  exit_code INTEGER,
  duration_ms INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  output_hash TEXT,
  output_bytes INTEGER NOT NULL DEFAULT 0,
  output_path TEXT,
  trace_version INTEGER,
  trace_count INTEGER NOT NULL DEFAULT 0,
  trace_hash TEXT,
  trace_path TEXT
);
CREATE INDEX IF NOT EXISTS runs_user_started_idx ON runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS runs_lab_started_idx ON runs(lab_id, started_at DESC);

CREATE TABLE IF NOT EXISTS run_assertions (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  assertion_id TEXT NOT NULL,
  label TEXT NOT NULL,
  passed INTEGER NOT NULL,
  expected TEXT NOT NULL,
  observed TEXT NOT NULL,
  hint TEXT,
  PRIMARY KEY(run_id, assertion_id)
);

CREATE TABLE IF NOT EXISTS events (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  schema_version INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  run_id TEXT REFERENCES runs(id),
  type TEXT NOT NULL,
  stage TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, id)
);
CREATE INDEX IF NOT EXISTS events_user_time_idx ON events(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS events_run_idx ON events(run_id);
`)

applyMigration('20260729_member_c_run_diagnostics_v1', `
CREATE TABLE IF NOT EXISTS run_diagnostics (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  diagnostic_index INTEGER NOT NULL,
  level TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  file TEXT NOT NULL,
  line INTEGER NOT NULL,
  column_number INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  rendered TEXT NOT NULL,
  PRIMARY KEY(run_id, diagnostic_index)
);
CREATE INDEX IF NOT EXISTS run_diagnostics_run_idx ON run_diagnostics(run_id);
`)
applyMigration('20260730_member_c_tutor_state_v1', `
CREATE TABLE IF NOT EXISTS tutor_sessions (
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  current_stage TEXT NOT NULL DEFAULT 'orient',
  hint_level INTEGER NOT NULL DEFAULT 0,
  state_version TEXT NOT NULL DEFAULT 'c3-v1',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, session_id, lab_id)
);
CREATE INDEX IF NOT EXISTS tutor_sessions_user_updated_idx ON tutor_sessions(user_id, updated_at DESC);
`)
applyMigration('20260810_tutor_topic_hints_v1', `
ALTER TABLE tutor_sessions ADD COLUMN current_topic_key TEXT NOT NULL DEFAULT '';
ALTER TABLE tutor_sessions ADD COLUMN current_topic_intent TEXT NOT NULL DEFAULT '';
ALTER TABLE tutor_sessions ADD COLUMN current_topic_anchor TEXT NOT NULL DEFAULT '';

CREATE TABLE tutor_topic_hints (
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  intent TEXT NOT NULL,
  topic_anchor TEXT NOT NULL,
  hint_level INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, session_id, lab_id, topic_key)
);
CREATE INDEX tutor_topic_hints_user_updated_idx ON tutor_topic_hints(user_id, updated_at DESC);
`)
applyMigration('20260730_member_c_assessment_v2', `
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  total INTEGER NOT NULL,
  dimensions_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  trajectory_json TEXT NOT NULL,
  llm_suggestion_json TEXT NOT NULL,
  uncertainty TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assessments_user_session_idx ON assessments(user_id, session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mastery_evidence (
  user_id INTEGER NOT NULL REFERENCES users(id),
  concept_id TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  independent_success INTEGER NOT NULL DEFAULT 0,
  hint_level_used INTEGER NOT NULL DEFAULT 0,
  misconceptions_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  last_assessed_at TEXT NOT NULL,
  PRIMARY KEY(user_id, concept_id)
);
`)
applyMigration('20260730_member_c_review_queue_v1', `
CREATE TABLE IF NOT EXISTS review_queue (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL UNIQUE REFERENCES assessments(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL,
  gate_version TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  gates_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS review_queue_status_created_idx ON review_queue(status, created_at);

CREATE TABLE IF NOT EXISTS review_decisions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES review_queue(id),
  revision INTEGER NOT NULL,
  teacher_user_id INTEGER NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  corrected_result_json TEXT,
  rationale TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(review_id, revision)
);
CREATE INDEX IF NOT EXISTS review_decisions_review_revision_idx ON review_decisions(review_id, revision);
`)
applyMigration('20260807_student_data_v1', `
CREATE TABLE IF NOT EXISTS report_drafts (
  user_id INTEGER NOT NULL REFERENCES users(id),
  lab_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, lab_id)
);
CREATE INDEX IF NOT EXISTS report_drafts_user_updated_idx ON report_drafts(user_id, updated_at DESC);
`)
applyMigration('20260811_final_performance_scores_v1', `
CREATE TABLE IF NOT EXISTS final_performance_scores (
  user_id INTEGER NOT NULL REFERENCES users(id),
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  direction TEXT NOT NULL,
  unit TEXT NOT NULL,
  evidence_run_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  PRIMARY KEY(user_id, metric)
);
CREATE INDEX IF NOT EXISTS final_performance_metric_value_idx
  ON final_performance_scores(metric, direction, value);
`)
try {
  db.exec('ALTER TABLE reports ADD COLUMN feedback TEXT NOT NULL DEFAULT ""')
} catch {
  /* 列已存在 */
}
try {
  db.exec("ALTER TABLE reports ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
} catch {
  /* 列已存在 */
}
try {
  db.exec('ALTER TABLE run_assertions ADD COLUMN hint TEXT')
} catch {
  /* 列已存在 */
}

try {
  db.exec("ALTER TABLE reports ADD COLUMN content_path TEXT NOT NULL DEFAULT ''")
} catch {
  /* column already exists */
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

export function register(username, password, className, allowedClassNames) {
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
  const allowed = Array.isArray(allowedClassNames)
    ? new Set(allowedClassNames.map((item) => String(item || '').trim()))
    : null
  if (allowed && !allowed.has(cls)) {
    return { ok: false, error: allowed.size ? '请从老师创建的班级中选择' : '老师尚未创建班级' }
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

function parseAttachments(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function submitReport(userId, labId, content, attachments = [], contentPath = '') {
  const meta = JSON.stringify(
    (Array.isArray(attachments) ? attachments : []).map((item) => ({
      name: String(item.name || ''),
      mime: String(item.mime || 'application/octet-stream'),
      size: Number(item.size) || 0,
      storedName: String(item.storedName || item.name || ''),
    })),
  )
  db.prepare(
    `INSERT INTO reports (user_id, lab_id, content, updated_at, attachments, content_path) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, lab_id) DO UPDATE SET
       content = excluded.content,
       updated_at = excluded.updated_at,
       attachments = excluded.attachments,
       content_path = excluded.content_path`,
  ).run(userId, labId, content, now(), meta, String(contentPath || ''))
  return { ok: true }
}

export function listMyReports(userId) {
  return db
    .prepare(
      'SELECT lab_id AS labId, updated_at AS updatedAt, feedback, attachments, content_path AS contentPath FROM reports WHERE user_id = ? ORDER BY lab_id',
    )
    .all(userId)
    .map((row) => ({ ...row, attachments: parseAttachments(row.attachments) }))
}

export function listAllReports() {
  return db
    .prepare(
      `SELECT u.username AS user, u.class_name AS className, r.lab_id AS labId, r.updated_at AS updatedAt, r.content, r.feedback, r.attachments, r.content_path AS contentPath
       FROM reports r JOIN users u ON u.id = r.user_id ORDER BY u.class_name, u.username, r.lab_id`,
    )
    .all()
    .map((row) => ({ ...row, attachments: parseAttachments(row.attachments) }))
}

/** 按用户名取某份报告的附件元数据（教师下载用）。 */
export function saveReportDraft(userId, labId, filePath, updatedAt = now()) {
  db.prepare(
    `INSERT INTO report_drafts (user_id, lab_id, file_path, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, lab_id) DO UPDATE SET
       file_path = excluded.file_path,
       updated_at = excluded.updated_at`,
  ).run(userId, labId, String(filePath || ''), updatedAt)
  return { ok: true, updatedAt }
}

export function removeReportDraft(userId, labId) {
  db.prepare('DELETE FROM report_drafts WHERE user_id = ? AND lab_id = ?').run(userId, labId)
  return { ok: true }
}

export function getReportDraftMeta(userId, labId) {
  return db.prepare(
    `SELECT lab_id AS labId, file_path AS filePath, updated_at AS updatedAt
     FROM report_drafts WHERE user_id = ? AND lab_id = ?`,
  ).get(userId, labId) || null
}

export function getReportAttachmentMeta(username, labId) {
  const row = db
    .prepare(
      `SELECT u.id AS userId, r.attachments
       FROM reports r JOIN users u ON u.id = r.user_id
       WHERE u.username = ? AND r.lab_id = ?`,
    )
    .get(String(username || ''), String(labId || ''))
  if (!row) return null
  return { userId: row.userId, attachments: parseAttachments(row.attachments) }
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

export function listStudentUserIds() {
  return db
    .prepare("SELECT id FROM users WHERE role = 'student' ORDER BY id")
    .all()
    .map((row) => Number(row.id))
}

export function listStudentAccounts() {
  return db
    .prepare("SELECT id, username, role, class_name AS className FROM users WHERE role = 'student' ORDER BY id")
    .all()
}

/** 读取服务端可信学习证据，供手册解锁与脚手架发放共同判定。 */
export function getLearningEvidence(userId) {
  const verified = new Set(
    db
      .prepare('SELECT DISTINCT lab_id AS labId FROM runs WHERE user_id = ? AND trusted = 1 AND verified = 1')
      .all(userId)
      .map((row) => row.labId),
  )
  const reflected = new Set(
    db
      .prepare("SELECT DISTINCT lab_id AS labId FROM events WHERE user_id = ? AND type = 'reflection_submitted'")
      .all(userId)
      .map((row) => row.labId),
  )
  return [...new Set([...verified, ...reflected])].map((labId) => ({
    labId,
    verified: verified.has(labId),
    reflected: reflected.has(labId),
  }))
}

export function getTutorSessionState(userId, sessionId, labId) {
  const existing = db
    .prepare(
      `SELECT current_stage AS stage, hint_level AS hintLevel, state_version AS version,
              current_topic_key AS topicKey, current_topic_intent AS topicIntent,
              current_topic_anchor AS topicAnchor, updated_at AS updatedAt
       FROM tutor_sessions WHERE user_id = ? AND session_id = ? AND lab_id = ?`,
    )
    .get(userId, sessionId, labId)
  if (existing) return existing
  const timestamp = now()
  db.prepare(
    `INSERT INTO tutor_sessions (user_id, session_id, lab_id, current_stage, hint_level, state_version, updated_at)
     VALUES (?, ?, ?, 'orient', 0, 'c3-v1', ?)`,
  ).run(userId, sessionId, labId, timestamp)
  return {
    stage: 'orient',
    hintLevel: 0,
    version: 'c3-v1',
    topicKey: '',
    topicIntent: '',
    topicAnchor: '',
    updatedAt: timestamp,
  }
}

export function getTutorTopicHintState(userId, sessionId, labId, topicKey) {
  const safeTopicKey = String(topicKey || '').trim().slice(0, 120)
  if (!safeTopicKey) return { topicKey: '', hintLevel: 0, intent: '', topicAnchor: '' }
  const existing = db
    .prepare(
      `SELECT topic_key AS topicKey, hint_level AS hintLevel, intent, topic_anchor AS topicAnchor,
              updated_at AS updatedAt
       FROM tutor_topic_hints
       WHERE user_id = ? AND session_id = ? AND lab_id = ? AND topic_key = ?`,
    )
    .get(userId, sessionId, labId, safeTopicKey)
  if (existing) return existing
  return { topicKey: safeTopicKey, hintLevel: 0, intent: '', topicAnchor: '' }
}

export function saveTutorSessionState(userId, sessionId, labId, state) {
  const topicKey = String(state.topicKey || '').trim().slice(0, 120)
  const topicIntent = String(state.topicIntent || state.intent || '').trim().slice(0, 40)
  const topicAnchor = String(state.topicAnchor || '').trim().slice(0, 240)
  const timestamp = now()
  db.prepare(
    `INSERT INTO tutor_sessions
       (user_id, session_id, lab_id, current_stage, hint_level, state_version,
        current_topic_key, current_topic_intent, current_topic_anchor, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, session_id, lab_id) DO UPDATE SET
       current_stage = excluded.current_stage,
       hint_level = excluded.hint_level,
       state_version = excluded.state_version,
       current_topic_key = CASE WHEN excluded.current_topic_key = '' THEN tutor_sessions.current_topic_key ELSE excluded.current_topic_key END,
       current_topic_intent = CASE WHEN excluded.current_topic_intent = '' THEN tutor_sessions.current_topic_intent ELSE excluded.current_topic_intent END,
       current_topic_anchor = CASE WHEN excluded.current_topic_key = '' THEN tutor_sessions.current_topic_anchor ELSE excluded.current_topic_anchor END,
       updated_at = excluded.updated_at`,
  ).run(
    userId,
    sessionId,
    labId,
    state.stage,
    state.hintLevel,
    state.version || 'c3-v1',
    topicKey,
    topicIntent,
    topicAnchor,
    timestamp,
  )
  if (topicKey) {
    db.prepare(
      `INSERT INTO tutor_topic_hints
         (user_id, session_id, lab_id, topic_key, intent, topic_anchor, hint_level, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, session_id, lab_id, topic_key) DO UPDATE SET
         intent = excluded.intent,
         topic_anchor = excluded.topic_anchor,
         hint_level = excluded.hint_level,
         updated_at = excluded.updated_at`,
    ).run(userId, sessionId, labId, topicKey, topicIntent, topicAnchor, state.hintLevel, timestamp)
  }
  return { ok: true }
}

export function getTutorEvidenceSummary(userId, sessionId, labId) {
  const eventRows = db
    .prepare(
      `SELECT id, type, occurred_at AS occurredAt, payload_json AS payloadJson
       FROM events WHERE user_id = ? AND session_id = ? AND lab_id = ? ORDER BY occurred_at, row_id`,
    )
    .all(userId, sessionId, labId)
  const counts = {}
  for (const row of eventRows) counts[row.type] = (counts[row.type] || 0) + 1
  const runRows = db
    .prepare(
      `SELECT id AS runId, status, verified, finished_at AS finishedAt, trace_count AS traceCount
       FROM runs WHERE user_id = ? AND learning_session_id = ? AND lab_id = ? AND trusted = 1
       ORDER BY started_at DESC`,
    )
    .all(userId, sessionId, labId)
  const latestRun = runRows[0]
    ? { ...runRows[0], verified: Boolean(runRows[0].verified) }
    : null
  const diagnostics = latestRun
    ? db.prepare('SELECT code, file FROM run_diagnostics WHERE run_id = ? ORDER BY diagnostic_index').all(latestRun.runId)
    : []
  const lastFailureAt = runRows.find((run) => !run.verified && run.finishedAt)?.finishedAt || ''
  const hasSaveAfterLatestFailure = Boolean(
    lastFailureAt && eventRows.some((event) => event.type === 'code_save' && event.occurredAt > lastFailureAt),
  )
  return {
    counts,
    latestRun,
    diagnosticCount: diagnostics.length,
    diagnosticKeys: [...new Set(diagnostics.map((item) => `${item.code || 'diagnostic'}:${item.file || ''}`))].slice(0, 10),
    hasSaveAfterLatestFailure,
    eventIds: eventRows.slice(-20).map((event) => event.id),
  }
}

export function getAssessmentInput(userId, sessionId, labId) {
  const events = db
    .prepare(
      `SELECT payload_json AS payloadJson FROM events
       WHERE user_id = ? AND session_id = ? AND lab_id = ? ORDER BY occurred_at, row_id`,
    )
    .all(userId, sessionId, labId)
    .map((row) => JSON.parse(row.payloadJson))
  const runs = db
    .prepare(
      `SELECT id AS runId, trusted, verified, status, started_at AS startedAt, finished_at AS finishedAt
       FROM runs WHERE user_id = ? AND learning_session_id = ? AND lab_id = ? ORDER BY started_at`,
    )
    .all(userId, sessionId, labId)
    .map((run) => ({
      ...run,
      trusted: Boolean(run.trusted),
      verified: Boolean(run.verified),
      assertions: db
        .prepare(
          `SELECT assertion_id AS id, label, passed, expected, observed, hint
           FROM run_assertions WHERE run_id = ? ORDER BY assertion_id`,
        )
        .all(run.runId)
        .map((assertion) => ({ ...assertion, passed: Boolean(assertion.passed) })),
    }))
  return { events, runs }
}

export function saveAssessment(userId, assessment, masteryUpdates = []) {
  const assessmentId = randomUUID()
  const createdAt = now()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(
      `INSERT INTO assessments
        (id, user_id, session_id, lab_id, rubric_version, total, dimensions_json, items_json,
         trajectory_json, llm_suggestion_json, uncertainty, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      assessmentId,
      userId,
      assessment.sessionId,
      assessment.labId,
      assessment.version,
      assessment.total,
      JSON.stringify(assessment.dimensions),
      JSON.stringify(assessment.items),
      JSON.stringify(assessment.trajectory),
      JSON.stringify(assessment.llmSuggestion),
      assessment.uncertainty,
      createdAt,
    )
    const upsert = db.prepare(
      `INSERT INTO mastery_evidence
        (user_id, concept_id, status, evidence_refs_json, independent_success, hint_level_used,
         misconceptions_json, confidence, assessment_id, last_assessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, concept_id) DO UPDATE SET
         status = excluded.status,
         evidence_refs_json = excluded.evidence_refs_json,
         independent_success = excluded.independent_success,
         hint_level_used = excluded.hint_level_used,
         misconceptions_json = excluded.misconceptions_json,
         confidence = excluded.confidence,
         assessment_id = excluded.assessment_id,
         last_assessed_at = excluded.last_assessed_at`,
    )
    for (const update of masteryUpdates) {
      upsert.run(
        userId,
        update.conceptId,
        update.status,
        JSON.stringify(update.evidenceRefs),
        update.independentSuccess,
        update.hintLevelUsed,
        JSON.stringify(update.misconceptions),
        update.confidence,
        assessmentId,
        createdAt,
      )
    }
    db.exec('COMMIT')
    return { ok: true, assessmentId, createdAt }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function parseReviewRow(row) {
  if (!row) return null
  return {
    reviewId: row.reviewId,
    assessmentId: row.assessmentId,
    student: row.student,
    className: row.className || '',
    sessionId: row.sessionId,
    labId: row.labId,
    status: row.status,
    priority: row.priority,
    gateVersion: row.gateVersion,
    rubricVersion: row.rubricVersion,
    modelVersion: row.modelVersion,
    promptVersion: row.promptVersion,
    gates: JSON.parse(row.gatesJson),
    evidenceRefs: JSON.parse(row.evidenceRefsJson),
    automaticResult: {
      total: row.total,
      dimensions: JSON.parse(row.dimensionsJson),
      items: JSON.parse(row.itemsJson),
      uncertainty: row.uncertainty,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const reviewSelect = `
  SELECT q.id AS reviewId, q.assessment_id AS assessmentId, u.username AS student,
         u.class_name AS className, a.session_id AS sessionId, a.lab_id AS labId,
         q.status, q.priority, q.gate_version AS gateVersion, q.rubric_version AS rubricVersion,
         q.model_version AS modelVersion, q.prompt_version AS promptVersion,
         q.gates_json AS gatesJson, q.evidence_refs_json AS evidenceRefsJson,
         a.total, a.dimensions_json AS dimensionsJson, a.items_json AS itemsJson,
         a.uncertainty, q.created_at AS createdAt, q.updated_at AS updatedAt
  FROM review_queue q JOIN assessments a ON a.id = q.assessment_id
  JOIN users u ON u.id = q.student_user_id`

/** Enqueue gate results without modifying the immutable automatic assessment. */
export function enqueueAssessmentReview(userId, assessmentId, assessment, review) {
  if (!review?.gates?.length) return null
  const owner = db.prepare('SELECT id FROM assessments WHERE id = ? AND user_id = ?').get(assessmentId, userId)
  if (!owner) throw new Error('评价不存在或不属于当前学生')
  const reviewId = randomUUID()
  const timestamp = now()
  const evidenceRefs = [...new Set(review.gates.flatMap((gate) => gate.evidenceRefs || []))]
  const llm = assessment.llmSuggestion || {}
  db.prepare(
    `INSERT INTO review_queue
      (id, assessment_id, student_user_id, status, priority, gate_version, rubric_version,
       model_version, prompt_version, gates_json, evidence_refs_json, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    reviewId,
    assessmentId,
    userId,
    review.requiresReview ? 'hard' : 'soft',
    review.version,
    assessment.version,
    String(llm.model || 'not-requested'),
    String(llm.promptVersion || 'not-requested'),
    JSON.stringify(review.gates),
    JSON.stringify(evidenceRefs),
    timestamp,
    timestamp,
  )
  return { reviewId, status: 'pending', priority: review.requiresReview ? 'hard' : 'soft' }
}

function listReviewDecisions(reviewId) {
  return db.prepare(
    `SELECT d.id AS decisionId, d.revision, u.username AS teacher, d.decision,
            d.corrected_result_json AS correctedResultJson, d.rationale,
            d.evidence_refs_json AS evidenceRefsJson, d.created_at AS createdAt
     FROM review_decisions d JOIN users u ON u.id = d.teacher_user_id
     WHERE d.review_id = ? ORDER BY d.revision`,
  ).all(reviewId).map((row) => ({
    decisionId: row.decisionId,
    revision: row.revision,
    teacher: row.teacher,
    decision: row.decision,
    correctedResult: row.correctedResultJson ? JSON.parse(row.correctedResultJson) : null,
    rationale: row.rationale,
    evidenceRefs: JSON.parse(row.evidenceRefsJson),
    createdAt: row.createdAt,
  }))
}

export function listAssessmentReviews(status = '') {
  const allowedStatus = ['pending', 'confirmed', 'corrected', 'dismissed']
  const rows = allowedStatus.includes(status)
    ? db.prepare(`${reviewSelect} WHERE q.status = ? ORDER BY q.created_at`).all(status)
    : db.prepare(`${reviewSelect} ORDER BY CASE q.status WHEN 'pending' THEN 0 ELSE 1 END, q.created_at`).all()
  return rows.map((row) => {
    const review = parseReviewRow(row)
    return { ...review, decisions: listReviewDecisions(review.reviewId) }
  })
}

export function submitAssessmentReview(teacherUserId, input) {
  const teacher = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher'").get(teacherUserId)
  if (!teacher) return { ok: false, error: '只有教师可以提交复核决定' }
  const row = db.prepare(`${reviewSelect} WHERE q.id = ?`).get(input.reviewId)
  const review = parseReviewRow(row)
  if (!review) return { ok: false, error: '复核项不存在' }
  const decisions = new Set(['confirmed', 'corrected', 'dismissed'])
  if (!decisions.has(input.decision)) return { ok: false, error: '复核决定无效' }
  const rationale = String(input.rationale || '').trim().slice(0, 4000)
  if (!rationale) return { ok: false, error: '复核必须填写理由' }
  const evidenceRefs = [...new Set(Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String) : [])]
  const validRefs = new Set(review.automaticResult.items.flatMap((item) => item.evidenceRefs || []))
  if (evidenceRefs.some((ref) => !validRefs.has(ref))) return { ok: false, error: '复核引用包含不属于原评价的证据' }
  let correctedResult = null
  if (input.decision === 'corrected') {
    const total = Number(input.correctedResult?.total)
    const dimensions = input.correctedResult?.dimensions
    if (!Number.isInteger(total) || total < 0 || total > 100 || !dimensions ||
        ['process', 'result', 'reflection'].some((key) => !Number.isInteger(dimensions[key]) || dimensions[key] < 0 || dimensions[key] > 100)) {
      return { ok: false, error: '教师修正分数必须是 0-100 的整数' }
    }
    correctedResult = { total, dimensions: { process: dimensions.process, result: dimensions.result, reflection: dimensions.reflection } }
  }
  const timestamp = now()
  const revision = Number(db.prepare('SELECT coalesce(max(revision), 0) + 1 AS value FROM review_decisions WHERE review_id = ?').get(review.reviewId).value)
  const decisionId = randomUUID()
  const eventId = randomUUID()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(
      `INSERT INTO review_decisions
        (id, review_id, revision, teacher_user_id, decision, corrected_result_json, rationale, evidence_refs_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(decisionId, review.reviewId, revision, teacherUserId, input.decision,
      correctedResult ? JSON.stringify(correctedResult) : null, rationale, JSON.stringify(evidenceRefs), timestamp)
    db.prepare('UPDATE review_queue SET status = ?, updated_at = ? WHERE id = ?')
      .run(input.decision, timestamp, review.reviewId)
    const event = {
      version: 2,
      id: eventId,
      sessionId: review.sessionId,
      labId: review.labId,
      type: 'teacher_reviewed',
      stage: 'reflect',
      timestamp,
      assessmentId: review.assessmentId,
      reviewId: review.reviewId,
      revision,
      decision: input.decision,
      evidenceRefs,
    }
    db.prepare(
      `INSERT INTO events
        (id, user_id, schema_version, session_id, lab_id, run_id, type, stage, occurred_at, payload_json, created_at)
       VALUES (?, ?, 2, ?, ?, NULL, 'teacher_reviewed', 'reflect', ?, ?, ?)`,
    ).run(eventId, row ? db.prepare('SELECT student_user_id AS id FROM review_queue WHERE id = ?').get(review.reviewId).id : null,
      review.sessionId, review.labId, timestamp, JSON.stringify(event), timestamp)
    db.exec('COMMIT')
    return { ok: true, reviewId: review.reviewId, decisionId, revision, status: input.decision, eventId }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function listMastery(userId) {
  return db
    .prepare(
      `SELECT concept_id AS conceptId, status, evidence_refs_json AS evidenceRefsJson,
              independent_success AS independentSuccess, hint_level_used AS hintLevelUsed,
              misconceptions_json AS misconceptionsJson, confidence, assessment_id AS assessmentId,
              last_assessed_at AS lastAssessedAt
       FROM mastery_evidence WHERE user_id = ? ORDER BY concept_id`,
    )
    .all(userId)
    .map((row) => ({
      conceptId: row.conceptId,
      status: row.status,
      evidenceRefs: JSON.parse(row.evidenceRefsJson),
      independentSuccess: Number(row.independentSuccess),
      hintLevelUsed: Number(row.hintLevelUsed),
      misconceptions: JSON.parse(row.misconceptionsJson),
      confidence: row.confidence,
      assessmentId: row.assessmentId,
      lastAssessedAt: row.lastAssessedAt,
    }))
}

/* -- 学习事件与可信运行链 ---------------------------------------------------- */

export function insertLearningEvents(userId, events) {
  const insert = db.prepare(
    `INSERT INTO events
      (id, user_id, schema_version, session_id, lab_id, run_id, type, stage, occurred_at, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO NOTHING`,
  )
  db.exec('BEGIN IMMEDIATE')
  try {
    let accepted = 0
    for (const event of events) {
      const result = insert.run(
        event.id,
        userId,
        event.version,
        event.sessionId,
        event.labId,
        event.runId || null,
        event.type,
        event.stage,
        event.timestamp,
        JSON.stringify(event),
        now(),
      )
      accepted += Number(result.changes || 0)
    }
    db.exec('COMMIT')
    return { ok: true, accepted }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function createRun(input) {
  db.prepare(
    `INSERT INTO runs
      (id, user_id, learning_session_id, lab_id, recipe_id, command_json, workspace_version, trusted, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
  ).run(
    input.id,
    input.userId,
    input.learningSessionId || '',
    input.labId,
    input.recipeId || null,
    JSON.stringify(input.steps || []),
    input.workspaceVersion,
    input.trusted ? 1 : 0,
    input.startedAt,
  )
  return { ok: true, runId: input.id }
}

export function finishRun(userId, result, diagnostics = []) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const changed = db.prepare(
      `UPDATE runs SET
        status = ?, finished_at = ?, exit_code = ?, duration_ms = ?, verified = ?,
        output_hash = ?, output_bytes = ?, output_path = ?, trace_version = ?,
        trace_count = ?, trace_hash = ?, trace_path = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      result.stopped ? 'stopped' : result.exitCode === 0 ? 'finished' : 'failed',
      result.finishedAt,
      result.exitCode,
      result.durationMs,
      result.verified ? 1 : 0,
      result.output.hash,
      result.output.bytes,
      result.output.path || null,
      result.trace.version,
      result.trace.count,
      result.trace.hash,
      result.trace.path || null,
      result.runId,
      userId,
    )
    if (!changed.changes) throw new Error('运行记录不存在或不属于当前用户')
    const insertAssertion = db.prepare(
      `INSERT INTO run_assertions (run_id, assertion_id, label, passed, expected, observed, hint)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    db.prepare('DELETE FROM run_assertions WHERE run_id = ?').run(result.runId)
    for (const assertion of result.assertions) {
      insertAssertion.run(
        result.runId,
        assertion.id,
        assertion.label,
        assertion.passed ? 1 : 0,
        assertion.expected,
        assertion.observed,
        assertion.hint || null,
      )
    }
    const insertDiagnostic = db.prepare(
      `INSERT INTO run_diagnostics
        (run_id, diagnostic_index, level, code, message, file, line, column_number, end_line, end_column, rendered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    db.prepare('DELETE FROM run_diagnostics WHERE run_id = ?').run(result.runId)
    diagnostics.forEach((diagnostic, index) => {
      insertDiagnostic.run(
        result.runId,
        index,
        diagnostic.level,
        diagnostic.code,
        diagnostic.message,
        diagnostic.file,
        diagnostic.line,
        diagnostic.column,
        diagnostic.endLine,
        diagnostic.endColumn,
        diagnostic.rendered,
      )
    })
    db.exec('COMMIT')
    return { ok: true }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function getRun(userId, runId) {
  const row = db.prepare('SELECT * FROM runs WHERE id = ? AND user_id = ?').get(runId, userId)
  if (!row) return null
  const assertions = db
    .prepare(
      `SELECT assertion_id AS id, label, passed, expected, observed, hint
       FROM run_assertions WHERE run_id = ? ORDER BY assertion_id`,
    )
    .all(runId)
    .map((item) => ({ ...item, passed: Boolean(item.passed) }))
  return {
    version: 1,
    runId: row.id,
    labId: row.lab_id,
    recipeId: row.recipe_id,
    workspaceVersion: row.workspace_version,
    trusted: Boolean(row.trusted),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
    durationMs: row.duration_ms,
    assertions,
    output: { hash: row.output_hash, bytes: row.output_bytes, path: row.output_path },
    trace: { version: row.trace_version, count: row.trace_count, hash: row.trace_hash, path: row.trace_path },
    verified: Boolean(row.verified),
    status: row.status,
  }
}

export function listRunHistory(userId, labId, limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200)
  const rows = db
    .prepare(
      `SELECT id, lab_id AS labId, recipe_id AS recipeId, trusted, status,
              started_at AS startedAt, finished_at AS finishedAt, exit_code AS exitCode, verified
       FROM runs
       WHERE user_id = ? AND lab_id = ?
         AND status != 'running'
       ORDER BY started_at DESC, id DESC
       LIMIT ?`,
    )
    .all(userId, String(labId), safeLimit)
  const assertionStmt = db.prepare(
    `SELECT assertion_id AS id, label, passed, expected, observed, hint
     FROM run_assertions WHERE run_id = ? ORDER BY assertion_id`,
  )
  return rows.map((row) => ({
    runId: row.id,
    labId: row.labId,
    recipeId: row.recipeId,
    trusted: Boolean(row.trusted),
    verified: Boolean(row.verified),
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    exitCode: row.exitCode,
    assertions: assertionStmt.all(row.id).map((item) => ({ ...item, passed: Boolean(item.passed) })),
  }))
}

const FINAL_PERFORMANCE_DIRECTIONS = new Set(['higher', 'lower'])

function upsertFinalPerformanceScore(userId, metric, value, direction, unit, evidenceRunId, note) {
  const existing = db
    .prepare('SELECT value, direction FROM final_performance_scores WHERE user_id = ? AND metric = ?')
    .get(userId, metric)
  const better =
    !existing ||
    (direction === 'higher' ? value > existing.value : value < existing.value)
  if (existing && !better) {
    return { metric, value: existing.value, kept: true }
  }
  db.prepare(
    `INSERT INTO final_performance_scores
       (user_id, metric, value, direction, unit, evidence_run_id, note, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, metric) DO UPDATE SET
       value = excluded.value,
       direction = excluded.direction,
       unit = excluded.unit,
       evidence_run_id = excluded.evidence_run_id,
       note = excluded.note,
       submitted_at = excluded.submitted_at`,
  ).run(userId, metric, value, direction, unit, evidenceRunId, note, now())
  return { metric, value, kept: false }
}

/** 学生提交一次性能打榜成绩；同一指标只保留更优值。 */
export function submitFinalPerformance(userId, input) {
  const metric = String(input?.metric || '').trim().slice(0, 40)
  const value = Number(input?.value)
  const direction = String(input?.direction || '').trim()
  const unit = String(input?.unit || '').trim().slice(0, 20)
  const evidenceRunId = String(input?.evidenceRunId || '').trim().slice(0, 80)
  const note = String(input?.note || '').trim().slice(0, 500)
  if (!metric || !Number.isFinite(value) || !FINAL_PERFORMANCE_DIRECTIONS.has(direction)) {
    return { ok: false, error: '指标、数值或方向无效' }
  }
  if (!unit || !evidenceRunId) {
    return { ok: false, error: '需要填写单位并选择一条运行记录作为证据' }
  }
  const run = db
    .prepare('SELECT status, exit_code FROM runs WHERE id = ? AND user_id = ?')
    .get(evidenceRunId, userId)
  if (!run) return { ok: false, error: '运行记录不存在或不属于当前账号' }
  if (run.status !== 'finished' || run.exit_code !== 0) {
    return { ok: false, error: '只能引用成功结束（exit 0）的运行记录' }
  }

  const result = upsertFinalPerformanceScore(
    userId,
    metric,
    value,
    direction,
    unit,
    evidenceRunId,
    note,
  )
  return { ok: true, ...result }
}

/** 一次运行同时提交五个指标，生成/更新五个榜单。 */
export function submitFinalPerformanceBatch(userId, input) {
  const evidenceRunId = String(input?.evidenceRunId || '').trim().slice(0, 80)
  const note = String(input?.note || '').trim().slice(0, 500)
  const scores = Array.isArray(input?.scores) ? input.scores : []
  if (!evidenceRunId) return { ok: false, error: '需要选择一条运行记录作为证据' }
  if (!scores.length) return { ok: false, error: '需要至少一个指标成绩' }
  const run = db
    .prepare('SELECT status, exit_code FROM runs WHERE id = ? AND user_id = ?')
    .get(evidenceRunId, userId)
  if (!run) return { ok: false, error: '运行记录不存在或不属于当前账号' }
  if (run.status !== 'finished' || run.exit_code !== 0) {
    return { ok: false, error: '只能引用成功结束（exit 0）的运行记录' }
  }
  const results = []
  for (const [index, item] of scores.entries()) {
    const metric = String(item?.metric || '').trim().slice(0, 40)
    const value = Number(item?.value)
    const direction = String(item?.direction || '').trim()
    const unit = String(item?.unit || '').trim().slice(0, 20)
    if (!metric || !Number.isFinite(value) || !FINAL_PERFORMANCE_DIRECTIONS.has(direction) || !unit) {
      return { ok: false, error: `第 ${index + 1} 项指标无效` }
    }
    results.push(
      upsertFinalPerformanceScore(
        userId,
        metric,
        value,
        direction,
        unit,
        evidenceRunId,
        note,
      ),
    )
  }
  return { ok: true, results }
}

/** 教师端打榜视图：按指标分组，越高/越低越靠前。 */
export function listFinalPerformance(metric = '') {
  const rows = db
    .prepare(
      `SELECT u.username AS user, u.class_name AS className,
              s.metric, s.value, s.direction, s.unit,
              s.evidence_run_id AS evidenceRunId, s.note, s.submitted_at AS submittedAt,
              r.verified AS verified, r.trusted AS trusted, r.status AS runStatus
       FROM final_performance_scores s
       JOIN users u ON u.id = s.user_id
       JOIN runs r ON r.id = s.evidence_run_id
       ${metric ? 'WHERE s.metric = ?' : ''}
       ORDER BY s.metric,
         CASE WHEN s.direction = 'higher' THEN -s.value ELSE s.value END ASC`,
    )
    .all(...(metric ? [metric] : []))
  let lastMetric = ''
  let rank = 0
  return rows.map((row) => {
    if (row.metric !== lastMetric) {
      lastMetric = row.metric
      rank = 0
    }
    rank += 1
    return { ...row, rank }
  })
}

/** 学生端回显自己已提交的打榜成绩。 */
export function listMyFinalPerformance(userId) {
  return db
    .prepare(
      `SELECT metric, value, direction, unit,
              evidence_run_id AS evidenceRunId, note, submitted_at AS submittedAt
       FROM final_performance_scores WHERE user_id = ? ORDER BY metric`,
    )
    .all(userId)
}

export function getRunDiagnostics(userId, runId) {
  const run = db
    .prepare('SELECT id, lab_id, workspace_version, status FROM runs WHERE id = ? AND user_id = ?')
    .get(runId, userId)
  if (!run) return null
  const diagnostics = db
    .prepare(
      `SELECT diagnostic_index AS diagnosticIndex, level, code, message, file, line,
              column_number AS column, end_line AS endLine, end_column AS endColumn, rendered
       FROM run_diagnostics WHERE run_id = ? ORDER BY diagnostic_index`,
    )
    .all(runId)
  return {
    runId: run.id,
    labId: run.lab_id,
    workspaceVersion: run.workspace_version,
    status: run.status,
    diagnostics,
  }
}

export function closeLearningDb() {
  db.close()
}
