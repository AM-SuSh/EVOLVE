/**
 * 实验报告版式：默认模板 + 规范化（教师布置 / 学生端共用）。
 * 老师配置正文各节和复盘文案；复盘字段 ID 由系统固定。
 */

/** 系统固定的复盘字段 ID；教师可覆盖显示文案，不能改变其标识。 */
export const FIXED_REFLECTION = {
  id: 'reflection',
  title: '收获与反思',
  prompt: '试着写三句：现在能独立讲清楚什么？导师/AI 提醒了哪一点？哪条运行结果证明了它？',
  rows: 4,
}

export const DEFAULT_REPORT_SECTIONS = [
  {
    id: 'goal',
    title: '一、实验目标与准备',
    prompt: '这次实验你想弄懂什么？动手前你打算怎么验证？',
    rows: 4,
  },
  {
    id: 'process',
    title: '二、过程记录',
    prompt: '记下你做了什么、看到了什么，并挑选关键运行结果作为证据。',
    rows: 6,
  },
  {
    id: 'problems',
    title: '三、遇到的问题与解决',
    prompt: '卡住时按「看到了什么 → 我猜原因是 → 我怎么验证 → 结论」写下来。',
    rows: 5,
  },
  {
    id: 'findings',
    title: '四、思考题与发现',
    prompt: '回答手册里的思考题，也可以写读代码时忽然明白的地方。',
    rows: 5,
  },
]

export function defaultReportTemplate() {
  return {
    intro: '请按下列小节完成本次实验报告。带「提示」的句子是老师布置的填写要求，请对照着写。',
    includePromptsInMarkdown: true,
    sections: DEFAULT_REPORT_SECTIONS.map((section) => ({ ...section })),
    reflection: { ...FIXED_REFLECTION },
  }
}

function safeId(value, fallback) {
  const id = String(value || '')
    .trim()
    .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
    .slice(0, 48)
  return id || fallback
}

function isReflectionLike(id, title) {
  if (id === 'reflection' || id === FIXED_REFLECTION.id) return true
  return /收获与反思|反思|体会总结/.test(String(title || ''))
}

function normalizeReflection(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    id: FIXED_REFLECTION.id,
    title:
      String(source.title || FIXED_REFLECTION.title).trim().slice(0, 80) || FIXED_REFLECTION.title,
    prompt:
      String(source.prompt || FIXED_REFLECTION.prompt).trim().slice(0, 800) || FIXED_REFLECTION.prompt,
    rows: Math.min(20, Math.max(2, Number(source.rows) || FIXED_REFLECTION.rows)),
  }
}

/** 把教师保存的原始对象收成可用模板；缺省回落默认。 */
export function normalizeReportTemplate(raw) {
  const base = defaultReportTemplate()
  if (!raw || typeof raw !== 'object') return base

  const intro = typeof raw.intro === 'string' ? raw.intro.trim().slice(0, 2000) : base.intro
  const includePromptsInMarkdown = raw.includePromptsInMarkdown !== false
  const list = Array.isArray(raw.sections) ? raw.sections : []
  const sections = []
  const seen = new Set()

  for (let i = 0; i < list.length && sections.length < 20; i += 1) {
    const item = list[i]
    if (!item || typeof item !== 'object') continue
    let id = safeId(item.id, `section-${i + 1}`)
    while (seen.has(id)) id = `${id}-${i + 1}`
    const title = String(item.title || `第 ${i + 1} 节`).trim().slice(0, 80) || `第 ${i + 1} 节`
    if (isReflectionLike(id, title)) continue
    seen.add(id)
    const prompt = String(item.prompt || '').trim().slice(0, 800)
    const rows = Math.min(20, Math.max(2, Number(item.rows) || 4))
    sections.push({ id, title, prompt, rows })
  }

  if (!sections.length) return base
  return { intro, includePromptsInMarkdown, sections, reflection: normalizeReflection(raw.reflection) }
}

export function getReportTemplate(config, labId) {
  const map = config?.reportTemplates && typeof config.reportTemplates === 'object' ? config.reportTemplates : {}
  return normalizeReportTemplate(map[labId] || map.default)
}

/** 按教师版式生成一份归属于单个学生、单个 Lab 的初始报告副本。 */
export function createInitialReportDraft(labId, rawTemplate) {
  const template = normalizeReportTemplate(rawTemplate)
  const sections = Object.fromEntries(
    [...template.sections, template.reflection].map((section) => [section.id, '']),
  )
  const markdownBody = template.sections
    .map((section) => {
      const lines = [`## ${section.title}`, '']
      if (template.includePromptsInMarkdown && section.prompt) {
        lines.push(`> **填写提示：** ${section.prompt}`, '')
      }
      return lines.join('\n')
    })
    .join('\n')

  return {
    mode: 'markdown',
    sections,
    markdownBody,
    attachments: [],
    labId: String(labId || ''),
    template,
  }
}
