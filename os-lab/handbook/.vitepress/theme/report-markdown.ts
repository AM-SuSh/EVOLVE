import MarkdownIt from 'markdown-it'

/**
 * 实验报告 Markdown 渲染。
 * 图片请用 renderReportHtml + resolveAttachment，避免 blob:/带空格文件名被 Markdown 吃掉。
 */
export function createReportMarkdown() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
  })

  const defaultValidate = md.validateLink.bind(md)
  md.validateLink = (url) => {
    const value = String(url || '').trim().toLowerCase()
    if (
      value.startsWith('blob:') ||
      value.startsWith('data:image/') ||
      value.startsWith('attachment:')
    ) {
      return true
    }
    return defaultValidate(url)
  }

  const defaultImage =
    md.renderer.rules.image ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    token.attrSet('loading', 'eager')
    const cls = token.attrGet('class')
    token.attrSet('class', cls ? `${cls} ws-report-img` : 'ws-report-img')
    return defaultImage(tokens, idx, options, env, self)
  }

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const lang = (token.info || '').trim().split(/\s+/)[0] || 'text'
    const code = token.content.replace(/\n$/, '')
    return [
      '<div class="ws-report-code">',
      `<div class="ws-report-code-head"><span>${md.utils.escapeHtml(lang)}</span></div>`,
      `<pre><code>${md.utils.escapeHtml(code)}</code></pre>`,
      '</div>',
    ].join('')
  }

  return (source: string) => md.render(source || '')
}

function escapeAttr(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 把 `attachment:` 图片换成占位符再 Markdown 渲染，最后注入真实 `<img>`。
 * 这样不依赖 Markdown 能否解析 blob:/带空格 URL。
 */
export function renderReportHtml(
  source: string,
  resolveAttachment: (ref: string) => string | null,
  renderMarkdown: (src: string) => string = createReportMarkdown(),
) {
  const images: Array<{ url: string; alt: string }> = []
  const withMarkers = String(source || '').replace(
    /!\[([^\]]*)\]\(attachment:([^)]+)\)/g,
    (_all, alt, ref) => {
      const key = String(ref || '').trim()
      const url = resolveAttachment(key)
      const label = String(alt || key).replace(/[[\]]/g, '')
      if (!url) return `\n\n> ⚠ 图片「${label}」暂时无法预览（可删掉后重新点「插图」）\n\n`
      const idx = images.length
      images.push({ url, alt: label })
      return `\n\n⟦OSLABIMG${idx}⟧\n\n`
    },
  )

  let html = renderMarkdown(withMarkers)

  images.forEach((img, idx) => {
    const mark = `⟦OSLABIMG${idx}⟧`
    const tag = `<img class="ws-report-img" src="${escapeAttr(img.url)}" alt="${escapeAttr(img.alt)}" loading="eager" />`
    html = html.split(`<p>${mark}</p>`).join(tag)
    html = html.split(mark).join(tag)
  })

  // 兜底：若仍有 attachment: 留在 img src（旧路径），再解析一次。
  html = html.replace(/src="attachment:([^"]+)"/g, (_all, ref) => {
    const url = resolveAttachment(String(ref || '').trim())
    return url ? `src="${escapeAttr(url)}"` : _all
  })

  return html
}
