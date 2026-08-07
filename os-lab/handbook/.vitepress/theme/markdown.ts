import MarkdownIt from 'markdown-it'

/**
 * 导师回复的 Markdown 渲染器。
 *
 * 旧版把模型输出当纯文本塞进 <p>，于是 `sepc`、`csrrw`、分步清单和代码片段
 * 全部糊成一段。OS 导师几乎每句话都在讲寄存器和控制流，这里必须渲染。
 *
 * html:false —— 模型输出按不可信内容处理，不允许内联 HTML。
 * 不接运行时 shiki：流式输出时每个 delta 都会重渲染，高亮器会明显拖慢。
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

// 代码块渲染成带语言标签和复制按钮的容器。
// 复制交互由 TutorMessage.vue 用事件委托处理，避免往 v-html 里塞 Vue 监听器。
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const lang = (token.info || '').trim().split(/\s+/)[0] || 'text'
  const code = token.content.replace(/\n$/, '')
  return [
    '<div class="ws-code">',
    `<div class="ws-code-head"><span>${md.utils.escapeHtml(lang)}</span>`,
    '<button type="button" class="ws-code-copy" aria-label="复制这段代码">复制</button></div>',
    `<pre><code>${md.utils.escapeHtml(code)}</code></pre>`,
    '</div>',
  ].join('')
}

// 外链在新标签打开，避免学生在对话中途跳走丢掉会话。
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || ''
  if (/^https?:\/\//.test(href)) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

/** 匹配正文中的证据与知识库引用；code / fence 内不替换。 */
const EVIDENCE_REF_RE =
  /\b((?:run|trace):[A-Za-z0-9][A-Za-z0-9._-]{3,120}|kb:[A-Za-z0-9][A-Za-z0-9._:-]{1,160})\b/g

function linkifyEvidenceRefs(html: string): string {
  // 只处理标签外文本，避免破坏 code / button / a 属性。
  return html.replace(/(<[^>]+>)|([^<]+)/g, (chunk, tag: string | undefined, text: string | undefined) => {
    if (tag) return tag
    if (!text) return chunk
    return text.replace(EVIDENCE_REF_RE, (_match, ref: string) => {
      const safe = md.utils.escapeHtml(ref)
      if (ref.startsWith('kb:')) {
        return `<span class="ws-kb-citation" aria-label="知识库来源 ${safe}" title="知识库来源 ${safe}">来源</span>`
      }
      return `<button type="button" class="ws-evidence-link" data-ref="${safe}">${safe}</button>`
    })
  })
}

export function renderTutorMarkdown(source: string): string {
  return linkifyEvidenceRefs(md.render(source || ''))
}
