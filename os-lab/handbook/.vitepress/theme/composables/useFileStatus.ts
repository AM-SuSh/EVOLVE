import { ref, watch, type Ref } from 'vue'
import { authHeaders } from '../tutor-model'
import { type FileStatusKind } from '../file-status'

export type FileStatusSource = 'server' | 'none'

export interface FsStatusEntry {
  path: string
  status: FileStatusKind
  introducedIn?: string
  editable?: boolean
  baselineHash?: string | null
  currentHash?: string | null
}

export interface UseFileStatusReturn {
  statusMap: Ref<Record<string, FileStatusKind>>
  source: Ref<FileStatusSource>
  refresh: () => Promise<void>
}

/**
 * 拉取学生工作区文件状态。网络或服务异常时清空状态，但不阻塞编辑器使用。
 */
export function useFileStatus(
  endpoint: string,
  labId: Ref<string> | string,
  auth: Ref<{ token: string } | null> | null,
): UseFileStatusReturn {
  const statusMap = ref<Record<string, FileStatusKind>>({})
  const source = ref<FileStatusSource>('none')

  async function refresh() {
    const id = typeof labId === 'string' ? labId : labId.value
    if (!id) return
    try {
      const response = await fetch(`${endpoint}/fs/status?labId=${encodeURIComponent(id)}`, {
        headers: authHeaders(),
      })
      if (!response.ok) throw new Error(`status ${response.status}`)
      const payload = (await response.json()) as { files?: FsStatusEntry[] }
      const map: Record<string, FileStatusKind> = {}
      for (const entry of payload.files || []) {
        if (entry?.path && entry.status) map[normalizePath(entry.path)] = entry.status
      }
      statusMap.value = map
      source.value = 'server'
    } catch {
      statusMap.value = {}
      source.value = 'none'
    }
  }

  if (typeof labId !== 'string') {
    watch(labId, () => void refresh(), { immediate: true })
  } else {
    void refresh()
  }
  if (auth && typeof auth !== 'string') {
    watch(auth, () => void refresh())
  }

  return { statusMap, source, refresh }
}

export function normalizePath(p: string): string {
  return String(p || '').replace(/\\/g, '/')
}

/**
 * 只展示服务端基线计算结果，让文件树和编辑器标题共用同一事实来源。
 */
export function resolveFileStatus(
  _labId: string,
  path: string,
  statusMap: Record<string, FileStatusKind>,
  source: FileStatusSource,
): FileStatusKind | null {
  const normalized = normalizePath(path)
  return source === 'server' ? statusMap[normalized] || null : null
}
