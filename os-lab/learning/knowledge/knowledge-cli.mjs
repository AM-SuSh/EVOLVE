import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openKnowledgeStore } from './knowledge-store.mjs'
import { createHybridRetriever } from './hybrid-retriever.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const command = args.shift() || 'stats'

function option(name, fallback = '') {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const store = openKnowledgeStore({ dbPath: option('--db') || undefined })
const retriever = createHybridRetriever(store)

try {
  let result
  if (command === 'init' || command === 'stats') {
    result = { ok: true, ...store.stats() }
  } else if (command === 'ingest-labs') {
    const manifest = option('--manifest', path.join(here, 'build', 'lab-manuals', 'manifest.json'))
    result = store.ingestLabManualBuild(manifest, { actor: option('--actor', 'system') })
  } else if (command === 'build-sources') {
    const manifest = option('--manifest', path.join(here, 'build', 'knowledge-sources', 'manifest.json'))
    result = store.ingestKnowledgeBuild(manifest, { actor: option('--actor', 'system') })
  } else if (command === 'search') {
    const query = option('--query')
    if (!query) throw new Error('search requires --query')
    const hybrid = await retriever.search(query, {
      labId: option('--lab') || undefined,
      limit: Number(option('--limit', '10')),
    })
    result = {
      ok: true,
      query,
      labId: option('--lab') || null,
      results: hybrid.results,
      retrieval: hybrid.diagnostics,
    }
  } else if (command === 'embed') {
    result = await retriever.index({ sourceId: option('--source') || undefined })
  } else if (command === 'versions') {
    const sourceId = option('--source', 'platform-lab-manuals')
    result = { ok: true, sourceId, versions: store.listVersions(sourceId) }
  } else if (command === 'rollback') {
    const sourceId = option('--source')
    const versionId = option('--version')
    if (!sourceId || !versionId) throw new Error('rollback requires --source and --version')
    result = store.rollbackSource(sourceId, versionId, { actor: option('--actor', 'teacher') })
  } else {
    throw new Error(`unknown command: ${command}`)
  }
  console.log(JSON.stringify(result, null, 2))
} finally {
  store.close()
}
