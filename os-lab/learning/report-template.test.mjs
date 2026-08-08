import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FIXED_REFLECTION,
  createInitialReportDraft,
  getReportTemplate,
  normalizeReportTemplate,
} from './report-template.mjs'

test('initial report draft is an independent copy of the teacher template', () => {
  const source = {
    intro: '按课程要求填写。',
    includePromptsInMarkdown: true,
    sections: [{ id: 'observe', title: '现象记录', prompt: '写出运行现象。', rows: 6 }],
  }
  const draft = createInitialReportDraft('lab1', source)

  assert.equal(draft.labId, 'lab1')
  assert.equal(draft.mode, 'markdown')
  assert.deepEqual(draft.sections, { observe: '', [FIXED_REFLECTION.id]: '' })
  assert.deepEqual(draft.template.reflection, FIXED_REFLECTION)
  assert.match(draft.markdownBody, /^## 现象记录/m)
  assert.match(draft.markdownBody, /> \*\*填写提示：\*\* 写出运行现象。/)
  assert.deepEqual(draft.template, normalizeReportTemplate(source))

  source.sections[0].title = '已被外部修改'
  assert.equal(draft.template.sections[0].title, '现象记录')
})

test('initial report draft follows the prompt visibility selected by the teacher', () => {
  const draft = createInitialReportDraft('lab2', {
    includePromptsInMarkdown: false,
    sections: [{ id: 'result', title: '验证结果', prompt: '不会写入正文', rows: 4 }],
  })

  assert.match(draft.markdownBody, /^## 验证结果/m)
  assert.doesNotMatch(draft.markdownBody, /不会写入正文/)
})

test('per-lab templates fall back to the teacher default', () => {
  const defaultTemplate = {
    sections: [{ id: 'shared', title: '统一报告格式', prompt: '所有 Lab 使用', rows: 4 }],
  }
  const lab3Template = {
    sections: [{ id: 'memory', title: 'Lab3 专用格式', prompt: '仅 Lab3 使用', rows: 4 }],
  }
  const config = { reportTemplates: { default: defaultTemplate, lab3: lab3Template } }

  assert.equal(getReportTemplate(config, 'lab1').sections[0].title, '统一报告格式')
  assert.equal(getReportTemplate(config, 'lab3').sections[0].title, 'Lab3 专用格式')
})

test('reflection keeps its fixed id and never restores a configured prompt', () => {
  const template = normalizeReportTemplate({
    sections: [{ id: 'observe', title: '观察记录', prompt: '记录现象。', rows: 4 }],
    reflection: { id: 'another-id', title: '本周复盘', prompt: '写清判断和证据。', rows: 7 },
  })

  assert.deepEqual(template.reflection, {
    id: FIXED_REFLECTION.id,
    title: '本周复盘',
    prompt: '',
    rows: 7,
  })
})
