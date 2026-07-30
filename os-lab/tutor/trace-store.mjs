import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { validateTraceEvent } from './contracts.mjs'

const MAX_TRACE_BYTES = 16 * 1024 * 1024
const MAX_PAGE_SIZE = 1000

export class TraceIntegrityError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TraceIntegrityError'
  }
}

function integerParam(value, fallback, min, max) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null
  return parsed
}

export function parseTraceQuery(searchParams) {
  const offset = integerParam(searchParams.get('offset'), 0, 0, 1_000_000)
  const limit = integerParam(searchParams.get('limit'), 500, 1, MAX_PAGE_SIZE)
  const startSeq = integerParam(searchParams.get('startSeq'), null, 0, Number.MAX_SAFE_INTEGER)
  const endSeq = integerParam(searchParams.get('endSeq'), null, 0, Number.MAX_SAFE_INTEGER)
  if (offset === null || limit === null || startSeq === null && searchParams.has('startSeq') || endSeq === null && searchParams.has('endSeq')) {
    return null
  }
  if (startSeq !== null && endSeq !== null && endSeq < startSeq) return null
  return { offset, limit, startSeq, endSeq }
}

function resolveArtifact(dataDir, relativePath) {
  const root = path.resolve(dataDir)
  const full = path.resolve(root, String(relativePath || ''))
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new TraceIntegrityError('trace artifact path escapes the data directory')
  }
  return full
}

export async function readTracePage(dataDir, run, query) {
  if (!run?.trace?.path || !run.trace.count) {
    return {
      version: 1,
      runId: run?.runId || '',
      total: 0,
      filteredTotal: 0,
      offset: query.offset,
      limit: query.limit,
      nextOffset: null,
      integrity: { valid: true, hash: run?.trace?.hash || null },
      events: [],
    }
  }

  const full = resolveArtifact(dataDir, run.trace.path)
  const fileStat = await stat(full)
  if (fileStat.size > MAX_TRACE_BYTES) throw new TraceIntegrityError('trace artifact exceeds the 16 MiB limit')
  const text = await readFile(full, 'utf8')
  const actualHash = createHash('sha256').update(text).digest('hex')
  if (run.trace.hash !== actualHash) throw new TraceIntegrityError('trace artifact hash does not match the run record')

  const lines = text.split(/\r?\n/).filter(Boolean)
  const events = []
  let previousSeq = -1
  for (const line of lines) {
    let event
    try {
      event = JSON.parse(line)
    } catch {
      throw new TraceIntegrityError('trace artifact contains invalid JSON')
    }
    if (!validateTraceEvent(event)) throw new TraceIntegrityError('trace artifact contains an invalid event')
    if (event.seq <= previousSeq) throw new TraceIntegrityError('trace event sequence is not strictly increasing')
    previousSeq = event.seq
    events.push(event)
  }
  if (events.length !== run.trace.count) throw new TraceIntegrityError('trace event count does not match the run record')

  const ranged = events.filter(
    (event) =>
      (query.startSeq === null || event.seq >= query.startSeq) &&
      (query.endSeq === null || event.seq <= query.endSeq),
  )
  const page = ranged.slice(query.offset, query.offset + query.limit)
  const nextOffset = query.offset + page.length < ranged.length ? query.offset + page.length : null
  return {
    version: 1,
    runId: run.runId,
    total: events.length,
    filteredTotal: ranged.length,
    offset: query.offset,
    limit: query.limit,
    nextOffset,
    range: { startSeq: query.startSeq, endSeq: query.endSeq },
    integrity: { valid: true, hash: actualHash },
    events: page,
  }
}
