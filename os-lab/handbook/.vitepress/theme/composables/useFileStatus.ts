import { ref, watch, type Ref } from 'vue'
import { authHeaders } from '../tutor-model'
import { mockFileStatus, type FileStatusKind } from '../file-status'

export type FileStatusSource = 'server' | 'mock' | 'none'

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
 * 拉取学生工作区文件状态。成员 C 的 `GET /fs/status?labId=...` 尚未就绪时，
 * 回退到 `mockFileStatus` 并把 source 标记为 'mock'，让 UI 能提示「本地推测」。
 *
 * 不抛错：网络/服务异常一律降级，避免阻塞编辑器使用。
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
      // 服务端未提供：回退 mock，UI 可据此显示「本地推测」。
      statusMap.value = {}
      source.value = 'mock'
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
 * 在 server 模式下查 statusMap；mock/none 模式回退到 mockFileStatus。
 * 让文件树/编辑器标题共用同一入口。
 */
export function resolveFileStatus(
  labId: string,
  path: string,
  statusMap: Record<string, FileStatusKind>,
  source: FileStatusSource,
): FileStatusKind | null {
  const normalized = normalizePath(path)
  if (source === 'server') {
    return statusMap[normalized] || null
  }
  return mockFileStatus(labId, normalized)
}
