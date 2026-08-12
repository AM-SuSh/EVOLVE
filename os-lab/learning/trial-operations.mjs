import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
const defaultDbPath = process.env.OS_LAB_DB_PATH || path.join(here, 'os-lab.db')
const defaultBackupRoot = process.env.OS_LAB_BACKUP_ROOT || path.join(here, 'backups')
export const READINESS_THRESHOLD = Number(JSON.parse(readFileSync(path.join(here, 'calibration-policy-v1.json'), 'utf8')).after.threshold)

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function ensureDatabaseFile(value, label) {
  const resolved = path.resolve(String(value || ''))
  if (!/\.(?:db|sqlite|sqlite3)$/i.test(resolved)) throw new Error(`${label} 必须是明确的 SQLite 文件路径`)
  return resolved
}

function integrityCheck(database) {
  const rows = database.prepare('PRAGMA integrity_check').all()
  const messages = rows.map((row) => String(row.integrity_check || Object.values(row)[0]))
  return { ok: messages.length === 1 && messages[0] === 'ok', messages }
}

function tableCounts(database) {
  const names = [
    'users', 'runs', 'run_assertions', 'events', 'assessments', 'mastery_evidence',
    'review_queue', 'review_decisions', 'socratic_reviews', 'socratic_review_turns',
    'mastery_observations', 'reports',
  ]
  return Object.fromEntries(names.map((name) => [name, Number(database.prepare(`SELECT count(*) AS value FROM ${name}`).get().value)]))
}

export async function createLearningBackup(options = {}) {
  const sourcePath = ensureDatabaseFile(options.dbPath || defaultDbPath, '源数据库')
  const backupRoot = path.resolve(options.backupRoot || defaultBackupRoot)
  await mkdir(backupRoot, { recursive: true })
  const source = new DatabaseSync(sourcePath, { readOnly: true })
  const sourceIntegrity = integrityCheck(source)
  if (!sourceIntegrity.ok) {
    source.close()
    throw new Error(`源数据库完整性检查失败: ${sourceIntegrity.messages.join('; ')}`)
  }
  const createdAt = new Date().toISOString()
  const fileName = `os-lab-${createdAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.db`
  const backupPath = path.join(backupRoot, fileName)
  try {
    await sqliteBackup(source, backupPath)
  } finally {
    source.close()
  }
  const verified = new DatabaseSync(backupPath, { readOnly: true })
  const backupIntegrity = integrityCheck(verified)
  const counts = tableCounts(verified)
  const migrations = verified.prepare('SELECT version, applied_at AS appliedAt FROM schema_migrations ORDER BY applied_at').all()
  verified.close()
  if (!backupIntegrity.ok) throw new Error(`备份完整性检查失败: ${backupIntegrity.messages.join('; ')}`)
  const bytes = await readFile(backupPath)
  const manifest = {
    version: 1,
    createdAt,
    file: fileName,
    bytes: bytes.length,
    sha256: sha256(bytes),
    integrity: 'ok',
    counts,
    migrations,
  }
  const manifestPath = `${backupPath}.manifest.json`
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return { ok: true, backupPath, manifestPath, manifest }
}

