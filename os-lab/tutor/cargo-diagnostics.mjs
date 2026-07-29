import path from 'node:path'

const ANSI_CSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g

function workspacePath(fileName, workspaceRoot) {
  const raw = String(fileName || '')
  if (!raw) return null
  const relative = path.isAbsolute(raw) ? path.relative(workspaceRoot, raw) : raw
  const normalized = relative.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized === '..') return null
  if (normalized.startsWith('../')) {
    // Windows 的 TEMP 可能以 8.3 短路径作为 cwd，而 rustc span 返回长路径。
    // 只从已知工作区 crate 根恢复相对路径，最终打开文件时仍会再次做目录边界校验。
    const absoluteNormalized = raw.replace(/\\/g, '/')
    const cratePath = absoluteNormalized.match(/(?:^|\/)((?:kernel|user|os-[^/]+)\/.*)$/)?.[1]
    return cratePath || null
  }
  return normalized
}

export function parseCargoMessageLine(line, workspaceRoot) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return { handled: false, output: line }
  }
  if (!message || typeof message !== 'object' || typeof message.reason !== 'string') {
    return { handled: false, output: line }
  }
  if (message.reason !== 'compiler-message') return { handled: true, output: '' }

  const diagnostic = message.message || {}
  const spans = Array.isArray(diagnostic.spans) ? diagnostic.spans : []
  const span = spans.find((item) => item?.is_primary) || spans[0]
  const file = workspacePath(span?.file_name, workspaceRoot)
  const rendered = String(diagnostic.rendered || '').replace(ANSI_CSI_RE, '')
  if (!file || !Number.isInteger(span?.line_start) || span.line_start < 1) {
    return { handled: true, output: rendered }
  }

  return {
    handled: true,
    output: rendered,
    diagnostic: {
      level: String(diagnostic.level || 'error').slice(0, 32),
      code: String(diagnostic.code?.code || diagnostic.level || 'rustc').slice(0, 80),
      message: String(diagnostic.message || 'Rust 编译诊断').slice(0, 8000),
      file,
      line: span.line_start,
      column: Number.isInteger(span.column_start) ? Math.max(1, span.column_start) : 1,
      endLine: Number.isInteger(span.line_end) ? Math.max(span.line_start, span.line_end) : span.line_start,
      endColumn: Number.isInteger(span.column_end) ? Math.max(1, span.column_end) : 1,
      rendered: rendered.slice(0, 32_768),
    },
  }
}

export function createCargoJsonCollector(workspaceRoot, onOutput, onDiagnostic) {
  let buffer = ''

  function processLine(line, terminated) {
    const parsed = parseCargoMessageLine(line, workspaceRoot)
    if (parsed.diagnostic) onDiagnostic(parsed.diagnostic)
    if (parsed.output) onOutput(`${parsed.output}${terminated && !parsed.output.endsWith('\n') ? '\n' : ''}`)
  }

  return {
    push(chunk) {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) processLine(line, true)
    },
    flush() {
      if (buffer) processLine(buffer, false)
      buffer = ''
    },
  }
}
