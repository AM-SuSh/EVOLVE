import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(here, '..', '..', '..')
const inventoryPath = path.join(here, 'sources.json')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function pathExists(relativePath) {
  const resolved = path.resolve(workspaceRoot, relativePath)
  assert(
    resolved === workspaceRoot || resolved.startsWith(`${workspaceRoot}${path.sep}`),
    `path escapes workspace: ${relativePath}`,
  )
  await access(resolved)
}

const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'))
assert(inventory.schemaVersion === 1, 'schemaVersion must be 1')
assert(Array.isArray(inventory.sources) && inventory.sources.length > 0, 'sources must be a non-empty array')

const ids = new Set()
let checkedLocalPaths = 0
let checkedPinnedSources = 0
let checkedFileCollections = 0

for (const source of inventory.sources) {
  assert(typeof source.id === 'string' && source.id.length > 0, 'every source requires an id')
  assert(!ids.has(source.id), `duplicate source id: ${source.id}`)
  ids.add(source.id)
  assert(source.status === 'selected', `source ${source.id} must be selected`)
  assert(typeof source.sourceType === 'string' && source.sourceType.length > 0, `missing sourceType: ${source.id}`)
  assert(typeof source.format === 'string' && source.format.length > 0, `missing format: ${source.id}`)

  const localPaths = [
    ...(Array.isArray(source.paths) ? source.paths : []),
    ...(typeof source.path === 'string' ? [source.path] : []),
  ]
  for (const localPath of localPaths) {
    await pathExists(localPath)
    checkedLocalPaths += 1
  }

  if (['git', 'website'].includes(source.sourceType)) {
    assert(/^https:\/\//.test(String(source.url || '')), `remote source requires HTTPS URL: ${source.id}`)
    if (Array.isArray(source.downloadFiles)) {
      assert(String(source.urlTemplate || '').startsWith('https://') && String(source.urlTemplate).includes('{file}'), `file collection requires an HTTPS {file} template: ${source.id}`)
      assert(source.downloadFiles.length > 0 && new Set(source.downloadFiles).size === source.downloadFiles.length, `file collection requires unique files: ${source.id}`)
      for (const file of source.downloadFiles) {
        assert(typeof file === 'string' && !path.posix.isAbsolute(file) && !file.split('/').includes('..'), `unsafe collection file in ${source.id}: ${file}`)
      }
      checkedFileCollections += 1
    } else {
      assert(/^[a-f0-9]{40}$/.test(String(source.pinnedCommit || '')), `remote source requires a pinned commit: ${source.id}`)
      const repository = String(source.snapshotRepository || source.url || '')
      assert(repository.startsWith('https://github.com/'), `remote snapshot must use a GitHub repository: ${source.id}`)
      checkedPinnedSources += 1
    }
  }

}

assert(inventory.sources.length >= 5, 'inventory must select at least five sources')

console.log(JSON.stringify({
  ok: true,
  inventoryVersion: inventory.inventoryVersion,
  totalSources: inventory.sources.length,
  checkedLocalPaths,
  checkedPinnedSources,
  checkedFileCollections,
}, null, 2))
