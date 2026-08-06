import { createEmbeddingProvider, cosineSimilarity, decodeVector, encodeVector } from './embedding-provider.mjs'

const DEFAULT_CLASSES = ['student-safe', 'guided-hint']

function batches(items, size) {
  const result = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

export function createHybridRetriever(store, options = {}) {
  const provider = options.provider || createEmbeddingProvider(options.embedding || {})
  const candidateLimit = Math.max(10, Math.min(Number(options.candidateLimit) || 40, 200))
  const batchSize = Math.max(1, Math.min(Number(options.batchSize) || 32, 128))

  async function ensureEmbeddings(candidates) {
    const existing = new Map(store.getEmbeddings(provider.model, candidates.map((item) => item.id)).map((item) => [item.chunkId, item]))
    const missing = candidates.filter((item) => existing.get(item.id)?.contentHash !== item.contentHash)
    let dimensions = Number(provider.dimensions) || Number(existing.values().next().value?.dimensions) || 0
    let upserted = 0
    for (const group of batches(missing, batchSize)) {
      const vectors = await provider.embed(group.map((item) => `${item.sectionPath.join(' > ')}\n${item.text}`))
      if (vectors.length !== group.length) throw new Error('embedding provider returned an incomplete batch')
      dimensions ||= vectors[0]?.length || 0
      if (!dimensions || vectors.some((vector) => vector.length !== dimensions)) throw new Error('embedding dimensions are inconsistent')
      store.upsertEmbeddings(provider.model, dimensions, group.map((item, index) => ({
        chunkId: item.id,
        contentHash: item.contentHash,
        vectorBlob: encodeVector(vectors[index]),
      })))
      upserted += group.length
    }
    return { model: provider.model, dimensions, upserted }
  }

  async function index(indexOptions = {}) {
    const candidates = store.listRetrievalCandidates({
      sourceId: indexOptions.sourceId,
      allowedClasses: indexOptions.allowedClasses || ['student-safe', 'guided-hint', 'teacher-only'],
      limit: indexOptions.limit || 10_000,
    })
    const pruned = store.pruneStaleEmbeddings({ model: provider.model, sourceId: indexOptions.sourceId })
    const result = await ensureEmbeddings(candidates)
    return { ok: true, provider: provider.kind, candidates: candidates.length, pruned, ...result }
  }

  async function search(query, searchOptions = {}) {
    const text = String(query || '').trim()
    if (!text) return { results: [], diagnostics: { provider: provider.kind, model: provider.model, fallbackReason: 'empty-query' } }
    const allowedClasses = searchOptions.allowedClasses || DEFAULT_CLASSES
    const labId = searchOptions.labId || undefined
    const limit = Math.max(1, Math.min(Number(searchOptions.limit) || 10, 50))
    const lexical = store.search(text, { labId, allowedClasses, limit: candidateLimit })
    const eligible = store.listRetrievalCandidates({ labId, allowedClasses, limit: 10_000 })
    const byId = new Map(eligible.map((item) => [item.id, item]))
    let vector = []
    let fallbackReason = ''
    try {
      const indexed = await ensureEmbeddings(eligible)
      const [queryVector] = await provider.embed([text])
      if (!queryVector?.length || queryVector.length !== indexed.dimensions) throw new Error('query embedding dimensions do not match index')
      const cached = store.getEmbeddings(provider.model, eligible.map((item) => item.id))
      vector = cached.map((item) => ({
        item: byId.get(item.chunkId),
        similarity: cosineSimilarity(queryVector, decodeVector(item.vectorBlob, item.dimensions)),
      })).filter((item) => item.item && item.similarity >= 0.05)
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, candidateLimit)
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : String(error)
    }

    const fused = new Map()
    const add = (item, kind, rank, similarity = null) => {
      const current = fused.get(item.id) || { item, lexicalRank: null, vectorRank: null, vectorSimilarity: null, rrf: 0 }
      current.rrf += 1 / (60 + rank)
      if (kind === 'lexical') current.lexicalRank = rank
      else { current.vectorRank = rank; current.vectorSimilarity = similarity }
      fused.set(item.id, current)
    }
    lexical.forEach((item, index) => add(byId.get(item.id) || item, 'lexical', index + 1))
    vector.forEach((entry, index) => add(entry.item, 'vector', index + 1, entry.similarity))

    const ranked = [...fused.values()].map((entry) => {
      const exactLab = Boolean(labId && entry.item.labScopes?.includes(labId))
      const authorityBoost = Math.max(0, Math.min(Number(entry.item.sourceAuthority || 0), 100)) / 25_000
      const labBoost = exactLab ? 0.003 : 0
      return {
        ...entry.item,
        retrieval: {
          score: entry.rrf + authorityBoost + labBoost,
          rrf: entry.rrf,
          lexicalRank: entry.lexicalRank,
          vectorRank: entry.vectorRank,
          vectorSimilarity: entry.vectorSimilarity,
          authorityBoost,
          exactLabBoost: labBoost,
          provider: provider.kind,
          model: provider.model,
        },
      }
    }).sort((left, right) => right.retrieval.score - left.retrieval.score).slice(0, limit)

    store.recordRetrieval({
      query: text, labId, provider: `${provider.kind}:${provider.model}`,
      lexicalCount: lexical.length, vectorCount: vector.length,
      selectedIds: ranked.map((item) => item.id), fallbackReason,
    })
    return {
      results: ranked,
      diagnostics: {
        provider: provider.kind,
        model: provider.model,
        lexicalCandidates: lexical.length,
        vectorCandidates: vector.length,
        eligibleChunks: eligible.length,
        fallbackReason,
      },
    }
  }

  return { provider, index, search }
}
