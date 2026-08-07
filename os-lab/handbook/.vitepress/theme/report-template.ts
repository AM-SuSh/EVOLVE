/** 与 learning/report-template.mjs 对齐的前端类型与默认版式。 */

export interface ReportSectionSpec {
  id: string
  title: string
  prompt: string
  rows: number
}

export interface ReportTemplate {
  intro: string
  includePromptsInMarkdown: boolean
  /** 老师布置的正文各节（不含固定的「收获与反思」）。 */
  sections: ReportSectionSpec[]
}

/** 系统固定；学生端始终出现，老师不用配置。 */
export const FIXED_REFLECTION: ReportSectionSpec = {
  id: 'reflection',
  title: '收获与反思',
  prompt: '试着写三句：现在能独立讲清楚什么？导师/AI 提醒了哪一点？哪条运行结果证明了它？',
  rows: 4,
}

export const DEFAULT_REPORT_TEMPLATE: ReportTemplate = {
  intro: '请按下列小节完成本次实验报告。带「提示」的句子是老师布置的填写要求，请对照着写。',
  includePromptsInMarkdown: true,
  sections: [
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
  ],
}

export function cloneTemplate(template: ReportTemplate = DEFAULT_REPORT_TEMPLATE): ReportTemplate {
  return {
    intro: template.intro,
    includePromptsInMarkdown: template.includePromptsInMarkdown !== false,
    sections: template.sections.map((section) => ({ ...section })),
  }
}

function isReflectionLike(id: string, title: string) {
  if (id === FIXED_REFLECTION.id || id === 'reflection') return true
  return /收获与反思|反思|体会总结/.test(title)
}

/** 学生端完整节列表 = 老师正文节 + 固定反思。 */
export function studentSections(template: ReportTemplate): ReportSectionSpec[] {
  const body = template.sections.filter((s) => !isReflectionLike(s.id, s.title))
  return [...body, { ...FIXED_REFLECTION }]
}

/** 生成带老师提示的 Markdown 骨架（布置预览 / 学生提交稿共用结构）。 */
export function formatSectionMarkdown(
  title: string,
  prompt: string,
  body: string,
  includePrompt: boolean,
) {
  const lines = [`## ${title}`, '']
  if (includePrompt && prompt.trim()) {
    lines.push(`> **填写提示：** ${prompt.trim()}`, '')
  }
  lines.push(body.trim() || '（未填写）', '')
  return lines.join('\n')
}

function stripPromptPrefix(text: string) {
  return text
    .replace(/^\*\*填写提示[：:]\*\*\s*/i, '')
    .replace(/^填写提示[：:]\s*/i, '')
    .replace(/^\*\*老师布置[：:]\*\*\s*/i, '')
    .replace(/^老师布置[：:]\s*/i, '')
    .trim()
}

/**
 * 从 Markdown 导入报告版式（仅正文节；「收获与反思」始终由系统固定）。
 */
export function parseReportTemplateFromMarkdown(source: string): ReportTemplate {
  const text = String(source || '').replace(/\r\n/g, '\n').trim()
  if (!text) return cloneTemplate(DEFAULT_REPORT_TEMPLATE)

  const lines = text.split('\n')
  let intro = ''
  const sections: ReportSectionSpec[] = []
  let current: ReportSectionSpec | null = null
  let pendingQuote: string[] = []
  let beforeFirstSection = true

  const flushQuoteToIntro = () => {
    if (!pendingQuote.length || intro) {
      pendingQuote = []
      return
    }
    intro = stripPromptPrefix(pendingQuote.join('\n').trim())
    pendingQuote = []
  }

  const flushQuoteToSection = () => {
    if (!current || !pendingQuote.length || current.prompt) {
      pendingQuote = []
      return
    }
    current.prompt = stripPromptPrefix(pendingQuote.join('\n').trim())
    pendingQuote = []
  }

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/)
    if (h2) {
      flushQuoteToIntro()
      flushQuoteToSection()
      beforeFirstSection = false
      const title = h2[1].trim().slice(0, 80) || `第 ${sections.length + 1} 节`
      if (isReflectionLike(`section-${sections.length + 1}`, title)) {
        current = null
        continue
      }
      current = {
        id: `section-${sections.length + 1}-${Date.now().toString(36)}`,
        title,
        prompt: '',
        rows: 4,
      }
      sections.push(current)
      continue
    }

    if (line.match(/^#\s+/) && beforeFirstSection) continue

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      pendingQuote.push(quote[1])
      continue
    }

    if (pendingQuote.length) {
      if (beforeFirstSection) flushQuoteToIntro()
      else flushQuoteToSection()
    }

    if (beforeFirstSection && !intro && line.trim() && !line.startsWith('#')) {
      intro = line.trim().slice(0, 2000)
    }
  }
  if (pendingQuote.length) {
    if (beforeFirstSection) flushQuoteToIntro()
    else flushQuoteToSection()
  }

  if (!sections.length) {
    return cloneTemplate(DEFAULT_REPORT_TEMPLATE)
  }

  for (const section of sections) {
    if (!section.prompt) section.prompt = '请完成本节内容。'
  }

  return {
    intro: intro || DEFAULT_REPORT_TEMPLATE.intro,
    includePromptsInMarkdown: true,
    sections,
  }
}
