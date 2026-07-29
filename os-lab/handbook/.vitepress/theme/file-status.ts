/** 学生工作区文件状态（与 lab.yaml starter_files 及 /fs/status API 对齐）。 */
export type FileStatusKind = 'added' | 'modified' | 'todo' | 'generated' | 'conflict'

export interface FileStatusMeta {
  kind: FileStatusKind
  /** 无障碍与 title 用的完整说明 */
  label: string
  /** 树节点旁显示的短标记 */
  badge: string
}

export const FILE_STATUS_META: Record<FileStatusKind, FileStatusMeta> = {
  added: { kind: 'added', badge: 'A', label: '本 Lab 新增文件' },
  modified: { kind: 'modified', badge: 'M', label: '你已修改' },
  todo: { kind: 'todo', badge: 'T', label: '待完成任务文件' },
  generated: { kind: 'generated', badge: 'G', label: '自动生成，建议只读' },
  conflict: { kind: 'conflict', badge: '!', label: '与参考基线冲突或过期' },
}

export interface FileStatusRecord {
  path: string
  introducedBy: string
  status: FileStatusKind | null
  baselineHash: string
  currentHash: string | null
}

/** 根据扩展名推断 Monaco 语言 ID。 */
export function monacoLanguageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (ext === 'rs') return 'rust'
  if (ext === 'toml') return 'toml'
  if (ext === 'md') return 'markdown'
  if (ext === 'asm' || ext === 's') return 'plaintext'
  if (ext === 'ld') return 'plaintext'
  if (ext === 'json') return 'json'
  return 'plaintext'
}
