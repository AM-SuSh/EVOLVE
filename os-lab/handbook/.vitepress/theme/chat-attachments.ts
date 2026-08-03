/** 工作台「添加到对话」附件：随导师发送一并提交；可点击溯源回面板。 */

export type ChatAttachmentSource = 'code' | 'terminal' | 'problems' | 'tests' | 'manual' | 'trace'

/** 溯源定位信息（UI 跳转用；发送给导师的正文仍用 body）。 */
export interface ChatAttachmentOrigin {
  path?: string
  line?: number
  runId?: string
  assertionId?: string
  h2?: string
  h3?: string
  seq?: number
  /** terminal: selection | full；code: selection | context */
  scope?: 'selection' | 'full' | 'context' | 'single' | 'all'
}

export interface ChatAttachment {
  id: string
  source: ChatAttachmentSource
  title: string
  body: string
  origin?: ChatAttachmentOrigin
}

export const CHAT_ATTACHMENT_BODY_MAX = 6_000
export const CHAT_ATTACHMENT_MAX_COUNT = 5

export const chatSourceLabels: Record<ChatAttachmentSource, string> = {
  code: '工作区',
  terminal: '终端',
  problems: 'Problems',
  tests: '测试结果',
  manual: '手册',
  trace: 'Trace',
}

export function clampChatBody(text: string, max = CHAT_ATTACHMENT_BODY_MAX) {
  const value = String(text || '').replace(/\r\n/g, '\n').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n…（已截断）`
}

export function formatChatWithAttachments(userText: string, attachments: ChatAttachment[]) {
  const question = String(userText || '').trim()
  if (!attachments.length) return question
  const blocks = attachments
    .map((item) => {
      const label = chatSourceLabels[item.source] || item.source
      return `【${label} · ${item.title}】\n\`\`\`\n${item.body}\n\`\`\``
    })
    .join('\n\n')
  if (question) {
    return `${question}\n\n---\n以下是我从工作台附上的内容，请结合它们引导我（先追问我的判断，不要直接给完整代码）：\n\n${blocks}`
  }
  return `请结合以下工作台内容引导我（先追问我的判断，不要直接给完整代码）：\n\n${blocks}`
}

export function chatEvidenceRefs(attachments: ChatAttachment[]) {
  const refs: string[] = []
  for (const item of attachments) {
    const runId = String(item.origin?.runId || '').trim()
    if (!runId) continue
    const prefix =
      item.source === 'trace'
        ? 'trace'
        : item.source === 'problems'
          ? 'diag'
          : item.source === 'tests' || item.source === 'terminal'
            ? 'run'
            : ''
    if (!prefix) continue
    const ref = `${prefix}:${runId}`
    if (!refs.includes(ref)) refs.push(ref)
  }
  return refs.slice(0, 20)
}

/** 从完整发送正文拆出「学生原问题」——附件块之前的部分，供消息气泡展示。 */
export function studentQuestionFromChat(fullText: string) {
  const text = String(fullText || '')
  const marker = '\n\n---\n以下是我从工作台附上的内容'
  const index = text.indexOf(marker)
  if (index >= 0) return text.slice(0, index).trim()
  if (text.startsWith('请结合以下工作台内容引导我')) return ''
  return text.trim()
}
