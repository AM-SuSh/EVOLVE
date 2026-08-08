/** 实验报告附件的类型、校验与编码工具；持久化统一由 Tutor Server 负责。 */

export interface ReportAttachmentMeta {
  id: string
  name: string
  mime: string
  size: number
  addedAt: string
  storedName?: string
}

const LEGACY_DB_NAME = 'os-lab-report-attachments'

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
])

const ALLOWED_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.md',
])

/** 单附件上限 4 MiB；每 Lab 最多 8 个。 */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
export const MAX_ATTACHMENTS = 8

export function isAllowedAttachment(file: File): boolean {
  const lower = (file.name || '').toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : ''
  if (ALLOWED_EXT.has(ext)) return true
  if (ALLOWED_MIME.has(file.type)) return true
  // 部分浏览器截图/粘贴只有 image/*、没有扩展名
  return Boolean(file.type && file.type.startsWith('image/'))
}

export function createAttachmentId() {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 清理旧版遗留的浏览器附件库；新版本不会再创建或读取它。 */
export function clearLegacyReportAttachmentCache() {
  if (typeof indexedDB === 'undefined') return
  indexedDB.deleteDatabase(LEGACY_DB_NAME)
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function looksLikeImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)
}

/** 压缩图片后作为附件；失败时原样返回，绝不抛错阻断上传。 */
export async function compressImageFile(file: File, maxEdge = 1280, quality = 0.82): Promise<Blob> {
  if (!looksLikeImage(file) || file.type === 'image/gif') return file
  try {
    if (typeof createImageBitmap !== 'function') return file
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(bitmap, 0, 0, width, height)
      const mime = file.type === 'image/png' || /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), mime, quality),
      )
      return blob && blob.size > 0 && blob.size < file.size ? blob : file
    } finally {
      bitmap.close()
    }
  } catch {
    return file
  }
}
