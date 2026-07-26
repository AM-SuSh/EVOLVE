<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download, MessageSquareQuote, Save, Send } from 'lucide-vue-next'
import type { TutorLab } from '../tutor-model'

/**
 * 实验报告面板：固定格式模板，让学生专注记录过程、问题与发现。
 * 内容按 Lab 存在本机浏览器；「收获与反思」保存后计入学习记录（复盘环节），
 * 与运行验证一起构成解锁下一层的条件。
 */
const props = defineProps<{
  lab: TutorLab
  /** 终端要插入「过程记录」的文本；用递增 id 触发。 */
  insertPayload: { id: number; text: string } | null
  /** 老师对本 Lab 已提交报告的批语。 */
  teacherFeedback?: string
}>()

const emit = defineEmits<{
  (event: 'reflect', content: string): void
  (event: 'review', content: string): void
  (event: 'submit-teacher', content: string): void
  (event: 'notice', text: string): void
}>()

interface ReportDraft {
  goal: string
  process: string
  problems: string
  findings: string
  reflection: string
}

const SECTION_META: Array<{ key: keyof ReportDraft; title: string; placeholder: string; rows: number }> = [
  {
    key: 'goal',
    title: '一、实验目标与准备',
    placeholder: '这次实验要构建/验证什么？动手前你对它的理解和预期是什么？',
    rows: 3,
  },
  {
    key: 'process',
    title: '二、过程记录',
    placeholder: '做了什么、看到了什么。终端跑完后点「把输出插入实验报告」会自动追加到这里。',
    rows: 6,
  },
  {
    key: 'problems',
    title: '三、遇到的问题与解决',
    placeholder: '按「现象 → 假设 → 验证 → 结论」记录。卡住的地方往往是报告里最有价值的部分。',
    rows: 5,
  },
  {
    key: 'findings',
    title: '四、思考题与发现',
    placeholder: '回答实验文档【任务二】的思考题，写下阅读代码时的发现。',
    rows: 5,
  },
  {
    key: 'reflection',
    title: '五、收获与反思',
    placeholder: '三句话：你能独立解释什么？AI 提醒了哪个关键点？你用哪条运行结果验证了它？',
    rows: 4,
  },
]

function emptyDraft(): ReportDraft {
  return { goal: '', process: '', problems: '', findings: '', reflection: '' }
}

const draft = ref<ReportDraft>(emptyDraft())
const savedAt = ref('')

const storageKey = computed(() => `os-lab-report-${props.lab.id}-v1`)

function load() {
  if (typeof localStorage === 'undefined') return
  try {
    const value = JSON.parse(localStorage.getItem(storageKey.value) || '{}')
    const next = emptyDraft()
    for (const meta of SECTION_META) {
      if (typeof value?.[meta.key] === 'string') next[meta.key] = value[meta.key]
    }
    draft.value = next
    savedAt.value = typeof value?.savedAt === 'string' ? value.savedAt : ''
  } catch {
    draft.value = emptyDraft()
  }
}

watch(() => props.lab.id, load, { immediate: true })

// 终端输出插入「过程记录」。
watch(
  () => props.insertPayload?.id,
  () => {
    const text = props.insertPayload?.text
    if (!text) return
    const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    draft.value.process = `${draft.value.process.trimEnd()}\n\n[${stamp} 终端输出]\n\`\`\`text\n${text}\n\`\`\`\n`.trimStart()
    persist(false)
  },
)

function persist(announce = true) {
  if (typeof localStorage === 'undefined') return
  savedAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
  localStorage.setItem(storageKey.value, JSON.stringify({ ...draft.value, savedAt: savedAt.value }))
  if (announce) emit('notice', '报告已保存在本机浏览器。')
}

function save() {
  persist(false)
  if (draft.value.reflection.trim()) {
    // 反思非空时计入学习记录（复盘环节），与运行验证一起解锁下一层。
    emit('reflect', draft.value.reflection.trim())
  } else {
    emit('notice', '报告已保存。写下「收获与反思」再保存，可完成本层的复盘环节。')
  }
}

