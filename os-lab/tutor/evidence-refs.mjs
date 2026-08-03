const REQUEST_REF_RE = /^(run|trace|diag|diagnostic):([A-Za-z0-9._-]{1,160})$/

export function validateChatEvidenceRefs(value, { userId, labId, getRun }) {
  if (value === undefined || value === null) return { ok: true, evidenceRefs: [] }
  if (!Array.isArray(value) || value.length > 20) {
    return { ok: false, error: 'evidenceRefs 必须是最多 20 项的数组' }
  }

  const evidenceRefs = []
  for (const item of value) {
    const ref = String(item || '').trim()
    const match = REQUEST_REF_RE.exec(ref)
    if (!match) return { ok: false, error: 'evidenceRefs 只接受 run/trace/diag 引用' }
    const [, kind, runId] = match
    const run = getRun(userId, runId)
    if (!run || run.labId !== labId) {
      return { ok: false, error: '证据引用不存在、不属于当前账号或 Lab 不匹配' }
    }
    if (kind === 'trace' && Number(run.trace?.count || 0) <= 0) {
      return { ok: false, error: 'Trace 引用没有可验证的事件' }
    }
    const normalized = `${kind === 'diagnostic' ? 'diag' : kind}:${runId}`
    if (!evidenceRefs.includes(normalized)) evidenceRefs.push(normalized)
  }
  return { ok: true, evidenceRefs }
}
