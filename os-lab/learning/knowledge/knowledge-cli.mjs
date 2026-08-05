import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openKnowledgeStore } from './knowledge-store.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const command = args.shift() || 'stats'

function option(name, fallback = '') {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const store = openKnowledgeStore({ dbPath: option('--db') || undefined })

try {
  let result
  if (command === 'init' || command === 'stats') {
    result = { ok: true, ...store.stats() }
  } else if (command === 'ingest-labs') {
    const manifest = option('--manifest', path.join(here, 'build', 'lab-manuals', 'manifest.json'))
    result = store.ingestLabManualBuild(manifest, { actor: option('--actor', 'system') })
  } else if (command === 'search') {
    const query = option('--query')
    if (!query) throw new Error('search requires --query')
    result = {
      ok: true,
      query,
      labId: option('--lab') || null,
      results: store.search(query, {
        labId: option('--lab') || undefined,
        limit: Number(option('--limit', '10')),
      }),
    }
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
