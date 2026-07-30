import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { DatabaseSync } from 'node:sqlite'

const temporary = mkdtempSync(path.join(tmpdir(), 'os-lab-trial-ops-'))
const dbPath = path.join(temporary, 'learning.db')
process.env.OS_LAB_DB_PATH = dbPath
const learningDb = await import(`./db.mjs?trial=${Date.now()}`)
const operations = await import(`./trial-operations.mjs?trial=${Date.now()}`)

after(() => rmSync(temporary, { recursive: true, force: true }))

test('C7 anonymous export excludes identities and suppresses small participant rows', () => {
  for (let index = 1; index <= 5; index += 1) learningDb.register(`trial-${index}`, 'secret1', '计科2301')
  learningDb.closeLearningDb()
  const aggregate = operations.generateAnonymousAnalysis({ dbPath, includeParticipants: true, minCohortSize: 6, salt: 'test-salt' })
  assert.equal(aggregate.cohortSize, 5)
  assert.deepEqual(aggregate.participants, [])
  const detailed = operations.generateAnonymousAnalysis({ dbPath, includeParticipants: true, minCohortSize: 5, salt: 'test-salt' })
  assert.equal(detailed.privacy.participantRowsIncluded, true)
  const serialized = JSON.stringify(detailed)
  assert.doesNotMatch(serialized, /trial-1|计科2301|secret1/)
  assert.equal(detailed.privacy.excluded.includes('messageContent'), true)
})

test('C7 backup is integrity-checked and restore preserves a rollback database', async () => {
  const db = new DatabaseSync(dbPath)
  const student = db.prepare("SELECT id FROM users WHERE username = 'trial-1'").get()
  db.prepare("INSERT INTO reports (user_id, lab_id, content, updated_at, feedback) VALUES (?, 'lab2', 'before backup', ?, '')").run(student.id, new Date().toISOString())
  db.close()
  const backup = await operations.createLearningBackup({ dbPath, backupRoot: path.join(temporary, 'backups') })
  assert.equal(backup.manifest.integrity, 'ok')
  assert.equal(backup.manifest.counts.reports, 1)

  const changed = new DatabaseSync(dbPath)
  changed.exec('DELETE FROM reports')
  changed.close()
  await assert.rejects(() => operations.restoreLearningBackup({ backupPath: backup.backupPath, targetPath: dbPath }), /allowOverwrite/)
  const restored = await operations.restoreLearningBackup({ backupPath: backup.backupPath, targetPath: dbPath, allowOverwrite: true })
  assert.equal(restored.counts.reports, 1)
  assert.ok(restored.rollbackPath)
  const rollback = new DatabaseSync(restored.rollbackPath, { readOnly: true })
  assert.equal(rollback.prepare('SELECT count(*) AS value FROM reports').get().value, 0)
  rollback.close()
})

test('C7 calibration selects the recorded advisory threshold from 20 labeled trajectories', async () => {
  const fixture = JSON.parse(await readFile(new URL('./traces-lab2-mock.json', import.meta.url), 'utf8'))
  const result = operations.calibrateReadinessThreshold(fixture.trajectories)
  assert.equal(result.datasetSize, 20)
  assert.equal(result.baseline.threshold, 70)
  assert.equal(result.selected.threshold, 76)
  assert.equal(result.selected.balancedAccuracy > result.baseline.balancedAccuracy, true)
  assert.equal(result.policy, 'advisory-only')
})

