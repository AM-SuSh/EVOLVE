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
applyMigration('20260812_socratic_review_v1', `
CREATE TABLE IF NOT EXISTS socratic_reviews (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_version TEXT NOT NULL,
  source_assessment_id TEXT,
  max_questions INTEGER NOT NULL,
  plan_json TEXT NOT NULL,
  final_summary TEXT NOT NULL DEFAULT '',
  transcript_markdown TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS socratic_reviews_user_lab_idx
  ON socratic_reviews(user_id, session_id, lab_id, created_at DESC);

CREATE TABLE IF NOT EXISTS socratic_review_turns (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES socratic_reviews(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  objective TEXT NOT NULL,
  prompt TEXT NOT NULL,
  reason TEXT NOT NULL,
  pass_criteria_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  requires_run_evidence INTEGER NOT NULL DEFAULT 0,
  parent_turn_id TEXT REFERENCES socratic_review_turns(id),
  student_answer TEXT NOT NULL DEFAULT '',
  answer_event_ref TEXT NOT NULL DEFAULT '',
  evaluation_json TEXT,
  asked_at TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(review_id, ordinal),
  UNIQUE(review_id, question_id)
);
CREATE INDEX IF NOT EXISTS socratic_review_turns_review_idx
  ON socratic_review_turns(review_id, ordinal);

CREATE TABLE IF NOT EXISTS mastery_observations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  misconceptions_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mastery_observations_user_concept_idx
  ON mastery_observations(user_id, concept_id, created_at DESC);
`)
applyMigration('20260812_tutor_followup_throttle_v1', `
CREATE TABLE IF NOT EXISTS tutor_followup_sessions (
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL DEFAULT 0,
  last_check_turn INTEGER NOT NULL DEFAULT -10,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, session_id, lab_id)
);

CREATE TABLE IF NOT EXISTS tutor_topic_checks (
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  lab_id TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  topic_turn_count INTEGER NOT NULL DEFAULT 0,
  check_count INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, session_id, lab_id, topic_key)
);
`)
applyMigration('20260812_socratic_review_lifecycle_v1', `
ALTER TABLE reports ADD COLUMN review_grandfathered INTEGER NOT NULL DEFAULT 0;
UPDATE reports SET review_grandfathered = 1;
`)
applyMigration('20260812_report_acceptance_v1', `
CREATE TABLE IF NOT EXISTS report_acceptances (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  lab_id TEXT NOT NULL,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  revision INTEGER NOT NULL,
  teacher_user_id INTEGER NOT NULL REFERENCES users(id),
  final_score_json TEXT NOT NULL,
  feedback TEXT NOT NULL,
  acceptance_advice TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, lab_id, revision)
);
CREATE INDEX IF NOT EXISTS report_acceptances_user_lab_revision_idx
  ON report_acceptances(user_id, lab_id, revision DESC);
CREATE INDEX IF NOT EXISTS report_acceptances_assessment_idx
  ON report_acceptances(assessment_id, revision DESC);
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
      `WITH queue AS (
         SELECT user_id, lab_id FROM reports
         UNION
         SELECT user_id, lab_id FROM socratic_reviews
       ), latest_reviews AS (
         SELECT user_id, lab_id, status, updated_at,
                ROW_NUMBER() OVER (PARTITION BY user_id, lab_id ORDER BY created_at DESC) AS position
         FROM socratic_reviews
       )
       SELECT u.username AS user, u.class_name AS className, q.lab_id AS labId,
              COALESCE(r.updated_at, sr.updated_at) AS updatedAt,
              COALESCE(r.content, '') AS content, COALESCE(r.feedback, '') AS feedback,
              COALESCE(r.attachments, '[]') AS attachments, COALESCE(r.content_path, '') AS contentPath,
              COALESCE(r.review_grandfathered, 0) AS reviewGrandfathered,
              CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS hasReport,
              COALESCE(sr.status, '') AS reviewStatus, COALESCE(sr.updated_at, '') AS reviewUpdatedAt
       FROM queue q
       JOIN users u ON u.id = q.user_id AND u.role = 'student'
       LEFT JOIN reports r ON r.user_id = q.user_id AND r.lab_id = q.lab_id
       LEFT JOIN latest_reviews sr
         ON sr.user_id = q.user_id AND sr.lab_id = q.lab_id AND sr.position = 1
       ORDER BY u.class_name, u.username, q.lab_id`,
    )
    .all()
    .map((row) => ({
      ...row,
      attachments: parseAttachments(row.attachments),
      reviewGrandfathered: Boolean(row.reviewGrandfathered),
      hasReport: Boolean(row.hasReport),
    }))
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

function parseAssessmentRow(row) {
  if (!row) return null
  return {
    assessmentId: row.assessmentId,
    sessionId: row.sessionId,
    labId: row.labId,
    rubricVersion: row.rubricVersion,
    automaticResult: {
      total: row.total,
      dimensions: JSON.parse(row.dimensionsJson),
      items: JSON.parse(row.itemsJson),
      uncertainty: row.uncertainty,
    },
    trajectory: JSON.parse(row.trajectoryJson),
    llmSuggestion: JSON.parse(row.llmSuggestionJson),
    createdAt: row.createdAt,
  }
}

const reportAssessmentSelect = `
  SELECT id AS assessmentId, session_id AS sessionId, lab_id AS labId,
         rubric_version AS rubricVersion, total, dimensions_json AS dimensionsJson,
         items_json AS itemsJson, trajectory_json AS trajectoryJson,
         llm_suggestion_json AS llmSuggestionJson, uncertainty, created_at AS createdAt
  FROM assessments`

function parseReportAcceptanceRow(row, currentAssessmentId = '') {
  if (!row) return null
  return {
    acceptanceId: row.acceptanceId,
    assessmentId: row.assessmentId,
    revision: row.revision,
    teacher: row.teacher,
    finalScore: JSON.parse(row.finalScoreJson),
    feedback: row.feedback,
    acceptanceAdvice: row.acceptanceAdvice,
    createdAt: row.createdAt,
    isCurrentAssessment: row.assessmentId === currentAssessmentId,
  }
}

const reportAcceptanceSelect = `
  SELECT ra.id AS acceptanceId, ra.assessment_id AS assessmentId, ra.revision,
         u.username AS teacher, ra.final_score_json AS finalScoreJson,
         ra.feedback, ra.acceptance_advice AS acceptanceAdvice, ra.created_at AS createdAt
  FROM report_acceptances ra JOIN users u ON u.id = ra.teacher_user_id`

/** Teacher acceptance bundle: latest automatic assessment, optional legacy review and immutable acceptance history. */
export function getReportAssessment(username, labId) {
  const student = db.prepare(
    "SELECT id, username, class_name AS className FROM users WHERE username = ? AND role = 'student'",
  ).get(String(username || ''))
  if (!student) return null
  const normalizedLabId = String(labId || '')
  const report = db.prepare(
    'SELECT id, feedback, updated_at AS updatedAt FROM reports WHERE user_id = ? AND lab_id = ?',
  ).get(student.id, normalizedLabId)
  const assessment = parseAssessmentRow(db.prepare(
    `${reportAssessmentSelect}
     WHERE user_id = ? AND lab_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).get(student.id, normalizedLabId))
  const assessmentReview = assessment
    ? (() => {
        const review = parseReviewRow(db.prepare(`${reviewSelect} WHERE q.assessment_id = ?`).get(assessment.assessmentId))
        return review ? { ...review, decisions: listReviewDecisions(review.reviewId) } : null
      })()
    : null
  const acceptanceRows = db.prepare(
    `${reportAcceptanceSelect}
     WHERE ra.user_id = ? AND ra.lab_id = ? ORDER BY ra.revision DESC`,
  ).all(student.id, normalizedLabId)
  const acceptanceHistory = acceptanceRows.map((row) =>
    parseReportAcceptanceRow(row, assessment?.assessmentId || ''),
  )
  return {
    user: student.username,
    className: student.className || '',
    labId: normalizedLabId,
    hasReport: Boolean(report),
    reportUpdatedAt: report?.updatedAt || null,
    reportFeedback: report?.feedback || '',
    assessment,
    assessmentReview,
    acceptance: acceptanceHistory.find((item) => item.isCurrentAssessment) || null,
    acceptanceHistory,
  }
}

