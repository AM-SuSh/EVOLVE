import assert from 'node:assert/strict'
import test from 'node:test'
import { renderTutorMarkdown } from './.vitepress/theme/markdown.ts'

test('student tutor markdown hides knowledge source labels and bracketed citations', () => {
  const html = renderTutorMarkdown(
    '请先检查现象 [kb:lab2-trap]，再结合 kb:lab2-task 判断。',
    { showKnowledgeCitations: false },
  )

  assert.doesNotMatch(html, /kb:|ws-kb-citation|来源|\[\s*\]/)
  assert.match(html, /请先检查现象/)
  assert.match(html, /再结合/)
})

test('hiding knowledge citations keeps navigable run and trace evidence', () => {
  const html = renderTutorMarkdown(
    '对照 run:lab2-run-001 与 trace:lab2-run-001。',
    { showKnowledgeCitations: false },
  )

  assert.match(html, /data-ref="run:lab2-run-001"/)
  assert.match(html, /data-ref="trace:lab2-run-001"/)
})
