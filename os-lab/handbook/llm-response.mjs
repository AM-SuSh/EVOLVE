function textFromValue(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textFromValue).join('')
  if (!value || typeof value !== 'object') return ''

  if (typeof value.text === 'string') return value.text
  if (typeof value.text?.value === 'string') return value.text.value
  if (typeof value.value === 'string' && value.type === 'text') return value.value
  if (value.content !== undefined) return textFromValue(value.content)
  return ''
}

/** Extract final text from common Chat Completions and Responses API payloads. */
export function extractCompletionText(payload, { allowReasoning = true } = {}) {
  if (!payload || typeof payload !== 'object') return ''

  const choice = payload.choices?.[0]
  const candidates = [
    choice?.message?.content,
    choice?.delta?.content,
    choice?.message?.refusal,
    choice?.delta?.refusal,
    choice?.text,
    payload.output_text,
    payload.text,
    payload.output,
  ]

  for (const candidate of candidates) {
    const text = textFromValue(candidate)
    if (text) return text
  }

  if (!allowReasoning) return ''
  return extractReasoningText(payload)
}

/** Extract one streamed text fragment without mixing reasoning into the normal answer. */
export function extractStreamText(payload) {
  if (!payload || typeof payload !== 'object') return ''

  const choice = payload.choices?.[0]
  const directDelta =
    typeof payload.delta === 'string' && String(payload.type || '').includes('output_text')
      ? payload.delta
      : ''
  const candidates = [
    choice?.delta?.content,
    directDelta,
    choice?.text,
  ]
  for (const candidate of candidates) {
    const text = textFromValue(candidate)
    if (text) return text
  }
  return ''
}

/** Aggregate an OpenAI-compatible SSE response without duplicating completed payloads. */
export function extractSseCompletionText(raw) {
  let streamed = ''
  let completionFallback = ''
  let reasoningFallback = ''
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(':')) continue
    const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
    if (!data || data === '[DONE]') continue
    let payload
    try {
      payload = JSON.parse(data)
    } catch {
      continue
    }
    const delta = extractStreamText(payload)
    if (delta) streamed += delta
    else {
      completionFallback = extractCompletionText(payload, { allowReasoning: false }) || completionFallback
      reasoningFallback += extractReasoningText(payload)
    }
  }
  return streamed || completionFallback || reasoningFallback
}

export function extractReasoningText(payload) {
  const choice = payload?.choices?.[0]
  const candidates = [
    choice?.delta?.reasoning_content,
    choice?.message?.reasoning_content,
    choice?.delta?.reasoning,
    choice?.message?.reasoning,
    choice?.delta?.analysis,
    choice?.message?.analysis,
    payload?.reasoning,
  ]
  for (const candidate of candidates) {
    const text = textFromValue(candidate)
    if (text) return text
  }
  return ''
}

export function emptyCompletionReason(payload) {
  const choice = payload?.choices?.[0]
  const finishReason = choice?.finish_reason || payload?.status
  if (finishReason === 'length' || finishReason === 'incomplete') {
    return '上游模型在生成正文前已达到输出长度限制'
  }
  if (finishReason === 'content_filter') return '上游模型未返回正文（内容过滤）'
  if (finishReason === 'tool_calls' || finishReason === 'function_call') {
    return '上游模型只返回了工具调用，当前导师无法显示该响应'
  }
  return '上游模型没有返回文本'
}

/** Describe only the response shape so diagnostics never print model output or credentials. */
export function describePayloadShape(payload) {
  if (!payload || typeof payload !== 'object') return typeof payload
  const choice = payload.choices?.[0]
  return JSON.stringify({
    topLevelKeys: Object.keys(payload).slice(0, 20),
    choiceKeys: choice && typeof choice === 'object' ? Object.keys(choice).slice(0, 20) : [],
    messageKeys:
      choice?.message && typeof choice.message === 'object' ? Object.keys(choice.message).slice(0, 20) : [],
    deltaKeys: choice?.delta && typeof choice.delta === 'object' ? Object.keys(choice.delta).slice(0, 20) : [],
    finishReason: choice?.finish_reason || payload.status || '',
    outputCount: Array.isArray(payload.output) ? payload.output.length : undefined,
  })
}
