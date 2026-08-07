import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const osLabRoot = path.resolve(here, '..')

export const studentDataRoot = path.resolve(
  process.env.OS_LAB_STUDENT_DATA_ROOT || path.join(osLabRoot, 'learning', 'student-data'),
)

function userKey(userId) {
  const value = String(userId || '')
  if (!/^[1-9]\d*$/.test(value)) throw new Error('invalid student data user id')
  return value
}

function labKey(labId) {
  const value = String(labId || '')
  if (!/^lab[1-8]$/.test(value)) throw new Error('invalid student data lab id')
  return value
}

function sessionKey(sessionId) {
  const value = String(sessionId || '')
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new Error('invalid student data session id')
  return value
}

function attachmentKey(attachmentId) {
  const value = String(attachmentId || '')
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new Error('invalid report attachment id')
  return value
}

function safeFilename(name) {
  const value = path.basename(String(name || 'file')).replace(/[^\w.\u4e00-\u9fff()-]+/g, '_')
  return value.slice(0, 120) || 'file'
}

function relativePath(fullPath) {
  return path.relative(studentDataRoot, fullPath).replaceAll('\\', '/')
}

async function writeAtomic(fullPath, content) {
  await mkdir(path.dirname(fullPath), { recursive: true })
  const tempPath = `${fullPath}.${randomUUID()}.tmp`
  await writeFile(tempPath, content, 'utf8')
  await rename(tempPath, fullPath)
}

async function readJson(fullPath) {
  try {
    return JSON.parse(await readFile(fullPath, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

export function studentRootForData(userId) {
  return path.join(studentDataRoot, userKey(userId))
}

export function reportRootForData(userId, labId) {
  return path.join(studentRootForData(userId), 'reports', labKey(labId))
}

export function reportAttachmentRootForData(userId, labId) {
  return path.join(reportRootForData(userId, labId), 'attachments')
}

export function reportDraftAttachmentRootForData(userId, labId) {
  return path.join(reportRootForData(userId, labId), 'draft-attachments')
}

export async function saveReportDraftFile(userId, labId, draft) {
  const filePath = path.join(reportRootForData(userId, labId), 'draft.json')
  const record = {
    version: 1,
    labId: labKey(labId),
    updatedAt: new Date().toISOString(),
    ...draft,
  }
  await writeAtomic(filePath, `${JSON.stringify(record, null, 2)}\n`)
  return { updatedAt: record.updatedAt, path: relativePath(filePath), draft: record }
}

export async function readReportDraftFile(userId, labId) {
  return readJson(path.join(reportRootForData(userId, labId), 'draft.json'))
}

export async function saveReportSubmissionFile(userId, labId, content) {
  const filePath = path.join(reportRootForData(userId, labId), 'submission.md')
  await writeAtomic(filePath, String(content || ''))
  return { path: relativePath(filePath) }
}

export async function saveReportDraftAttachment(userId, labId, attachmentId, name, content) {
  const storedName = `${attachmentKey(attachmentId)}-${safeFilename(name)}`
  const filePath = path.join(reportDraftAttachmentRootForData(userId, labId), storedName)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
  return { storedName, path: relativePath(filePath) }
}

export async function readReportDraftAttachment(userId, labId, attachmentId, storedName) {
  const expectedPrefix = `${attachmentKey(attachmentId)}-`
  const name = safeFilename(storedName)
  if (!name.startsWith(expectedPrefix)) return null
  try {
    return await readFile(path.join(reportDraftAttachmentRootForData(userId, labId), name))
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

export async function removeReportDraftAttachment(userId, labId, attachmentId, storedName) {
  const expectedPrefix = `${attachmentKey(attachmentId)}-`
  const name = safeFilename(storedName)
  if (!name.startsWith(expectedPrefix)) return false
  try {
    await unlink(path.join(reportDraftAttachmentRootForData(userId, labId), name))
    return true
  } catch (error) {
    if (error && error.code === 'ENOENT') return false
    throw error
  }
}

export async function appendLearningEventsFile(userId, events) {
  const groups = new Map()
  for (const event of events) {
    const sessionId = sessionKey(event.sessionId)
    groups.set(sessionId, [...(groups.get(sessionId) || []), JSON.stringify(event)])
  }
  await Promise.all(
    [...groups].map(async ([sessionId, lines]) => {
      const filePath = path.join(studentRootForData(userId), 'events', `${sessionId}.jsonl`)
      await mkdir(path.dirname(filePath), { recursive: true })
      await appendFile(filePath, `${lines.join('\n')}\n`, 'utf8')
    }),
  )
}

function conversationIndexPath(userId) {
  return path.join(studentRootForData(userId), 'conversations', 'index.json')
}

export async function appendConversationTurn(userId, sessionId, labId, turn) {
  const session = sessionKey(sessionId)
  const lab = labKey(labId)
  const filePath = path.join(studentRootForData(userId), 'conversations', `${session}.jsonl`)
  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify({ version: 1, labId: lab, ...turn })}\n`, 'utf8')
}

export async function saveConversationSnapshot(userId, snapshot) {
  const session = sessionKey(snapshot.sessionId)
  const lab = labKey(snapshot.labId)
  const now = new Date().toISOString()
  const record = { version: 1, ...snapshot, sessionId: session, labId: lab, updatedAt: snapshot.updatedAt || now }
  const root = path.join(studentRootForData(userId), 'conversations')
  await writeAtomic(path.join(root, `${session}.json`), `${JSON.stringify(record, null, 2)}\n`)
  await appendFile(path.join(root, `${session}.jsonl`), `${JSON.stringify(record)}\n`, 'utf8')

  const indexPath = conversationIndexPath(userId)
  const existing = (await readJson(indexPath)) || { version: 1, labs: {} }
  const labs = existing.labs && typeof existing.labs === 'object' ? existing.labs : {}
  labs[lab] = { sessionId: session, updatedAt: record.updatedAt }
  await writeAtomic(indexPath, `${JSON.stringify({ version: 1, labs }, null, 2)}\n`)
  return record
}

export async function readConversationSnapshot(userId, labId, sessionId = '') {
  const lab = labKey(labId)
  let session = sessionId ? sessionKey(sessionId) : ''
  if (!session) {
    const index = await readJson(conversationIndexPath(userId))
    session = typeof index?.labs?.[lab]?.sessionId === 'string' ? index.labs[lab].sessionId : ''
  }
  if (!session) return null
  const record = await readJson(path.join(studentRootForData(userId), 'conversations', `${session}.json`))
  return record?.labId === lab ? record : null
}

export function runArtifactRootForData(userId, labId, runId) {
  const run = String(runId || '')
  if (!/^[0-9a-f-]{8,80}$/i.test(run)) throw new Error('invalid run id')
  return path.join(studentRootForData(userId), 'runs', labKey(labId), run)
}

export function relativeStudentDataPath(fullPath) {
  return relativePath(fullPath)
}
