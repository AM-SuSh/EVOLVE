const DEFAULT_DIMENSIONS = 384

function normalizeVector(vector) {
  const values = Float32Array.from(vector, (value) => Number(value) || 0)
  let squared = 0
  for (const value of values) squared += value * value
  const norm = Math.sqrt(squared)
  if (!norm) return values
  for (let index = 0; index < values.length; index += 1) values[index] /= norm
  return values
}

function fnv1a(value) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const CONCEPT_ALIASES = new Map([
  ['scheduler', 'os:scheduler'], ['调度器', 'os:scheduler'], ['任务调度', 'os:scheduler'],
  ['context switch', 'os:context-switch'], ['上下文切换', 'os:context-switch'], ['任务切换', 'os:context-switch'],
  ['trap', 'os:trap'], ['陷阱', 'os:trap'], ['异常处理', 'os:trap'],
  ['page table', 'os:page-table'], ['页表', 'os:page-table'], ['sv39', 'os:page-table'],
  ['virtual memory', 'os:virtual-memory'], ['虚拟内存', 'os:virtual-memory'],
  ['process', 'os:process'], ['进程', 'os:process'], ['thread', 'os:thread'], ['线程', 'os:thread'],
  ['file system', 'os:file-system'], ['filesystem', 'os:file-system'], ['文件系统', 'os:file-system'],
  ['deadlock', 'os:deadlock'], ['死锁', 'os:deadlock'], ['mutex', 'os:mutex'], ['互斥锁', 'os:mutex'],
  ['interrupt', 'os:interrupt'], ['中断', 'os:interrupt'], ['syscall', 'os:syscall'], ['系统调用', 'os:syscall'],
])

function featureTokens(input) {
  const text = String(input || '').normalize('NFKC').toLowerCase()
  const tokens = []
  for (const match of text.matchAll(/[a-z_][a-z0-9_.:-]{1,}/g)) tokens.push(`w:${match[0]}`)
  for (const match of text.matchAll(/[\u3400-\u9fff]{2,}/g)) {
    const value = match[0]
    if (value.length <= 4) tokens.push(`zh:${value}`)
    for (let index = 0; index <= value.length - 3; index += 1) tokens.push(`zh3:${value.slice(index, index + 3)}`)
  }
  for (const [alias, concept] of CONCEPT_ALIASES) {
    if (text.includes(alias)) tokens.push(concept, concept)
  }
  return tokens
}

export function localFeatureEmbedding(input, dimensions = DEFAULT_DIMENSIONS) {
  const vector = new Float32Array(dimensions)
  for (const token of featureTokens(input)) {
    const hash = fnv1a(token)
    const index = hash % dimensions
    const sign = (hash & 0x80000000) === 0 ? 1 : -1
    vector[index] += sign
  }
  return normalizeVector(vector)
}

export function createLocalEmbeddingProvider(options = {}) {
  const dimensions = Math.max(64, Math.min(Number(options.dimensions) || DEFAULT_DIMENSIONS, 4096))
  return {
    kind: 'local-feature-hash',
    model: `local-feature-hash-v1-${dimensions}`,
    dimensions,
    async embed(texts) {
      return texts.map((text) => localFeatureEmbedding(text, dimensions))
    },
  }
}

export function createOpenAiEmbeddingProvider(options = {}) {
  const baseUrl = String(options.baseUrl || '').replace(/\/$/, '')
  const model = String(options.model || '').trim()
  const apiKey = String(options.apiKey || '')
  const fetchImpl = options.fetchImpl || fetch
  if (!/^https?:\/\//.test(baseUrl) || !model) throw new TypeError('embedding baseUrl and model are required')
  return {
    kind: 'openai-compatible',
    model: `openai:${model}`,
    dimensions: Number(options.dimensions) || 0,
    async embed(texts) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 30_000)
      try {
        const response = await fetchImpl(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ model, input: texts }),
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error?.message || `embedding API returned ${response.status}`)
        const ordered = [...(payload.data || [])].sort((a, b) => Number(a.index) - Number(b.index))
        if (ordered.length !== texts.length) throw new Error('embedding API returned an incomplete batch')
        return ordered.map((item) => normalizeVector(item.embedding || []))
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

export function createEmbeddingProvider(options = {}) {
  const baseUrl = options.baseUrl ?? process.env.OS_LAB_EMBEDDING_BASE_URL
  const model = options.model ?? process.env.OS_LAB_EMBEDDING_MODEL
  if (baseUrl && model) {
    return createOpenAiEmbeddingProvider({
      baseUrl,
      model,
      apiKey: options.apiKey ?? process.env.OS_LAB_EMBEDDING_API_KEY,
      dimensions: options.dimensions ?? process.env.OS_LAB_EMBEDDING_DIMENSIONS,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    })
  }
  return createLocalEmbeddingProvider(options)
}

export function encodeVector(vector) {
  const normalized = normalizeVector(vector)
  return Buffer.from(normalized.buffer, normalized.byteOffset, normalized.byteLength)
}

export function decodeVector(blob, dimensions) {
  const buffer = Buffer.from(blob)
  if (buffer.byteLength !== Number(dimensions) * 4) throw new Error('stored embedding has invalid dimensions')
  return new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
}

export function cosineSimilarity(left, right) {
  if (left.length !== right.length) return -1
  let score = 0
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index]
  return score
}