export async function restoreLearningBackup(options = {}) {
  const backupPath = ensureDatabaseFile(options.backupPath, '备份')
  const targetPath = ensureDatabaseFile(options.targetPath || defaultDbPath, '恢复目标')
  if (backupPath === targetPath) throw new Error('备份文件与恢复目标不能相同')
  if (options.allowOverwrite !== true) throw new Error('恢复会替换数据库，必须显式设置 allowOverwrite=true')
  const backupBytes = await readFile(backupPath)
  let manifest = null
  try { manifest = JSON.parse(await readFile(`${backupPath}.manifest.json`, 'utf8')) } catch { /* external backup */ }
  const expectedHash = String(options.expectedSha256 || manifest?.sha256 || '')
  if (expectedHash && sha256(backupBytes) !== expectedHash) throw new Error('备份 SHA-256 与清单不一致')
  const source = new DatabaseSync(backupPath, { readOnly: true })
  const sourceIntegrity = integrityCheck(source)
  source.close()
  if (!sourceIntegrity.ok) throw new Error(`备份完整性检查失败: ${sourceIntegrity.messages.join('; ')}`)

  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporary = `${targetPath}.restore-${randomUUID()}.tmp`
  const rollbackPath = `${targetPath}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
  await copyFile(backupPath, temporary)
  let hadTarget = false
  try {
    await stat(targetPath)
    hadTarget = true
    await rename(targetPath, rollbackPath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    await rename(temporary, targetPath)
    const restored = new DatabaseSync(targetPath, { readOnly: true })
    const restoredIntegrity = integrityCheck(restored)
    const counts = tableCounts(restored)
    restored.close()
    if (!restoredIntegrity.ok) throw new Error('恢复后的数据库完整性检查失败')
    return { ok: true, targetPath, rollbackPath: hadTarget ? rollbackPath : null, sha256: sha256(await readFile(targetPath)), counts }
  } catch (error) {
    try {
      await rename(targetPath, `${targetPath}.failed-restore-${Date.now()}`)
    } catch { /* the restored target may not have been installed yet */ }
    try {
      if (hadTarget) await rename(rollbackPath, targetPath)
    } catch { /* preserve the original error and report rollback path */ }
    throw error
  }
}

function groupBy(rows, keyOf) {
  const result = new Map()
  for (const row of rows) result.set(keyOf(row), [...(result.get(keyOf(row)) || []), row])
  return result
}

function average(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null
}

export function generateAnonymousAnalysis(options = {}) {
  const dbPath = ensureDatabaseFile(options.dbPath || defaultDbPath, '分析数据库')
  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const students = database.prepare("SELECT id FROM users WHERE role = 'student' ORDER BY id").all()
    const runs = database.prepare(
      `SELECT user_id AS userId, lab_id AS labId, trusted, verified, started_at AS startedAt, finished_at AS finishedAt
       FROM runs ORDER BY started_at`,
    ).all()
    const events = database.prepare(
      `SELECT user_id AS userId, lab_id AS labId, type FROM events
       WHERE type IN ('hint_requested', 'guardrail_triggered', 'teacher_reviewed')`,
    ).all()
    const assessments = database.prepare(
      `SELECT user_id AS userId, lab_id AS labId, total, created_at AS createdAt
       FROM assessments ORDER BY created_at`,
    ).all()
    const runGroups = groupBy(runs, (row) => `${row.userId}:${row.labId}`)
    const eventGroups = groupBy(events, (row) => `${row.userId}:${row.labId}`)
    const assessmentGroups = groupBy(assessments, (row) => `${row.userId}:${row.labId}`)
    const salt = options.salt || randomBytes(32)
    const rows = []
    for (const student of students) {
      const labs = new Set([
        ...runs.filter((row) => row.userId === student.id).map((row) => row.labId),
        ...events.filter((row) => row.userId === student.id).map((row) => row.labId),
        ...assessments.filter((row) => row.userId === student.id).map((row) => row.labId),
      ])
      for (const labId of labs) {
        const key = `${student.id}:${labId}`
        const labRuns = runGroups.get(key) || []
        const labEvents = eventGroups.get(key) || []
        const labAssessments = assessmentGroups.get(key) || []
        const firstRun = labRuns.find((run) => run.trusted)
        const firstVerified = labRuns.find((run) => run.trusted && run.verified && run.finishedAt)
        const firstVerifiedMinutes = firstRun && firstVerified
          ? Math.max(0, Math.round((Date.parse(firstVerified.finishedAt) - Date.parse(firstRun.startedAt)) / 60_000))
          : null
        rows.push({
          participantId: createHmac('sha256', salt).update(String(student.id)).digest('hex').slice(0, 16),
          labId,
          trustedRuns: labRuns.filter((run) => run.trusted).length,
          verifiedRuns: labRuns.filter((run) => run.trusted && run.verified).length,
          firstVerifiedMinutes,
          hintRequests: labEvents.filter((event) => event.type === 'hint_requested').length,
          guardrails: labEvents.filter((event) => event.type === 'guardrail_triggered').length,
          teacherReviews: labEvents.filter((event) => event.type === 'teacher_reviewed').length,
          latestAutomaticTotal: labAssessments.at(-1)?.total ?? null,
          advisoryReady: (labAssessments.at(-1)?.total ?? -1) >= Number(options.readinessThreshold || READINESS_THRESHOLD),
        })
      }
    }
    const byLab = groupBy(rows, (row) => row.labId)
    const labs = Object.fromEntries([...byLab].map(([labId, items]) => [labId, {
      participants: new Set(items.map((item) => item.participantId)).size,
      verifiedParticipants: new Set(items.filter((item) => item.verifiedRuns > 0).map((item) => item.participantId)).size,
      meanFirstVerifiedMinutes: average(items.map((item) => item.firstVerifiedMinutes).filter(Number.isFinite)),
      meanHintRequests: average(items.map((item) => item.hintRequests)),
      guardrailRate: average(items.map((item) => item.guardrails > 0 ? 1 : 0)),
      teacherReviewRate: average(items.map((item) => item.teacherReviews > 0 ? 1 : 0)),
      advisoryReadyRate: average(items.map((item) => item.advisoryReady ? 1 : 0)),
    }]))
    const minimum = Number(options.minCohortSize || 5)
    const includeParticipants = options.includeParticipants === true && students.length >= minimum
    return {
      version: 1,
      exportId: randomUUID(),
      generatedAt: new Date().toISOString(),
      privacy: {
        minimumCohortSize: minimum,
        participantRowsIncluded: includeParticipants,
        excluded: ['username', 'className', 'messageContent', 'command', 'filePath', 'rawTimestamp', 'reportContent'],
        warning: '仅用于描述统计；小样本或外部信息仍可能造成重识别。',
      },
      cohortSize: students.length,
      readinessThreshold: Number(options.readinessThreshold || READINESS_THRESHOLD),
      labs,
      participants: includeParticipants ? rows : [],
    }
  } finally {
    database.close()
  }
}

function confusion(records, threshold, manualThreshold) {
  const result = { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 }
  for (const record of records) {
    const expected = Number(record.manualTotalHint) >= manualThreshold
    const predicted = Number(record.legacyHeuristicGuess) >= threshold
    if (expected && predicted) result.truePositive += 1
    else if (!expected && !predicted) result.trueNegative += 1
    else if (predicted) result.falsePositive += 1
    else result.falseNegative += 1
  }
  const sensitivity = result.truePositive / Math.max(1, result.truePositive + result.falseNegative)
  const specificity = result.trueNegative / Math.max(1, result.trueNegative + result.falsePositive)
  return { ...result, accuracy: (result.truePositive + result.trueNegative) / records.length, sensitivity, specificity, balancedAccuracy: (sensitivity + specificity) / 2 }
}

export function calibrateReadinessThreshold(records, options = {}) {
  if (!Array.isArray(records) || records.length === 0) throw new TypeError('校准至少需要一条标注记录')
  const manualThreshold = Number(options.manualThreshold || 70)
  const baselineThreshold = Number(options.baselineThreshold || 70)
  const candidates = Array.from({ length: 101 }, (_, threshold) => ({ threshold, ...confusion(records, threshold, manualThreshold) }))
  candidates.sort((left, right) => right.balancedAccuracy - left.balancedAccuracy || Math.abs(left.threshold - baselineThreshold) - Math.abs(right.threshold - baselineThreshold))
  const selected = candidates[0]
  return {
    version: 1,
    datasetSize: records.length,
    manualThreshold,
    baseline: { threshold: baselineThreshold, ...confusion(records, baselineThreshold, manualThreshold) },
    selected,
    policy: 'advisory-only',
    caveat: '人工标注模拟轨迹，不等同于真人试用；不得用于自动解锁或最终成绩。',
  }
}
