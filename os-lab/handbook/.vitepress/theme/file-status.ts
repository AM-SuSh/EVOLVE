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

/**
 * 第一周 mock：按 Lab 与路径返回状态，待 GET /fs/status 后替换。
 * Lab2 fill/debug：task.rs 为待完成，Cargo.toml 为自动生成。
 */
export function mockFileStatus(labId: string, path: string): FileStatusKind | null {
  const normalized = path.replace(/\\/g, '/')
  if (labId === 'lab2') {
    if (normalized === 'kernel/src/task.rs') return 'todo'
    if (normalized.endsWith('Cargo.toml')) return 'generated'
    if (normalized === 'kernel/src/trap.rs') return 'added'
  }
  if (labId === 'lab3') {
    if (normalized.includes('memory') || normalized.includes('page_table')) return 'todo'
    if (normalized.endsWith('Cargo.toml')) return 'generated'
  }
  return null
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
