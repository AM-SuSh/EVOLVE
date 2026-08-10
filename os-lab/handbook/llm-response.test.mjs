import test from 'node:test'
import assert from 'node:assert/strict'
import {
  describePayloadShape,
  emptyCompletionReason,
  extractCompletionText,
  extractReasoningText,
  extractSseCompletionText,
  extractStreamText,
} from './llm-response.mjs'

test('extracts standard chat completion text', () => {
  assert.equal(
    extractCompletionText({ choices: [{ message: { content: '标准回答' } }] }),
    '标准回答',
  )
})

test('extracts array content and Responses API output', () => {
  assert.equal(
    extractCompletionText({ choices: [{ message: { content: [{ type: 'text', text: '数组回答' }] } }] }),
    '数组回答',
  )
  assert.equal(
    extractCompletionText({ output: [{ content: [{ type: 'output_text', text: 'Responses 回答' }] }] }),
    'Responses 回答',
  )
})

test('uses reasoning only as a final-response fallback', () => {
  const payload = { choices: [{ message: { content: '', reasoning_content: '推理模型回答' } }] }
  assert.equal(extractCompletionText(payload), '推理模型回答')
  assert.equal(extractCompletionText(payload, { allowReasoning: false }), '')
  assert.equal(extractReasoningText({ choices: [{ message: { reasoning: '兼容推理字段' } }] }), '兼容推理字段')
  assert.equal(extractCompletionText({ choices: [{ message: { reasoning: '兼容推理字段' } }] }), '兼容推理字段')
})

test('extracts chat and Responses API stream deltas', () => {
  assert.equal(extractStreamText({ choices: [{ delta: { content: '片段一' } }] }), '片段一')
  assert.equal(
    extractStreamText({ type: 'response.output_text.delta', delta: '片段二' }),
    '片段二',
  )
  assert.equal(extractReasoningText({ choices: [{ delta: { reasoning_content: '思考片段' } }] }), '思考片段')
})

test('does not treat a completed Responses payload as another stream delta', () => {
  const completed = {
    type: 'response.completed',
    output: [{ content: [{ type: 'output_text', text: '完整回答' }] }],
  }
  assert.equal(extractStreamText(completed), '')
  assert.equal(extractCompletionText(completed), '完整回答')
})

test('aggregates OpenAI-compatible SSE text with completion and reasoning fallbacks', () => {
  assert.equal(
    extractSseCompletionText([
      'data: {"choices":[{"delta":{"content":"片段一"}}]}',
      'data: {"type":"response.output_text.delta","delta":"片段二"}',
      'data: [DONE]',
    ].join('\n\n')),
    '片段一片段二',
  )
  assert.equal(
    extractSseCompletionText('data: {"choices":[{"message":{"content":"完整回答"}}]}\n\ndata: [DONE]'),
    '完整回答',
  )
  assert.equal(
    extractSseCompletionText('data: {"choices":[{"delta":{"reasoning_content":"推理兜底"}}]}\n\ndata: [DONE]'),
    '推理兜底',
  )
})

test('payload diagnostics contain shape but not response text', () => {
  const shape = describePayloadShape({ choices: [{ message: { content: '不可泄露的回答' } }] })
  assert.match(shape, /messageKeys/)
  assert.doesNotMatch(shape, /不可泄露/)
})

test('explains known empty completion causes', () => {
  assert.equal(
    emptyCompletionReason({ choices: [{ finish_reason: 'length' }] }),
    '上游模型在生成正文前已达到输出长度限制',
  )
  assert.match(emptyCompletionReason({ choices: [{ finish_reason: 'tool_calls' }] }), /工具调用/)
})