function assembleMarkdown() {
  const lines = [`# ${props.lab.label} ${props.lab.title} · 实验报告`, '']
  for (const meta of SECTION_META) {
    lines.push(`## ${meta.title}`, '', draft.value[meta.key].trim() || '（未填写）', '')
  }
  lines.push('---', `导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`)
  return lines.join('\n')
}

function exportMarkdown() {
  persist(false)
  const url = URL.createObjectURL(
    new Blob([assembleMarkdown()], { type: 'text/markdown;charset=utf-8' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${props.lab.id}-report.md`
  anchor.click()
  URL.revokeObjectURL(url)
  emit('notice', '报告已导出为 Markdown。')
}

function askReview() {
  persist(false)
  const content = assembleMarkdown()
  emit('review', content.length > 3200 ? `${content.slice(0, 3200)}\n…（已截断）` : content)
}

function submitToTeacher() {
  persist(false)
  emit('submit-teacher', assembleMarkdown())
}
</script>

<template>
  <section class="ws-report" aria-label="实验报告">
    <header class="ws-report-head">
      <div>
        <strong>{{ lab.label }} 实验报告</strong>
        <small v-if="savedAt">上次保存：{{ savedAt }}</small>
        <small v-else>内容自动留在本机浏览器，随时可导出</small>
      </div>
      <div class="ws-report-actions">
        <button type="button" title="请 AI 导师点评当前报告" @click="askReview">
          <MessageSquareQuote :size="14" aria-hidden="true" /><span>请导师点评</span>
        </button>
        <button type="button" @click="exportMarkdown">
          <Download :size="14" aria-hidden="true" /><span>导出 md</span>
        </button>
        <button type="button" title="提交到老师的教师端（重复提交覆盖旧版）" @click="submitToTeacher">
          <Send :size="14" aria-hidden="true" /><span>提交给老师</span>
        </button>
        <button type="button" class="primary" @click="save">
          <Save :size="14" aria-hidden="true" /><span>保存</span>
        </button>
      </div>
    </header>

    <div class="ws-report-body">
      <div v-if="teacherFeedback" class="ws-report-feedback">
        <strong>老师批语</strong>
        <p>{{ teacherFeedback }}</p>
      </div>
      <section v-for="meta in SECTION_META" :key="meta.key" class="ws-report-section">
        <h3>{{ meta.title }}</h3>
        <textarea
          v-model="draft[meta.key]"
          :rows="meta.rows"
          :placeholder="meta.placeholder"
          spellcheck="false"
          @blur="persist(false)"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.ws-report {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

.ws-report-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-report-head strong {
  display: block;
  font-size: var(--ws-text-sm);
}

.ws-report-head small {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-report-actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--ws-space-2);
}

.ws-report-actions button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-report-actions button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-report-actions button.primary {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-report-actions button.primary:hover {
  color: var(--ws-accent-contrast);
  background: var(--ws-accent-hover);
}

.ws-report-body {
  min-height: 0;
  padding: var(--ws-space-3) var(--ws-space-4) var(--ws-space-5);
  overflow-y: auto;
}

.ws-report-feedback {
  margin-bottom: var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-left: 3px solid var(--ws-accent);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
}

.ws-report-feedback strong {
  display: block;
  margin-bottom: 2px;
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
}

.ws-report-feedback p {
  margin: 0;
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
  white-space: pre-wrap;
}

.ws-report-section h3 {
  margin: var(--ws-space-3) 0 var(--ws-space-1);
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-report-section:first-child h3 {
  margin-top: 0;
}

.ws-report-section textarea {
  width: 100%;
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
  resize: vertical;
}

.ws-report-section textarea:focus {
  border-color: var(--ws-accent);
  outline: none;
}

.ws-report-section textarea::placeholder {
  color: var(--ws-ink-faint);
}
</style>
