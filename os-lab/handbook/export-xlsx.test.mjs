import test from 'node:test'
import assert from 'node:assert/strict'
import { buildXlsxBlob } from './export-xlsx.mjs'

test('buildXlsxBlob produces a valid stored ZIP with worksheet data', async () => {
  const blob = buildXlsxBlob([
    ['student', 'variant', 'note'],
    ['2026001', 'fill', 'fill-in the kernel'],
    ['2026002', 'debug', 'a<b & c>d'],
  ])
  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]) // PK\x03\x04
  const text = new TextDecoder().decode(bytes)
  assert.match(text, /\[Content_Types\]\.xml/)
  assert.match(text, /xl\/worksheets\/sheet1\.xml/)
  assert.match(text, /TaskAssignment/)
  assert.match(text, /2026001/)
  assert.match(text, /a&lt;b &amp; c&gt;d/)
})

test('buildXlsxBlob escapes quotes inside inline strings', async () => {
  const blob = buildXlsxBlob([['name'], ['Zhang "Three"']])
  const text = new TextDecoder().decode(await blob.arrayBuffer())
  assert.match(text, /Zhang &quot;Three&quot;/)
})