function normalizeFinalScore(input) {
  const total = Number(input?.total)
  const dimensions = input?.dimensions
  if (!Number.isInteger(total) || total < 0 || total > 100 || !dimensions ||
      ['process', 'result', 'reflection'].some((key) =>
        !Number.isInteger(Number(dimensions[key])) || Number(dimensions[key]) < 0 || Number(dimensions[key]) > 100,
      )) return null
  return {
    total,
    dimensions: {
      process: Number(dimensions.process),
      result: Number(dimensions.result),
      reflection: Number(dimensions.reflection),
    },
  }
}

/** Append a teacher acceptance revision without mutating the linked automatic assessment. */
export function submitReportAcceptance(teacherUserId, input) {
  const teacher = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher'").get(teacherUserId)
  if (!teacher) return { ok: false, error: '只有教师可以提交最终验收' }
  const student = db.prepare(
    "SELECT id FROM users WHERE username = ? AND role = 'student'",
  ).get(String(input?.user || ''))
  if (!student) return { ok: false, error: '学生不存在' }
  const labId = String(input?.labId || '')
  const report = db.prepare(
    'SELECT id FROM reports WHERE user_id = ? AND lab_id = ?',
  ).get(student.id, labId)
  if (!report) return { ok: false, error: '学生尚未提交该实验报告' }
  const assessmentId = String(input?.assessmentId || '')
  const finalScore = normalizeFinalScore(input?.finalScore)
  if (!finalScore) return { ok: false, error: '教师最终评分必须是 0-100 的整数' }
  const feedback = String(input?.feedback || '').trim().slice(0, 8_000)
  const acceptanceAdvice = String(input?.acceptanceAdvice || '').trim().slice(0, 8_000)
  if (!feedback) return { ok: false, error: '最终验收必须填写报告反馈' }
  if (!acceptanceAdvice) return { ok: false, error: '最终验收必须填写验收建议' }
  const timestamp = now()
  const acceptanceId = randomUUID()
  const eventId = randomUUID()
  db.exec('BEGIN IMMEDIATE')
  try {
    const latestAssessment = db.prepare(
      `${reportAssessmentSelect}
       WHERE user_id = ? AND lab_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get(student.id, labId)
    if (!latestAssessment) {
      db.exec('ROLLBACK')
      return { ok: false, error: '该学生当前实验尚无自动评价' }
    }
    if (assessmentId !== latestAssessment.assessmentId) {
      db.exec('ROLLBACK')
      return { ok: false, error: '自动评价已更新，请刷新后重新验收' }
    }
    const revision = Number(db.prepare(
      'SELECT coalesce(max(revision), 0) + 1 AS value FROM report_acceptances WHERE user_id = ? AND lab_id = ?',
    ).get(student.id, labId).value)
    db.prepare(
      `INSERT INTO report_acceptances
        (id, user_id, lab_id, report_id, assessment_id, revision, teacher_user_id,
         final_score_json, feedback, acceptance_advice, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      acceptanceId, student.id, labId, report.id, assessmentId, revision, teacherUserId,
      JSON.stringify(finalScore), feedback, acceptanceAdvice, timestamp,
    )
    db.prepare('UPDATE reports SET feedback = ? WHERE id = ?').run(feedback, report.id)
    const event = {
      version: 2,
      id: eventId,
      sessionId: latestAssessment.sessionId,
      labId,
      type: 'teacher_reviewed',
      stage: 'reflect',
      timestamp,
      rubricVersion: latestAssessment.rubricVersion,
      decision: 'accepted',
      comment: feedback,
      metadata: { assessmentId, acceptanceId, revision, finalScore, acceptanceAdvice },
    }
    db.prepare(
      `INSERT INTO events
        (id, user_id, schema_version, session_id, lab_id, run_id, type, stage, occurred_at, payload_json, created_at)
       VALUES (?, ?, 2, ?, ?, NULL, 'teacher_reviewed', 'reflect', ?, ?, ?)`,
    ).run(eventId, student.id, latestAssessment.sessionId, labId, timestamp, JSON.stringify(event), timestamp)
    db.exec('COMMIT')
    return { ok: true, acceptanceId, assessmentId, revision, eventId, acceptedAt: timestamp }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function listUsers() {
  return db
    .prepare('SELECT username, role, class_name AS className, created_at AS createdAt FROM users ORDER BY class_name, username')
    .all()
}

const CLASS_NAME_RE = /^[A-Za-z0-9_一-龥-]{1,32}$/

function requireStudent(username) {
  const name = String(username || '').trim()
  if (!USERNAME_RE.test(name)) return { ok: false, error: '用户名无效' }
  const user = db.prepare('SELECT id, username, role, class_name AS className FROM users WHERE username = ?').get(name)
  if (!user) return { ok: false, error: '用户不存在' }
  if (user.role !== 'student') return { ok: false, error: '只能管理学生账号' }
  return { ok: true, user }
}

/** 教师把学生调到已有班级。 */
export function setStudentClassName(username, className) {
  const checked = requireStudent(username)
  if (!checked.ok) return checked
  const cls = String(className || '').trim()
  if (!CLASS_NAME_RE.test(cls)) return { ok: false, error: '班级名需为 1-32 位字母、数字、中文、_ 或 -' }
  db.prepare('UPDATE users SET class_name = ? WHERE id = ?').run(cls, checked.user.id)
  return { ok: true, username: checked.user.username, className: cls }
}

/** 教师重置学生密码（无需原密码）。 */
export function resetStudentPassword(username, newPassword) {
  const checked = requireStudent(username)
  if (!checked.ok) return checked
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 72) {
    return { ok: false, error: '新密码至少 6 位（最多 72 位）' }
  }
  const salt = randomBytes(16).toString('hex')
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
    .run(hash(newPassword, salt), salt, checked.user.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(checked.user.id)
  return { ok: true, username: checked.user.username }
}

/** 删除尚无学习记录的学生账号；已有 runs/报告等关联数据时拒绝。 */
export function deleteStudentAccount(username) {
  const checked = requireStudent(username)
  if (!checked.ok) return checked
  const id = checked.user.id
  const checks = [
    ['runs', 'user_id'],
    ['reports', 'user_id'],
    ['events', 'user_id'],
    ['tutor_sessions', 'user_id'],
    ['assessments', 'user_id'],
    ['mastery_evidence', 'user_id'],
    ['review_queue', 'student_user_id'],
    ['socratic_reviews', 'user_id'],
    ['mastery_observations', 'user_id'],
    ['tutor_followup_sessions', 'user_id'],
    ['tutor_topic_checks', 'user_id'],
    ['report_acceptances', 'user_id'],
    ['report_drafts', 'user_id'],
    ['final_performance_scores', 'user_id'],
  ]
  for (const [table, column] of checks) {
    try {
      const row = db.prepare(`SELECT 1 AS hit FROM ${table} WHERE ${column} = ? LIMIT 1`).get(id)
      if (row) {
        return { ok: false, error: '该账号已有学习记录，暂不能删除。可改班级或重置密码。' }
      }
    } catch {
      /* 部分表在旧库可能不存在，忽略 */
    }
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    return { ok: false, error: error instanceof Error ? error.message : '删除失败' }
  }
  return { ok: true, username: checked.user.username }
}

/** 批量把用户表中的班级名从 oldName 改成 newName。 */
export function renameUserClassName(oldName, newName) {
  const from = String(oldName || '').trim()
  const to = String(newName || '').trim()
  if (!CLASS_NAME_RE.test(from) || !CLASS_NAME_RE.test(to)) {
    return { ok: false, error: '班级名需为 1-32 位字母、数字、中文、_ 或 -' }
  }
  if (from === to) return { ok: true, updated: 0, from, to }
  const result = db.prepare('UPDATE users SET class_name = ? WHERE class_name = ? AND role = ?').run(to, from, 'student')
  return { ok: true, updated: Number(result.changes || 0), from, to }
}

export function countStudentsInClass(className) {
  const cls = String(className || '').trim()
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'student' AND class_name = ?")
    .get(cls)
  return Number(row?.count || 0)
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
  const reviewCompleted = new Set(
    db
      .prepare("SELECT DISTINCT lab_id AS labId FROM socratic_reviews WHERE user_id = ? AND status = 'review_completed'")
      .all(userId)
      .map((row) => row.labId),
  )
  // Reflection events created before this migration belong to the former free-text
  // workflow. They remain valid only to avoid relocking existing student progress.
  const lifecycleMigration = db
    .prepare("SELECT applied_at AS appliedAt FROM schema_migrations WHERE version = '20260812_socratic_review_lifecycle_v1'")
    .get()
  const legacyReflected = new Set(
    db
      .prepare(
        "SELECT DISTINCT lab_id AS labId FROM events WHERE user_id = ? AND type = 'reflection_submitted' AND created_at < ?",
      )
      .all(userId, lifecycleMigration?.appliedAt || '')
      .map((row) => row.labId),
  )
  return [...new Set([...verified, ...reviewCompleted, ...legacyReflected])].map((labId) => ({
    labId,
    verified: verified.has(labId),
    reviewCompleted: reviewCompleted.has(labId),
    legacyReflected: legacyReflected.has(labId),
    // `reflected` is retained for older callers. New lifecycle decisions must use
    // reviewCompleted or legacyReflected explicitly.
    reflected: reviewCompleted.has(labId) || legacyReflected.has(labId),
  }))
}

/** A pre-review report keeps its submission entitlement when re-submitted. */
export function isReportReviewGrandfathered(userId, labId) {
  const row = db
    .prepare('SELECT review_grandfathered AS reviewGrandfathered FROM reports WHERE user_id = ? AND lab_id = ?')
    .get(userId, String(labId || ''))
  return Boolean(row?.reviewGrandfathered)
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

function parseSocraticReviewRow(row) {
  if (!row) return null
  const turns = db
    .prepare(
      `SELECT id, ordinal, question_id AS questionId, concept_id AS conceptId, kind, objective,
              prompt, reason, pass_criteria_json AS passCriteriaJson,
              evidence_refs_json AS evidenceRefsJson, requires_run_evidence AS requiresRunEvidence,
              parent_turn_id AS parentTurnId, student_answer AS studentAnswer,
              answer_event_ref AS answerEventRef, evaluation_json AS evaluationJson,
              asked_at AS askedAt, answered_at AS answeredAt, created_at AS createdAt
       FROM socratic_review_turns WHERE review_id = ? ORDER BY ordinal`,
    )
    .all(row.id)
    .map((turn) => ({
      id: turn.id,
      ordinal: turn.ordinal,
      questionId: turn.questionId,
      conceptId: turn.conceptId,
      kind: turn.kind,
      objective: turn.objective,
      prompt: turn.prompt,
      reason: turn.reason,
      passCriteria: JSON.parse(turn.passCriteriaJson),
      evidenceRefs: JSON.parse(turn.evidenceRefsJson),
      requiresRunEvidence: Boolean(turn.requiresRunEvidence),
      parentTurnId: turn.parentTurnId || null,
      studentAnswer: turn.studentAnswer,
      answerEventRef: turn.answerEventRef,
      evaluation: turn.evaluationJson ? JSON.parse(turn.evaluationJson) : null,
      askedAt: turn.askedAt,
      answeredAt: turn.answeredAt,
      createdAt: turn.createdAt,
    }))
  return {
    reviewId: row.id,
    sessionId: row.sessionId,
    labId: row.labId,
    status: row.status,
    planVersion: row.planVersion,
    sourceAssessmentId: row.sourceAssessmentId || '',
    maxQuestions: row.maxQuestions,
    plan: JSON.parse(row.planJson),
    finalSummary: row.finalSummary,
    transcriptMarkdown: row.transcriptMarkdown,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    askedCount: turns.filter((turn) => turn.askedAt).length,
    answeredCount: turns.filter((turn) => turn.answeredAt).length,
    turns,
  }
}

function socraticReviewRow(userId, clause, value) {
  return db.prepare(
    `SELECT id, session_id AS sessionId, lab_id AS labId, status, plan_version AS planVersion,
            source_assessment_id AS sourceAssessmentId, max_questions AS maxQuestions,
            plan_json AS planJson, final_summary AS finalSummary,
            transcript_markdown AS transcriptMarkdown, created_at AS createdAt,
            updated_at AS updatedAt, completed_at AS completedAt
     FROM socratic_reviews WHERE user_id = ? AND ${clause}`,
  ).get(userId, value)
}

export function getSocraticReview(userId, reviewId) {
  return parseSocraticReviewRow(socraticReviewRow(userId, 'id = ?', reviewId))
}

export function getLatestSocraticReview(userId, sessionId, labId) {
  const row = db.prepare(
    `SELECT id, session_id AS sessionId, lab_id AS labId, status, plan_version AS planVersion,
            source_assessment_id AS sourceAssessmentId, max_questions AS maxQuestions,
            plan_json AS planJson, final_summary AS finalSummary,
            transcript_markdown AS transcriptMarkdown, created_at AS createdAt,
            updated_at AS updatedAt, completed_at AS completedAt
     FROM socratic_reviews
     WHERE user_id = ? AND session_id = ? AND lab_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).get(userId, sessionId, labId)
  return parseSocraticReviewRow(row)
}

export function listRecentSocraticReviews(userId, labId, limit = 5) {
  const rows = db.prepare(
    `SELECT id, session_id AS sessionId, lab_id AS labId, status, plan_version AS planVersion,
            source_assessment_id AS sourceAssessmentId, max_questions AS maxQuestions,
            plan_json AS planJson, final_summary AS finalSummary,
            transcript_markdown AS transcriptMarkdown, created_at AS createdAt,
            updated_at AS updatedAt, completed_at AS completedAt
     FROM socratic_reviews
     WHERE user_id = ? AND lab_id = ?
     ORDER BY created_at DESC LIMIT ?`,
  ).all(userId, String(labId || ''), Math.max(1, Math.min(20, Number(limit) || 5)))
  return rows.map(parseSocraticReviewRow)
}

/** Teacher-only callers use this to inspect the immutable review record. */
export function getLatestSocraticReviewForStudent(username, labId) {
  const student = db
    .prepare("SELECT id FROM users WHERE username = ? AND role = 'student'")
    .get(String(username || ''))
  if (!student) return null
  const row = db.prepare(
    `SELECT id, session_id AS sessionId, lab_id AS labId, status, plan_version AS planVersion,
            source_assessment_id AS sourceAssessmentId, max_questions AS maxQuestions,
            plan_json AS planJson, final_summary AS finalSummary,
            transcript_markdown AS transcriptMarkdown, created_at AS createdAt,
            updated_at AS updatedAt, completed_at AS completedAt
     FROM socratic_reviews
     WHERE user_id = ? AND lab_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).get(student.id, String(labId || ''))
  return parseSocraticReviewRow(row)
}

export function createSocraticReview(userId, plan) {
  if (!plan || !Array.isArray(plan.questions) || plan.questions.length < 2 || plan.questions.length > 5) {
    throw new TypeError('复盘计划必须包含 2-5 个问题')
  }
  const maxQuestions = Math.max(2, Math.min(5, Number(plan.maxQuestions) || plan.questions.length))
  if (plan.questions.length > maxQuestions) throw new TypeError('复盘问题数超过 maxQuestions')
  const existing = getLatestSocraticReview(userId, plan.sessionId, plan.labId)
  if (existing && !['review_completed', 'deferred'].includes(existing.status)) return existing
  const reviewId = randomUUID()
  const createdAt = now()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(
      `INSERT INTO socratic_reviews
        (id, user_id, session_id, lab_id, status, plan_version, source_assessment_id,
         max_questions, plan_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'review_ready', ?, ?, ?, ?, ?, ?)`,
    ).run(
      reviewId, userId, plan.sessionId, plan.labId, plan.version,
      plan.sourceAssessmentId || null, maxQuestions, JSON.stringify(plan), createdAt, createdAt,
    )
    const insertTurn = db.prepare(
      `INSERT INTO socratic_review_turns
        (id, review_id, ordinal, question_id, concept_id, kind, objective, prompt, reason,
         pass_criteria_json, evidence_refs_json, requires_run_evidence, parent_turn_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const [index, question] of plan.questions.entries()) {
      insertTurn.run(
        randomUUID(), reviewId, index + 1, question.questionId, question.conceptId, question.kind,
        question.objective, question.prompt, question.reason, JSON.stringify(question.passCriteria || []),
        JSON.stringify(question.evidenceRefs || []), question.requiresRunEvidence ? 1 : 0, null, createdAt,
      )
    }
    db.exec('COMMIT')
    return getSocraticReview(userId, reviewId)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function appendSocraticReviewTurn(userId, reviewId, question, parentTurnId = null) {
  const review = getSocraticReview(userId, reviewId)
  if (!review) throw new Error('复盘会话不存在或不属于当前账号')
  if (['review_completed', 'deferred'].includes(review.status)) throw new Error('复盘会话已经结束')
  if (review.turns.length >= review.maxQuestions || review.turns.length >= 5) {
    throw new Error('复盘问题已达到 5 题上限')
  }
  const createdAt = now()
  db.prepare(
    `INSERT INTO socratic_review_turns
      (id, review_id, ordinal, question_id, concept_id, kind, objective, prompt, reason,
       pass_criteria_json, evidence_refs_json, requires_run_evidence, parent_turn_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), reviewId, review.turns.length + 1, question.questionId, question.conceptId, question.kind,
    question.objective, question.prompt, question.reason, JSON.stringify(question.passCriteria || []),
    JSON.stringify(question.evidenceRefs || []), question.requiresRunEvidence ? 1 : 0, parentTurnId, createdAt,
  )
  db.prepare('UPDATE socratic_reviews SET updated_at = ? WHERE id = ?').run(createdAt, reviewId)
  return getSocraticReview(userId, reviewId)
}

export function insertSocraticReviewFollowup(userId, reviewId, parentQuestionId, question) {
  const review = getSocraticReview(userId, reviewId)
  if (!review) throw new Error('复盘会话不存在或不属于当前账号')
  if (['review_completed', 'deferred'].includes(review.status)) throw new Error('复盘会话已经结束')
  if (review.turns.length >= review.maxQuestions || review.turns.length >= 5) {
    throw new Error('复盘问题已达到 5 题上限')
  }
  const parent = review.turns.find((turn) => turn.questionId === parentQuestionId)
  if (!parent?.answeredAt) throw new Error('只能在已经回答的问题后生成追问')
  const createdAt = now()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(
      `UPDATE socratic_review_turns SET ordinal = ordinal + 100
       WHERE review_id = ? AND ordinal > ?`,
    ).run(reviewId, parent.ordinal)
    db.prepare(
      `UPDATE socratic_review_turns SET ordinal = ordinal - 99
       WHERE review_id = ? AND ordinal > ?`,
    ).run(reviewId, parent.ordinal + 100)
    db.prepare(
      `INSERT INTO socratic_review_turns
        (id, review_id, ordinal, question_id, concept_id, kind, objective, prompt, reason,
         pass_criteria_json, evidence_refs_json, requires_run_evidence, parent_turn_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(), reviewId, parent.ordinal + 1, question.questionId, question.conceptId, question.kind,
      question.objective, question.prompt, question.reason, JSON.stringify(question.passCriteria || []),
      JSON.stringify(question.evidenceRefs || []), question.requiresRunEvidence ? 1 : 0, parent.id, createdAt,
    )
    db.prepare('UPDATE socratic_reviews SET updated_at = ? WHERE id = ?').run(createdAt, reviewId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return getSocraticReview(userId, reviewId)
}

export function markSocraticReviewTurnAsked(userId, reviewId, questionId) {
  const review = getSocraticReview(userId, reviewId)
  if (!review) throw new Error('复盘会话不存在或不属于当前账号')
  if (['review_completed', 'deferred'].includes(review.status)) throw new Error('复盘会话已经结束')
  const turn = review.turns.find((item) => item.questionId === questionId)
  if (!turn) throw new Error('复盘问题不存在')
  const firstUnanswered = review.turns.find((item) => !item.answeredAt)
  if (firstUnanswered && firstUnanswered.questionId !== questionId) throw new Error('必须按顺序回答复盘问题')
  if (turn.answeredAt) return review
  const timestamp = now()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE socratic_review_turns SET asked_at = COALESCE(asked_at, ?) WHERE id = ?')
      .run(timestamp, turn.id)
    db.prepare(`UPDATE socratic_reviews SET status = 'review_active', updated_at = ? WHERE id = ?`)
      .run(timestamp, reviewId)
    db.exec('COMMIT')
    return getSocraticReview(userId, reviewId)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function answerSocraticReviewTurn(userId, reviewId, questionId, input) {
  const review = getSocraticReview(userId, reviewId)
  if (!review) throw new Error('复盘会话不存在或不属于当前账号')
  if (['review_completed', 'deferred'].includes(review.status)) throw new Error('复盘会话已经结束')
  const turn = review.turns.find((item) => item.questionId === questionId)
  if (!turn) throw new Error('复盘问题不存在')
  if (!turn.askedAt) throw new Error('复盘问题尚未提出')
  if (turn.answeredAt) throw new Error('复盘问题已经回答；需要补充时请生成一个新的追问')
  const answer = String(input?.answer || '').trim().slice(0, 8_000)
  if (!answer) throw new TypeError('复盘回答不能为空')
  const timestamp = now()
  db.prepare(
    `UPDATE socratic_review_turns
     SET student_answer = ?, answer_event_ref = ?, evaluation_json = ?,
         asked_at = COALESCE(asked_at, ?), answered_at = ? WHERE id = ?`,
  ).run(
    answer, String(input?.answerEventRef || '').slice(0, 200),
    input?.evaluation ? JSON.stringify(input.evaluation) : null, timestamp, timestamp, turn.id,
  )
  const nextStatus = input?.evaluation?.verdict === 'needs-evidence' ? 'awaiting_evidence' : 'review_active'
  db.prepare('UPDATE socratic_reviews SET status = ?, updated_at = ? WHERE id = ?')
    .run(nextStatus, timestamp, reviewId)
  return getSocraticReview(userId, reviewId)
}

export function completeSocraticReview(userId, reviewId, input = {}) {
  const review = getSocraticReview(userId, reviewId)
  if (!review) throw new Error('复盘会话不存在或不属于当前账号')
  if (['review_completed', 'deferred'].includes(review.status)) throw new Error('复盘会话已经结束')
  const answeredTurns = review.turns.filter((turn) => turn.answeredAt)
  if (answeredTurns.length < 2) throw new Error('至少完成 2 个复盘问题后才能结束')
  if (answeredTurns.length !== review.turns.length) throw new Error('还有复盘问题未回答')
  const parentIds = new Set(review.turns.map((turn) => turn.parentTurnId).filter(Boolean))
  const unresolvedLeaves = answeredTurns.filter((turn) => !parentIds.has(turn.id))
  if (unresolvedLeaves.some((turn) => ['needs-evidence', 'partial', 'misconception', 'defer'].includes(turn.evaluation?.verdict))) {
    throw new Error('复盘中仍有回答需要补充或修正')
  }
  if (!String(input.finalSummary || '').trim()) throw new Error('复盘结束前需要提交自己的最终总结')
  const timestamp = now()
  db.prepare(
    `UPDATE socratic_reviews SET status = 'review_completed', final_summary = ?,
            transcript_markdown = ?, updated_at = ?, completed_at = ? WHERE id = ?`,
  ).run(
    String(input.finalSummary || '').trim().slice(0, 8_000),
    String(input.transcriptMarkdown || '').trim().slice(0, 64_000),
    timestamp, timestamp, reviewId,
  )
  return getSocraticReview(userId, reviewId)
}

export function deferSocraticReview(userId, reviewId, reason = '', input = {}) {
  const review = getSocraticReview(userId, reviewId)
  if (!review) throw new Error('复盘会话不存在或不属于当前账号')
  if (review.status === 'review_completed') throw new Error('已完成的复盘不能延期')
  if (review.status === 'deferred') return review
  const timestamp = now()
  const plan = { ...review.plan, deferredReason: String(reason || '').trim().slice(0, 2_000) }
  db.prepare(
    `UPDATE socratic_reviews SET status = 'deferred', plan_json = ?, transcript_markdown = ?,
            updated_at = ?, completed_at = ? WHERE id = ?`,
  ).run(
    JSON.stringify(plan),
    String(input.transcriptMarkdown || review.transcriptMarkdown || '').trim().slice(0, 64_000),
    timestamp, timestamp, reviewId,
  )
  return getSocraticReview(userId, reviewId)
}

export function getTutorFollowupState(userId, sessionId, labId, topicKey = '') {
  const session = db.prepare(
    `SELECT turn_index AS turnIndex, last_check_turn AS lastCheckTurn, updated_at AS updatedAt
     FROM tutor_followup_sessions WHERE user_id = ? AND session_id = ? AND lab_id = ?`,
  ).get(userId, sessionId, labId)
  const topic = topicKey
    ? db.prepare(
      `SELECT topic_turn_count AS topicTurnCount, check_count AS checkCount, pending, resolved, updated_at AS updatedAt
       FROM tutor_topic_checks WHERE user_id = ? AND session_id = ? AND lab_id = ? AND topic_key = ?`,
    ).get(userId, sessionId, labId, topicKey)
    : null
  return {
    turnIndex: Number(session?.turnIndex || 0),
    lastCheckTurn: Number(session?.lastCheckTurn ?? -10),
    topicKey: String(topicKey || ''),
    topicTurnCount: Number(topic?.topicTurnCount || 0),
    checkCount: Number(topic?.checkCount || 0),
    pending: Boolean(topic?.pending),
    resolved: Boolean(topic?.resolved),
    updatedAt: topic?.updatedAt || session?.updatedAt || '',
  }
}

export function recordTutorFollowupTurn(userId, sessionId, labId, topicKey, input = {}) {
  const safeTopicKey = String(topicKey || '').trim().slice(0, 120)
  if (!safeTopicKey) return getTutorFollowupState(userId, sessionId, labId)
  const timestamp = now()
  db.exec('BEGIN IMMEDIATE')
  try {
    const existing = getTutorFollowupState(userId, sessionId, labId, safeTopicKey)
    const nextTurnIndex = existing.turnIndex + 1
    const pending = input.checkAsked ? 1 : input.resolvePending ? 0 : existing.pending ? 1 : 0
    const resolved = input.checkAsked
      ? 0
      : input.resolvePending || input.resolved || existing.resolved
        ? 1
        : 0
    db.prepare(
      `INSERT INTO tutor_followup_sessions
         (user_id, session_id, lab_id, turn_index, last_check_turn, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, session_id, lab_id) DO UPDATE SET
         turn_index = excluded.turn_index,
         last_check_turn = excluded.last_check_turn,
         updated_at = excluded.updated_at`,
    ).run(
      userId, sessionId, labId, nextTurnIndex,
      input.checkAsked ? nextTurnIndex : existing.lastCheckTurn, timestamp,
    )
    db.prepare(
      `INSERT INTO tutor_topic_checks
         (user_id, session_id, lab_id, topic_key, topic_turn_count, check_count, pending, resolved, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(user_id, session_id, lab_id, topic_key) DO UPDATE SET
         topic_turn_count = tutor_topic_checks.topic_turn_count + 1,
         check_count = tutor_topic_checks.check_count + excluded.check_count,
         pending = excluded.pending,
         resolved = excluded.resolved,
         updated_at = excluded.updated_at`,
    ).run(
      userId, sessionId, labId, safeTopicKey, input.checkAsked ? 1 : 0,
      pending, resolved, timestamp,
    )
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return getTutorFollowupState(userId, sessionId, labId, safeTopicKey)
}

export function resolveTutorFollowup(userId, sessionId, labId, topicKey) {
  const timestamp = now()
  db.prepare(
    `UPDATE tutor_topic_checks SET pending = 0, resolved = 1, updated_at = ?
     WHERE user_id = ? AND session_id = ? AND lab_id = ? AND topic_key = ?`,
  ).run(timestamp, userId, sessionId, labId, String(topicKey || '').slice(0, 120))
  return getTutorFollowupState(userId, sessionId, labId, topicKey)
}

export function saveMasteryObservations(userId, observations = []) {
  const insert = db.prepare(
    `INSERT INTO mastery_observations
      (id, user_id, session_id, lab_id, concept_id, status, confidence, misconceptions_json,
       evidence_refs_json, source_type, source_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const createdAt = now()
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const observation of observations) {
      insert.run(
        randomUUID(), userId, observation.sessionId, observation.labId, observation.conceptId,
        observation.status, Number(observation.confidence || 0),
        JSON.stringify(observation.misconceptions || []), JSON.stringify(observation.evidenceRefs || []),
        String(observation.sourceType || 'assessment'), String(observation.sourceId || ''), createdAt,
      )
    }
    db.exec('COMMIT')
    return { ok: true, count: observations.length }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function listMasteryObservations(userId, labId = '') {
  return db.prepare(
    `SELECT id, session_id AS sessionId, lab_id AS labId, concept_id AS conceptId, status, confidence,
            misconceptions_json AS misconceptionsJson, evidence_refs_json AS evidenceRefsJson,
            source_type AS sourceType, source_id AS sourceId, created_at AS createdAt
     FROM mastery_observations WHERE user_id = ? ${labId ? 'AND lab_id = ?' : ''}
     ORDER BY created_at DESC`,
  ).all(...(labId ? [userId, labId] : [userId])).map((row) => ({
    ...row,
    misconceptions: JSON.parse(row.misconceptionsJson),
    evidenceRefs: JSON.parse(row.evidenceRefsJson),
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

/** 只读取当前账号自己的学习事件，供前端在登录/切换账号后重建本地旅程。 */
export function listLearningEvents(userId, labId = '') {
  const rows = labId
    ? db
        .prepare(
          `SELECT payload_json AS payload FROM events
           WHERE user_id = ? AND lab_id = ? ORDER BY row_id ASC`,
        )
        .all(userId, String(labId))
    : db
        .prepare(
          `SELECT payload_json AS payload FROM events
           WHERE user_id = ? ORDER BY row_id ASC`,
        )
        .all(userId)
  const events = []
  for (const row of rows) {
    try {
      const event = JSON.parse(row.payload)
      if (event && typeof event.id === 'string') events.push(event)
    } catch {
      // 跳过损坏的历史行，不影响其他事件回读。
    }
    if (events.length >= 50_000) break
  }
  return events
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
