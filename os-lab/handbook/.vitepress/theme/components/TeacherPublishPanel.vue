<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Download,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Unlock,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-vue-next'
import { buildXlsxBlob } from '../../../export-xlsx.mjs'
import { authHeaders, type TutorLab } from '../tutor-model'
import FinalProjectEditor, { type FinalProjectDraft } from './FinalProjectEditor.vue'
import {
  DEFAULT_REPORT_TEMPLATE,
  cloneTemplate,
  formatSectionMarkdown,
  parseReportTemplateFromMarkdown,
  type ReportTemplate,
} from '../report-template'

/**
 * 教师工作台右栏 · 作业发布面板（占满整栏）。
 *
 * 以「班级」为主视角发布当前 Lab 的作业：
 *  - 任务类型可插拔：来自 scaffold/exercises/<lab>/ 的变体（补代码 fill、排错 debug…），
 *    新变体放进目录即自动出现在下拉里；
 *  - 班级用下拉选择：老师先在这里创建班级，学生注册时只能从这些班级中选择；
 *  - 附带按范围分发进度、个别学生调整、作业公告与报告版式布置。
 */
const props = defineProps<{ lab: TutorLab; endpoint: string; variantHint?: string }>()
const emit = defineEmits<{ (event: 'notice', text: string): void }>()

interface ScheduleEntry {
  unlockAt?: string | null
  lockAt?: string | null
}

interface ScopeConfig {
  openLab?: string
  assignments?: Record<string, string>
  notice?: string
  schedules?: Record<string, ScheduleEntry>
  finalProject?: FinalProjectDraft | null
}

interface TeacherLlmConfig {
  baseUrl: string
  model: string
  apiKey: string
}

interface Overview {
  config: {
    openLab: string
    assignments: Record<string, string>
    notice: string
    schedules?: Record<string, ScheduleEntry>
    classes: Record<string, ScopeConfig>
    students: Record<string, ScopeConfig>
    allowStudentLlm?: boolean
    llm?: TeacherLlmConfig
  }
  classNames: string[]
  students: Array<{ user: string; className: string }>
  labs: string[]
  exercises: Record<string, { default: string; variants: Array<{ name: string; label: string }> }>
}

type PublishScope =
  | { type: 'global' | 'class' | 'student'; id: string }
  | { type: 'batch'; id: string; ids: string[]; includeGlobal?: boolean }

const overview = ref<Overview | null>(null)
const busy = ref(false)
const note = ref('')
const noteOk = ref(false)

/* 每个作用域一份任务类型草稿：'' = 全局默认，其余为班级名 / student:用户名。 */
const variantDrafts = ref<Record<string, string>>({})
const studentSel = ref('')
const selectedClass = ref('')
const newClassName = ref('')
const noticeScope = ref('')
const noticeDraft = ref('')
const batchClasses = ref<string[]>([])
const batchIncludeGlobal = ref(false)
const batchVariant = ref('')
const scheduleUnlock = ref('')
const scheduleLock = ref('')

const llmDraft = ref<TeacherLlmConfig>({ baseUrl: '', model: '', apiKey: '' })
const llmKeyConfigured = ref(false)
const llmKeyVisible = ref(false)
const allowStudentLlmDraft = ref(true)
const llmChecking = ref(false)
const llmConnection = ref<'idle' | 'connected' | 'offline'>('idle')
const llmDetail = ref('')
const llmActiveModel = ref('')

const finalProjectScope = ref('')

/** 当前 Lab 的报告版式草稿（全局布置，学生端拉取）。 */
const reportDraft = ref<ReportTemplate>(cloneTemplate(DEFAULT_REPORT_TEMPLATE))
const reportModalOpen = ref(false)
const reportImportInput = ref<HTMLInputElement | null>(null)
const reportPreview = computed(() => {
  const tpl = reportDraft.value
  const lines = [`# ${props.lab.label} ${props.lab.title} · 实验报告`, '']
  if (tpl.intro.trim()) {
    lines.push(
      tpl.includePromptsInMarkdown
        ? `> **老师布置：** ${tpl.intro.trim()}`
        : tpl.intro.trim(),
      '',
    )
  }
  for (const section of tpl.sections) {
    lines.push(
      formatSectionMarkdown(section.title, section.prompt, '（学生填写）', tpl.includePromptsInMarkdown),
    )
  }
  lines.push(
    formatSectionMarkdown(
      tpl.reflection.title,
      tpl.reflection.prompt,
      '（学生填写）',
      tpl.includePromptsInMarkdown,
    ),
  )
  return lines.join('\n')
})

const classList = computed(() => {
  const serverClasses = overview.value?.classNames
  if (Array.isArray(serverClasses) && serverClasses.length) return serverClasses
  const names = new Set(Object.keys(overview.value?.config.classes || {}))
  for (const student of overview.value?.students || []) {
    const className = String(student.className || '').trim()
    if (className) names.add(className)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'))
})
const studentList = computed(() => {
  const students = overview.value?.students || []
  if (!selectedClass.value) return students.map((s) => s.user)
  return students.filter((s) => s.className === selectedClass.value).map((s) => s.user)
})
const batchAll = computed({
  get: () => classList.value.length > 0 && classList.value.every((name) => batchClasses.value.includes(name)),
  set: (on: boolean) => {
    batchClasses.value = on ? [...classList.value] : []
  },
})
const hasBatchSelection = computed(() => batchClasses.value.length > 0 || batchIncludeGlobal.value)
const defaultVariant = computed(() => overview.value?.exercises?.[props.lab.id]?.default || '')
const variants = computed(() =>
  (overview.value?.exercises?.[props.lab.id]?.variants || []).map((v) => ({
    name: v.name,
    label: v.name === defaultVariant.value ? `${v.label}（默认）` : v.label,
  })),
)
const RANDOM_VARIANT = 'random'
const taskOptions = computed(() => [
  { name: RANDOM_VARIANT, label: '随机分配（每名学生随机一种）' },
  ...variants.value,
])
const targetCount = computed(() => classList.value.length + 1)
const openTargetCount = computed(() => {
  const entries: Array<ScopeConfig | undefined> = [
    undefined,
    ...classList.value.map((name) => classEntry(name)),
  ]
  return entries.filter((entry) => isOpen(entry)).length
})
function labIndex(labId: string) {
  return (overview.value?.labs || []).indexOf(labId)
}

/** 该作用域实际生效的分发进度（覆盖 > 全局）。 */
function effectiveOpenLab(entry?: ScopeConfig) {
  return entry?.openLab || overview.value?.config.openLab || ''
}

/** 本实验对该作用域是否已分发。 */
function isOpen(entry?: ScopeConfig) {
  return labIndex(effectiveOpenLab(entry)) >= labIndex(props.lab.id)
}

/** 该作用域本实验的任务类型：返回 [变体名, 是否本级覆盖]。 */
function assignedVariant(entry?: ScopeConfig): [string, boolean] {
  const own = entry?.assignments?.[props.lab.id]
  if (own) return [own, true]
  const global = overview.value?.config.assignments?.[props.lab.id]
  if (global) return [global, false]
  return [overview.value?.exercises?.[props.lab.id]?.default || '默认任务', false]
}

/** 学生实际生效任务：学生单独设置 > 所在班级 > 全局默认。 */
function assignedStudentVariant(user: string): [string, boolean] {
  const own = studentEntry(user)?.assignments?.[props.lab.id]
  if (own) return [own, true]
  const student = overview.value?.students.find((s) => s.user === user)
  const className = String(student?.className || '').trim()
  const assigned = className ? classEntry(className)?.assignments?.[props.lab.id] : undefined
  if (assigned) return [assigned, false]
  const global = overview.value?.config.assignments?.[props.lab.id]
  if (global) return [global, false]
  return [overview.value?.exercises?.[props.lab.id]?.default || '默认任务', false]
}

/** 学生实际生效开放进度：学生单独设置 > 所在班级 > 全局默认。 */
function studentOpenLab(user: string): string {
  const own = studentEntry(user)?.openLab
  if (own) return own
  const student = overview.value?.students.find((s) => s.user === user)
  const className = String(student?.className || '').trim()
  const assigned = className ? classEntry(className)?.openLab : undefined
  return assigned || overview.value?.config.openLab || ''
}

function isStudentOpen(user: string) {
  return labIndex(studentOpenLab(user)) >= labIndex(props.lab.id)
}

function classEntry(name: string) {
  return overview.value?.config.classes?.[name]
}

function studentEntry(user: string) {
  return overview.value?.config.students?.[user]
}

function variantLabel(name: string) {
  return variants.value.find((v) => v.name === name)?.label || ''
}

async function loadReportTemplate() {
  try {
    const response = await fetch(
      `${props.endpoint}/report-template?labId=${encodeURIComponent(props.lab.id)}`,
      { headers: authHeaders() },
    )
    if (!response.ok) {
      reportDraft.value = cloneTemplate(DEFAULT_REPORT_TEMPLATE)
      return
    }
    const payload = await response.json()
    reportDraft.value = cloneTemplate(payload.template || DEFAULT_REPORT_TEMPLATE)
  } catch {
    reportDraft.value = cloneTemplate(DEFAULT_REPORT_TEMPLATE)
  }
}

async function load() {
  try {
    const response = await fetch(`${props.endpoint}/teacher/overview`, { headers: authHeaders() })
    if (response.ok) {
      overview.value = await response.json()
      const llm = overview.value?.config.llm
      llmDraft.value = {
        baseUrl: llm?.baseUrl || '',
        model: llm?.model || '',
        apiKey: '',
      }
      llmKeyConfigured.value = llm?.apiKey === '（已设置）'
      llmKeyVisible.value = false
      allowStudentLlmDraft.value = overview.value?.config.allowStudentLlm !== false
      llmConnection.value = 'idle'
      llmDetail.value = ''
      llmActiveModel.value = ''
      if (selectedClass.value && !classList.value.includes(selectedClass.value)) selectedClass.value = ''
      if (!batchVariant.value && overview.value?.exercises?.[props.lab.id]?.default) {
        batchVariant.value = overview.value.exercises[props.lab.id].default
      }
      const currentSchedule = labSchedule(
        selectedClass.value ? classEntry(selectedClass.value) : undefined,
      )
      scheduleUnlock.value = toLocalInput(currentSchedule?.unlockAt)
      scheduleLock.value = toLocalInput(currentSchedule?.lockAt)
      seedVariantHint()
      if (!noticeScope.value) noticeDraft.value = overview.value?.config.notice || ''
      await loadReportTemplate()
    } else {
      note.value = '需教师账号登录后使用。'
      noteOk.value = false
    }
  } catch {
    note.value = '无法连接导师服务（npm run tutor）。'
    noteOk.value = false
  }
}

/** 发布一项配置到指定作用域，成功后刷新总览让状态即时可见。 */
function seedVariantHint() {
  const hint = props.variantHint?.trim() || ''
  if (!hint || !overview.value || variantDrafts.value['']) return
  if (variants.value.some((v) => v.name === hint)) variantDrafts.value[''] = hint
}

async function publish(
  scope: PublishScope,
  extra: Record<string, unknown>,
  okText: string,
) {
  if (busy.value) return false
  busy.value = true
  note.value = ''
  let ok = false
  try {
    const response = await fetch(`${props.endpoint}/teacher/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ scope, ...extra }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    ok = true
    note.value = okText
    noteOk.value = true
    emit('notice', okText)
    await load()
  } catch (err) {
    note.value = err instanceof Error ? err.message : '发布失败'
    noteOk.value = false
  } finally {
    busy.value = false
  }
  return ok
}

function validLlmBaseUrl(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function checkTeacherLlmConnection() {
  llmChecking.value = true
  llmDetail.value = ''
  try {
    const response = await fetch(`${props.endpoint}/health`, { headers: authHeaders() })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    llmConnection.value = payload.connected ? 'connected' : 'offline'
    llmActiveModel.value = typeof payload.model === 'string' ? payload.model : ''
    llmDetail.value = payload.connected ? '' : payload.detail || '上游模型未连接'
  } catch (err) {
    llmConnection.value = 'offline'
    llmActiveModel.value = ''
    llmDetail.value = err instanceof Error ? err.message : '无法连接导师服务'
  } finally {
    llmChecking.value = false
  }
}

async function saveTeacherLlm() {
  if (busy.value || llmChecking.value) return
  const baseUrl = llmDraft.value.baseUrl.trim().replace(/\/$/, '')
  if (!validLlmBaseUrl(baseUrl)) {
    note.value = '接口地址需为有效的 http:// 或 https:// 地址。'
    noteOk.value = false
    return
  }
  const ok = await publish(
    { type: 'global', id: '' },
    {
      allowStudentLlm: allowStudentLlmDraft.value,
      llm: {
        baseUrl,
        model: llmDraft.value.model.trim(),
        apiKey: llmDraft.value.apiKey.trim(),
      },
    },
    '统一模型配置已保存，正在检测连接。',
  )
  if (ok) await checkTeacherLlmConnection()
}

async function clearTeacherLlm() {
  if (busy.value || llmChecking.value) return
  if (!window.confirm('确认清除教师统一模型的接口地址、模型名和 API Key？')) return
  const ok = await publish(
    { type: 'global', id: '' },
    { llm: { baseUrl: '', model: '', apiKey: '', clearApiKey: true } },
    '教师统一模型配置已清除，正在检测环境默认配置。',
  )
  if (ok) await checkTeacherLlmConnection()
}

/** 期末任务按作用域就近读取：学生 > 班级 > 全局；未设置时回落上一级。 */
function finalProjectFor(scopeKey: string): FinalProjectDraft | null | undefined {
  if (!overview.value) return null
  if (scopeKey.startsWith('student:')) {
    const user = scopeKey.slice(8)
    const own = overview.value.config.students[user]?.finalProject
    if (own) return own
    const student = overview.value.students.find((item) => item.user === user)
    const className = String(student?.className || '').trim()
    const classProject = className ? overview.value.config.classes[className]?.finalProject : null
    return classProject || overview.value.config.finalProject
  }
  if (scopeKey) return overview.value.config.classes[scopeKey]?.finalProject || overview.value.config.finalProject
  return overview.value.config.finalProject
}

const finalProjectSeed = computed<FinalProjectDraft>(() => {
  const current = finalProjectFor(finalProjectScope.value)
  return {
    title: current?.title || '期末探索实验',
    kind: current?.kind || 'open',
    description: current?.description || '',
    mechanisms: Array.isArray(current?.mechanisms) ? [...current.mechanisms] : [],
    verificationCommand: current?.verificationCommand || '',
    rubric:
      Array.isArray(current?.rubric) && current.rubric.length
        ? [...current.rubric]
        : ['提案质量', '机制运用', '可信证据', '反思与迁移'],
    leaderboard: current?.leaderboard
      ? {
          metrics: current.leaderboard.metrics.map((metric) => ({ ...metric })),
        }
      : undefined,
  }
})

async function publishFinalProject(draft: FinalProjectDraft) {
  if (busy.value) return
  if (!draft.title || !draft.description) {
    note.value = '期末探索任务至少需要名称和任务书。'
    noteOk.value = false
    return
  }
  await publish(
    scopeOf(finalProjectScope.value),
    { finalProject: draft },
    `${scopeName(finalProjectScope.value)}：期末探索任务已发布。`,
  )
}

async function clearFinalProject() {
  if (busy.value) return
  if (!window.confirm(`确认清除「${scopeName(finalProjectScope.value)}」的期末探索任务？`)) return
  await publish(
    scopeOf(finalProjectScope.value),
    { clearFinalProject: true },
    `${scopeName(finalProjectScope.value)}：已清除期末探索任务。`,
  )
}

async function createClass() {
  const name = newClassName.value.trim()
  if (!name) return
  if (classList.value.includes(name)) {
    note.value = `班级 ${name} 已存在。`
    noteOk.value = false
    return
  }
  const ok = await publish(
    { type: 'class', id: name },
    { createClass: true },
    `已创建班级：${name}。`,
  )
  if (ok) {
    newClassName.value = ''
    selectedClass.value = name
  }
}

function scopeOf(key: string): { type: 'global' | 'class' | 'student'; id: string } {
  if (!key) return { type: 'global', id: '' }
  if (key.startsWith('student:')) return { type: 'student', id: key.slice(8) }
  return { type: 'class', id: key }
}

function scopeName(key: string) {
  if (!key) return '全局默认'
  if (key.startsWith('student:')) return key.slice(8)
  return `${key} 班`
}

/** 下发任务类型（TODO 作业变体）。 */
async function assignTo(key: string) {
  const variant = variantDrafts.value[key]
  if (!variant) return
  if (variant === RANDOM_VARIANT) {
    await randomAssignTo(key)
    return
  }
  await publish(
    scopeOf(key),
    { assignment: { labId: props.lab.id, variant } },
    `${scopeName(key)}：${props.lab.id} 任务已设为 ${variant}。`,
  )
}

/** 随机下发：按范围把每位学生分配为一种具体任务变体。 */
async function randomAssignTo(key: string) {
  if (busy.value || !variants.value.length) return
  await publish(
    scopeOf(key),
    { randomAssignment: { labId: props.lab.id } },
    `${scopeName(key)}：已随机下发，学生任务可在「个别调整」查看。`,
  )
}

/** 分发本实验：把阶段代码分发到当前 Lab。 */
async function openTo(key: string) {
  await publish(scopeOf(key), { openLab: props.lab.id }, `${scopeName(key)}：已分发到 ${props.lab.id}。`)
}

async function openAndDistributeVariant() {
  const hint = variantDrafts.value['']
  if (!hint || busy.value) return
  await openTo('')
  if (noteOk.value && variantDrafts.value['']) await assignTo('')
}

function toggleBatchClass(name: string) {
  batchClasses.value = batchClasses.value.includes(name)
    ? batchClasses.value.filter((item) => item !== name)
    : [...batchClasses.value, name]
}

function batchScope(): PublishScope {
  return { type: 'batch', id: '', ids: [...batchClasses.value], includeGlobal: batchIncludeGlobal.value }
}

function labSchedule(entry?: ScopeConfig): ScheduleEntry | null {
  const own = entry?.schedules?.[props.lab.id]
  if (own?.unlockAt || own?.lockAt) return own
  const global = overview.value?.config.schedules?.[props.lab.id]
  if (global?.unlockAt || global?.lockAt) return global
  return null
}

function formatScheduleTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toLocalInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function batchOpen() {
  if (!hasBatchSelection.value) return false
  const scopeCount = batchClasses.value.length + (batchIncludeGlobal.value ? 1 : 0)
  return publish(
    batchScope(),
    { openLab: props.lab.id },
    `已批量解锁到 ${props.lab.id}（${scopeCount} 个范围）。`,
  )
}

async function batchAssign() {
  if (!hasBatchSelection.value || !batchVariant.value) return false
  if (batchVariant.value === RANDOM_VARIANT) {
    if (!batchClasses.value.length) {
      note.value = '批量随机下发至少需要一个班级。'
      noteOk.value = false
      return false
    }
    return publish(
      { ...batchScope(), includeGlobal: false },
      { randomAssignment: { labId: props.lab.id } },
      `已为 ${batchClasses.value.length} 个班级随机下发任务。`,
    )
  }
  const scopeCount = batchClasses.value.length + (batchIncludeGlobal.value ? 1 : 0)
  return publish(
    batchScope(),
    { assignment: { labId: props.lab.id, variant: batchVariant.value } },
    `已为 ${scopeCount} 个范围下发任务。`,
  )
}

async function batchOpenAndAssign() {
  if (!hasBatchSelection.value || !batchVariant.value) return
  const ok = await batchOpen()
  if (ok) await batchAssign()
}

async function batchSetSchedule() {
  if (!hasBatchSelection.value) return
  if (!scheduleUnlock.value && !scheduleLock.value) {
    note.value = '请至少填写解锁或截止时间。'
    noteOk.value = false
    return
  }
  const scopeCount = batchClasses.value.length + (batchIncludeGlobal.value ? 1 : 0)
  await publish(
    batchScope(),
    {
      schedule: {
        labId: props.lab.id,
        unlockAt: scheduleUnlock.value ? new Date(scheduleUnlock.value).toISOString() : '',
        lockAt: scheduleLock.value ? new Date(scheduleLock.value).toISOString() : '',
      },
    },
    `已设置 ${props.lab.id} 的任务时间（${scopeCount} 个范围）。`,
  )
}

async function batchClearSchedule() {
  if (!hasBatchSelection.value) return
  await publish(
    batchScope(),
    { schedule: { labId: props.lab.id, unlockAt: '', lockAt: '' } },
    `已清除 ${props.lab.id} 的任务时间。`,
  )
}

/** 导出当前班级每位学生及其任务分配（.xlsx）。 */
function exportTaskFor(user: string): string {
  const own = studentEntry(user)?.assignments?.[props.lab.id]
  if (own) return own
  const draft = variantDrafts.value[selectedClass.value]
  if (draft && draft !== RANDOM_VARIANT) return draft
  return assignedStudentVariant(user)[0]
}

async function exportClassExcel() {
  if (!selectedClass.value || !studentList.value.length) return
  const draft = variantDrafts.value[selectedClass.value]
  if (draft === RANDOM_VARIANT) {
    const hasOwnAssignment = studentList.value.some(
      (user) => Boolean(studentEntry(user)?.assignments?.[props.lab.id]),
    )
    if (!hasOwnAssignment) {
      await randomAssignTo(selectedClass.value)
      const stillMissing = studentList.value.some(
        (user) => !studentEntry(user)?.assignments?.[props.lab.id],
      )
      if (stillMissing) {
        note.value = '随机下发未写入学生配置：导师服务可能仍是旧版本，请重启 npm run tutor 后重试。'
        noteOk.value = false
        return
      }
    }
  }
  const rows: Array<Array<string>> = [
    ['学生', '任务类型', '任务说明'],
    ...studentList.value.map((user) => {
      const variant = exportTaskFor(user)
      return [user, variant, variantLabel(variant)]
    }),
  ]
  const blob = buildXlsxBlob(rows)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${selectedClass.value}-${props.lab.id}-任务分配.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

async function publishNotice() {
  if (!noticeDraft.value.trim()) return
  await publish(
    scopeOf(noticeScope.value),
    { notice: noticeDraft.value },
    `${scopeName(noticeScope.value)}：公告已发布。`,
  )
}

function addReportSection() {
  const n = reportDraft.value.sections.length + 1
  reportDraft.value.sections.push({
    id: `section-${Date.now().toString(36)}`,
    title: `第 ${n} 节`,
    prompt: '请写明这一节希望学生回答什么。',
    rows: 4,
  })
}

function removeReportSection(index: number) {
  if (reportDraft.value.sections.length <= 1) {
    note.value = '至少保留一节。'
    noteOk.value = false
    return
  }
  reportDraft.value.sections.splice(index, 1)
}

function moveReportSection(index: number, delta: number) {
  const target = index + delta
  const list = reportDraft.value.sections
  if (target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
}

function resetReportTemplate() {
  reportDraft.value = cloneTemplate(DEFAULT_REPORT_TEMPLATE)
}

async function openReportModal() {
  await loadReportTemplate()
  reportModalOpen.value = true
}

function closeReportModal() {
  reportModalOpen.value = false
}

async function onImportReportMarkdown(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    reportDraft.value = parseReportTemplateFromMarkdown(text)
    note.value = `已从「${file.name}」导入 ${reportDraft.value.sections.length} 个章节，确认后请发布。`
    noteOk.value = true
    emit('notice', note.value)
  } catch (err) {
    note.value = err instanceof Error ? err.message : '导入失败'
    noteOk.value = false
  }
}

async function saveReportTemplate() {
  if (!reportDraft.value.sections.length) {
    note.value = '至少保留一节正文。'
    noteOk.value = false
    return
  }
  await publish(
    { type: 'global', id: '' },
    {
      reportTemplate: {
        labId: props.lab.id,
        intro: reportDraft.value.intro,
        includePromptsInMarkdown: reportDraft.value.includePromptsInMarkdown,
        sections: reportDraft.value.sections,
        reflection: reportDraft.value.reflection,
      },
    },
    `${props.lab.label} 报告版式已发布，学生刷新后生效。`,
  )
  reportModalOpen.value = false
}

watch(noticeScope, (scope) => {
  if (!overview.value) return
  noticeDraft.value = scope
    ? classEntry(scope)?.notice || overview.value.config.notice || ''
    : overview.value.config.notice || ''
})

watch(selectedClass, () => {
  if (studentSel.value && !studentList.value.includes(studentSel.value)) studentSel.value = ''
  const currentSchedule = labSchedule(selectedClass.value ? classEntry(selectedClass.value) : undefined)
  scheduleUnlock.value = toLocalInput(currentSchedule?.unlockAt)
  scheduleLock.value = toLocalInput(currentSchedule?.lockAt)
})

watch(
  () => props.lab.id,
  () => {
    void loadReportTemplate()
  },
)

onMounted(load)
</script>

<template>
  <section class="ws-pub" aria-label="教学安排">
    <header class="ws-pub-head">
      <div>
        <span>教学安排</span>
        <strong>{{ lab.label }} · {{ lab.title }}</strong>
      </div>
      <button type="button" class="ws-pub-refresh" title="刷新班级与发布状态" aria-label="刷新班级与发布状态" @click="load">
        <RefreshCw :size="14" aria-hidden="true" />
      </button>
    </header>

    <p v-if="note" class="ws-pub-note" :class="{ ok: noteOk }">{{ note }}</p>

    <div v-if="overview" class="ws-pub-scroll">
      <div class="ws-pub-summary" aria-label="发布概况">
        <span><strong>{{ openTargetCount }}/{{ targetCount }}</strong>目标已分发</span>
        <span><strong>{{ classList.length }}</strong>个班级</span>
        <span><strong>{{ studentList.length }}</strong>名学生</span>
      </div>

      <section class="ws-pub-block ws-pub-quick">
        <div class="ws-pub-section-title">
          <span>快速</span>
          <div>
            <h3>快速下发</h3>
            <p>选择全局默认任务后，一个按钮同时按范围分发并下发当前 Lab。</p>
          </div>
        </div>
        <div class="ws-pub-target ws-pub-target-global">
          <div class="ws-pub-target-info">
            <strong><Users :size="15" aria-hidden="true" />全局默认</strong>
            <span class="ws-pub-badge" :class="isOpen(undefined) ? 'open' : 'closed'">
              {{ isOpen(undefined) ? '本实验已分发' : `当前分发到 ${effectiveOpenLab(undefined) || '—'}` }}
            </span>
            <small>当前任务：{{ assignedVariant(undefined)[0] }}<template v-if="variantLabel(assignedVariant(undefined)[0])"> · {{ variantLabel(assignedVariant(undefined)[0]) }}</template></small>
            <small v-if="labSchedule(undefined)" class="ws-pub-schedule">
              <template v-if="labSchedule(undefined)?.unlockAt">解锁 {{ formatScheduleTime(labSchedule(undefined)?.unlockAt) }}</template>
              <template v-if="labSchedule(undefined)?.lockAt"> · 截止 {{ formatScheduleTime(labSchedule(undefined)?.lockAt) }}</template>
            </small>
          </div>
          <div class="ws-pub-target-actions">
            <template v-if="variants.length">
              <select v-model="variantDrafts['']" aria-label="快速下发任务类型">
                <option value="" disabled>选择任务类型</option>
                <option v-for="v in taskOptions" :key="v.name" :value="v.name">{{ v.name }} · {{ v.label }}</option>
              </select>
              <button
                type="button"
                :disabled="busy || !variantDrafts['']"
                @click="openAndDistributeVariant"
              >
                <Unlock :size="14" aria-hidden="true" />分发并下发
              </button>
            </template>
            <span v-else class="ws-pub-no-variants">暂无任务变体</span>
          </div>
        </div>
        <p v-if="defaultVariant" class="ws-pub-quick-note">
          本实验默认任务：<code>{{ defaultVariant }}</code>
        </p>
      </section>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>01</span>
          <div><h3>按班级安排</h3><p>先选择班级再设置；学生注册时只能从这些班级中选择。</p></div>
        </div>

        <div class="ws-pub-class-picker">
          <label class="ws-pub-class-select">
            <span>选择班级</span>
            <select v-model="selectedClass" aria-label="选择班级">
              <option value="" disabled>选择班级</option>
              <option v-for="c in classList" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <div class="ws-pub-create-class">
            <input
              v-model="newClassName"
              type="text"
              maxlength="32"
              placeholder="新班级名称，如 计科2302"
              @keydown.enter.prevent="createClass"
            />
            <button type="button" :disabled="busy || !newClassName.trim()" @click="createClass">
              <Plus :size="14" aria-hidden="true" />创建班级
            </button>
          </div>
        </div>
        <div class="ws-pub-class-actions">
          <button
            type="button"
            class="ghost"
            :disabled="busy || !selectedClass || !studentList.length"
            title="导出当前班级学生名单与任务分配"
            @click="exportClassExcel"
          >
            <Download :size="14" aria-hidden="true" />导出班级名单
          </button>
        </div>

        <div v-if="selectedClass" class="ws-pub-target">
          <div class="ws-pub-target-info">
            <strong><Users :size="15" aria-hidden="true" />{{ selectedClass }}</strong>
            <span class="ws-pub-badge" :class="isOpen(classEntry(selectedClass)) ? 'open' : 'closed'">
              {{ isOpen(classEntry(selectedClass)) ? '本实验已分发' : `当前分发到 ${effectiveOpenLab(classEntry(selectedClass)) || '—'}` }}
            </span>
            <small>当前任务：{{ assignedVariant(classEntry(selectedClass))[0] }} · {{ assignedVariant(classEntry(selectedClass))[1] ? '本班设置' : '跟随默认' }}</small>
            <small v-if="labSchedule(classEntry(selectedClass))" class="ws-pub-schedule">
              <template v-if="labSchedule(classEntry(selectedClass))?.unlockAt">解锁 {{ formatScheduleTime(labSchedule(classEntry(selectedClass))?.unlockAt) }}</template>
              <template v-if="labSchedule(classEntry(selectedClass))?.lockAt"> · 截止 {{ formatScheduleTime(labSchedule(classEntry(selectedClass))?.lockAt) }}</template>
            </small>
          </div>
          <div class="ws-pub-target-actions">
            <template v-if="variants.length">
              <select v-model="variantDrafts[selectedClass]" :aria-label="`${selectedClass}任务类型`">
                <option value="" disabled>选择任务类型</option>
                <option v-for="v in taskOptions" :key="v.name" :value="v.name">{{ v.name }} · {{ v.label }}</option>
              </select>
              <button type="button" :disabled="busy || !variantDrafts[selectedClass]" title="下发任务" @click="assignTo(selectedClass)"><Send :size="14" aria-hidden="true" />下发</button>
            </template>
            <span v-else class="ws-pub-no-variants">暂无任务变体</span>
            <button v-if="!isOpen(classEntry(selectedClass))" type="button" class="ghost" :disabled="busy" title="分发本实验" @click="openTo(selectedClass)"><Unlock :size="14" aria-hidden="true" /></button>
          </div>
        </div>

        <p v-if="!classList.length" class="ws-pub-empty">还没有班级，先在上方创建班级；学生注册后会自动归入所选班级。</p>
        <p v-else-if="!selectedClass" class="ws-pub-empty">从上方选择一个班级进行安排。</p>

        <details class="ws-pub-variant-help">
          <summary>查看本实验可用的 {{ variants.length }} 种任务类型</summary>
          <p v-if="variants.length"><span v-for="v in variants" :key="v.name"><code>{{ v.name }}</code> {{ v.label }}</span></p>
          <p v-else>当前只有默认任务。向 <code>scaffold/exercises/{{ lab.id }}/</code> 添加变体后会自动出现。</p>
        </details>
      </section>

      <section class="ws-pub-block ws-pub-batch">
        <div class="ws-pub-section-title">
          <span>02</span>
          <div><h3>批量操作</h3><p>多选班级后统一解锁、下发任务或设置任务时间。</p></div>
        </div>
        <div class="ws-pub-batch-scope">
          <label class="ws-pub-batch-toggle">
            <input v-model="batchAll" type="checkbox" /> 全选班级
          </label>
          <label class="ws-pub-batch-toggle">
            <input v-model="batchIncludeGlobal" type="checkbox" /> 同时应用到全局默认
          </label>
          <div class="ws-pub-batch-classes">
            <label
              v-for="name in classList"
              :key="name"
              :class="{ active: batchClasses.includes(name) }"
            >
              <input
                type="checkbox"
                :checked="batchClasses.includes(name)"
                @change="toggleBatchClass(name)"
              />
              {{ name }}
            </label>
            <p v-if="!classList.length" class="ws-pub-empty">还没有班级可批量操作。</p>
          </div>
        </div>
        <div class="ws-pub-batch-actions">
          <select v-model="batchVariant" :disabled="!variants.length" aria-label="批量任务类型">
            <option value="" disabled>选择任务类型</option>
            <option v-for="v in taskOptions" :key="v.name" :value="v.name">{{ v.name }} · {{ v.label }}</option>
          </select>
          <button type="button" :disabled="busy || !hasBatchSelection" @click="batchOpen">
            <Unlock :size="14" aria-hidden="true" />解锁
          </button>
          <button
            type="button"
            :disabled="busy || !hasBatchSelection || !batchVariant"
            @click="batchAssign"
          >
            <Send :size="14" aria-hidden="true" />下发任务
          </button>
          <button
            type="button"
            :disabled="busy || !hasBatchSelection || !batchVariant"
            @click="batchOpenAndAssign"
          >
            <Unlock :size="14" aria-hidden="true" />解锁并下发
          </button>
        </div>
        <div class="ws-pub-batch-schedule">
          <label>
            <span>解锁时间</span>
            <input v-model="scheduleUnlock" type="datetime-local" aria-label="批量解锁时间" />
          </label>
          <label>
            <span>截止时间</span>
            <input v-model="scheduleLock" type="datetime-local" aria-label="批量截止时间" />
          </label>
          <button type="button" :disabled="busy || !hasBatchSelection" @click="batchSetSchedule">
            <CalendarClock :size="14" aria-hidden="true" />设置任务时间
          </button>
          <button
            type="button"
            class="ghost"
            :disabled="busy || !hasBatchSelection"
            @click="batchClearSchedule"
          >
            <Trash2 :size="14" aria-hidden="true" />清除时间
          </button>
        </div>
      </section>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>03</span>
          <div><h3>个别调整</h3><p>从下拉框选择学生后查看具体分发情况并单独调整；上方已选班级时只显示该班学生。</p></div>
        </div>
        <div v-if="studentList.length" class="ws-pub-student-picker">
          <select v-model="studentSel" aria-label="选择学生">
            <option value="" disabled>选择学生</option>
            <option v-for="u in studentList" :key="u" :value="u">{{ u }}</option>
          </select>
          <template v-if="studentSel">
            <span class="ws-pub-student-current">
              当前任务：{{ assignedStudentVariant(studentSel)[0] }}<template v-if="variantLabel(assignedStudentVariant(studentSel)[0])"> · {{ variantLabel(assignedStudentVariant(studentSel)[0]) }}</template>
              · {{ assignedStudentVariant(studentSel)[1] ? '单独设置' : '跟随班级/默认' }}
              <template v-if="isStudentOpen(studentSel)"> · 本实验已分发</template>
              <template v-else> · 尚未分发</template>
            </span>
            <div class="ws-pub-student-actions">
              <select v-model="variantDrafts[`student:${studentSel}`]" :disabled="!variants.length" :aria-label="`${studentSel}任务类型`">
                <option value="" disabled>选择任务类型</option>
                <option v-for="v in taskOptions" :key="v.name" :value="v.name">{{ v.name }} · {{ v.label }}</option>
              </select>
              <button
                type="button"
                :disabled="busy || !variantDrafts[`student:${studentSel}`]"
                @click="assignTo(`student:${studentSel}`)"
              >
                <Send :size="14" aria-hidden="true" />下发
              </button>
              <button
                v-if="!isStudentOpen(studentSel)"
                type="button"
                class="ghost"
                :disabled="busy"
                @click="openTo(`student:${studentSel}`)"
              >
                <Unlock :size="14" aria-hidden="true" />分发
              </button>
            </div>
          </template>
        </div>
        <p v-else class="ws-pub-empty">{{ selectedClass ? `该班级还没有学生。` : '还没有学生注册。' }}</p>
      </section>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>04</span>
          <div><h3>学习公告</h3><p>发布后显示在学生工作台顶部。</p></div>
        </div>
        <div class="ws-pub-notice-scope">
          <Megaphone :size="15" aria-hidden="true" />
          <select v-model="noticeScope" aria-label="公告范围">
            <option value="">全体学生</option>
            <option v-for="c in classList" :key="c" :value="c">仅 {{ c }}</option>
          </select>
        </div>
        <textarea
          v-model="noticeDraft"
          rows="3"
          :placeholder="`例如：本周完成 ${lab.label}，周五前在报告面板点「提交给老师」。`"
        />
        <button type="button" :disabled="busy || !noticeDraft.trim()" @click="publishNotice"><Megaphone :size="14" aria-hidden="true" />发布公告</button>
      </section>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>05</span>
          <div>
            <h3>报告版式布置</h3>
            <p>在弹窗里编辑章节与填写提示，也可直接导入 Markdown 大纲。</p>
          </div>
        </div>
        <div class="ws-pub-report-entry">
          <p>
            当前共 <strong>{{ reportDraft.sections.length }}</strong> 节
            <template v-if="reportDraft.intro"> · 已设置总要求</template>
          </p>
          <button type="button" @click="openReportModal">
            <FileText :size="14" aria-hidden="true" />打开报告版式编辑
          </button>
        </div>
      </section>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>06</span>
          <div>
            <h3>统一 AI 模型</h3>
            <p>配置教师统一使用的 OpenAI 兼容接口，并控制学生能否使用本机模型设置。</p>
          </div>
        </div>
        <div class="ws-pub-llm-grid">
          <label class="ws-pub-llm-field">
            <span>接口地址</span>
            <input
              v-model="llmDraft.baseUrl"
              type="url"
              placeholder="https://example.com/v1"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <label class="ws-pub-llm-field">
            <span>模型名</span>
            <input
              v-model="llmDraft.model"
              type="text"
              placeholder="gpt-5.6-luna"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <label class="ws-pub-llm-field ws-pub-llm-key-field">
            <span>API Key{{ llmKeyConfigured ? '（已设置，留空保留）' : '' }}</span>
            <span class="ws-pub-key-input">
              <input
                v-model="llmDraft.apiKey"
                :type="llmKeyVisible ? 'text' : 'password'"
                :placeholder="llmKeyConfigured ? '已设置，输入新值可替换' : '输入 API Key'"
                autocomplete="new-password"
                spellcheck="false"
              />
              <button
                type="button"
                class="ghost ws-pub-key-toggle"
                :title="llmKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                :aria-label="llmKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                @click="llmKeyVisible = !llmKeyVisible"
              >
                <EyeOff v-if="llmKeyVisible" :size="14" aria-hidden="true" />
                <Eye v-else :size="14" aria-hidden="true" />
              </button>
            </span>
          </label>
        </div>
        <label class="ws-pub-llm-toggle">
          <input v-model="allowStudentLlmDraft" type="checkbox" />
          <span>允许学生使用浏览器本地保存的模型配置</span>
        </label>
        <div class="ws-pub-llm-footer">
          <p class="ws-pub-llm-status" :data-state="llmConnection">
            <template v-if="llmChecking">正在检测当前生效配置…</template>
            <template v-else-if="llmConnection === 'connected'">已连接{{ llmActiveModel ? `：${llmActiveModel}` : '' }}</template>
            <template v-else-if="llmConnection === 'offline'">未连接{{ llmDetail ? `：${llmDetail}` : '' }}</template>
            <template v-else>保存后检测当前生效配置</template>
          </p>
          <div class="ws-pub-llm-actions">
            <button type="button" class="ghost" :disabled="busy || llmChecking" @click="clearTeacherLlm">
              <Trash2 :size="14" aria-hidden="true" />清除统一配置
            </button>
            <button type="button" :disabled="busy || llmChecking" @click="saveTeacherLlm">
              <Save :size="14" aria-hidden="true" />保存并检测
            </button>
          </div>
        </div>
      </section>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>07</span>
          <div>
            <h3>期末探索任务</h3>
            <p>创建并发布 Lab9 探索实验；学生完成 Lab8 后自动解锁该节点。</p>
          </div>
        </div>

        <div class="ws-pub-final-scope">
          <FlaskConical :size="15" aria-hidden="true" />
          <select v-model="finalProjectScope" aria-label="期末探索任务发布范围">
            <option value="">全体学生</option>
            <option v-for="c in classList" :key="c" :value="c">仅 {{ c }}</option>
            <option v-if="studentSel" :value="`student:${studentSel}`">仅 {{ studentSel }}</option>
          </select>
        </div>

        <FinalProjectEditor
          :key="finalProjectScope"
          :initial="finalProjectSeed"
          :busy="busy"
          @save="publishFinalProject"
          @clear="clearFinalProject"
        />

      </section>
    </div>

    <p v-else class="ws-pub-empty ws-pub-loading">正在载入班级与作业配置…</p>

    <Teleport to="body">
      <div
        v-if="reportModalOpen"
        class="ws-pub-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="报告版式布置"
        @click.self="closeReportModal"
      >
        <div class="ws-pub-modal">
          <header class="ws-pub-modal-head">
            <div>
              <span>报告版式布置</span>
              <strong>{{ lab.label }} · {{ lab.title }}</strong>
            </div>
            <button type="button" class="ws-pub-modal-close" title="关闭" @click="closeReportModal">
              <X :size="16" aria-hidden="true" />
            </button>
          </header>

          <div class="ws-pub-modal-body">
            <div class="ws-pub-report-actions sticky">
              <button type="button" class="ghost" @click="reportImportInput?.click()">
                <Upload :size="14" aria-hidden="true" />导入 Markdown
              </button>
              <button type="button" class="ghost" @click="addReportSection">
                <Plus :size="14" aria-hidden="true" />加一节
              </button>
              <button type="button" class="ghost" @click="resetReportTemplate">恢复默认五节</button>
              <button type="button" :disabled="busy" @click="saveReportTemplate">
                <FileText :size="14" aria-hidden="true" />发布本实验报告版式
              </button>
            </div>
            <input
              ref="reportImportInput"
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              hidden
              @change="onImportReportMarkdown"
            />

            <p class="ws-pub-report-import-hint">
              导入 Markdown 时读取正文各节；复盘节保留固定字段标识，标题和填写提示可在下方调整。导入时用
              <code>## 节标题</code> 分节，节后的 <code>&gt; 提示</code> 作为填写提示。
            </p>

            <label class="ws-pub-report-field">
              <span>总要求（显示在报告开头）</span>
              <textarea
                v-model="reportDraft.intro"
                rows="2"
                placeholder="例如：本周报告请附上至少一张 trap 时序截图，并回答思考题。"
              />
            </label>

            <label class="ws-pub-report-check">
              <input v-model="reportDraft.includePromptsInMarkdown" type="checkbox" />
              把各节「填写提示」写进学生提交稿（推荐开启）
            </label>

            <div
              v-for="(section, index) in reportDraft.sections"
              :key="section.id"
              class="ws-pub-report-section"
            >
              <header>
                <strong>第 {{ index + 1 }} 节</strong>
                <div class="ws-pub-report-move">
                  <button type="button" title="上移" :disabled="index === 0" @click="moveReportSection(index, -1)">
                    <ArrowUp :size="14" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="下移"
                    :disabled="index === reportDraft.sections.length - 1"
                    @click="moveReportSection(index, 1)"
                  >
                    <ArrowDown :size="14" aria-hidden="true" />
                  </button>
                  <button type="button" title="删除本节" @click="removeReportSection(index)">
                    <Trash2 :size="14" aria-hidden="true" />
                  </button>
                </div>
              </header>
              <label>
                <span>标题</span>
                <input v-model="section.title" type="text" maxlength="80" />
              </label>
              <label>
                <span>填写提示（学生可见，也会写进提交稿）</span>
                <textarea
                  v-model="section.prompt"
                  rows="2"
                  maxlength="800"
                  placeholder="告诉学生这一节要写什么、写到什么程度。"
                />
              </label>
            </div>

            <div class="ws-pub-report-section ws-pub-report-fixed">
              <header>
                <strong>固定复盘字段</strong>
              </header>
              <p>每位学生报告末尾都会有「收获与反思」这一节。系统固定其记录标识，不生成额外填写提示。</p>
              <label>
                <span>标题</span>
                <input v-model="reportDraft.reflection.title" type="text" maxlength="80" />
              </label>
              <label>
                <span>输入行数</span>
                <input v-model.number="reportDraft.reflection.rows" type="number" min="2" max="20" />
              </label>
            </div>

            <details class="ws-pub-report-preview" open>
              <summary>预览学生提交稿结构</summary>
              <pre>{{ reportPreview }}</pre>
            </details>
          </div>

          <footer class="ws-pub-modal-foot">
            <button type="button" class="ghost" @click="closeReportModal">取消</button>
            <button type="button" :disabled="busy" @click="saveReportTemplate">
              <FileText :size="14" aria-hidden="true" />发布版式
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.ws-pub {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

.ws-pub-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  min-height: 58px;
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-pub-head span {
  display: block;
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-pub-head strong {
  display: block;
  margin-top: 2px;
  font-size: var(--ws-text-sm);
}

.ws-pub-refresh {
  display: grid;
  flex: 0 0 auto;
  width: var(--ws-control-sm);
  height: var(--ws-control-sm);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

.ws-pub-refresh:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-pub-head {
  flex: 0 0 auto;
}

.ws-pub-note {
  flex: 0 0 auto;
}

.ws-pub-scroll {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 var(--ws-space-4) var(--ws-space-6);
  overflow-y: auto;
}

.ws-pub-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ws-space-2);
  padding: var(--ws-space-3) 0;
  border-bottom: 1px solid var(--ws-line);
}

.ws-pub-summary span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-pub-summary strong {
  display: block;
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
  font-variant-numeric: tabular-nums;
}

.ws-pub-block {
  padding: var(--ws-space-4) 0;
  border-bottom: 1px solid var(--ws-line);
}

.ws-pub-section-title {
  display: flex;
  gap: var(--ws-space-3);
  margin-bottom: var(--ws-space-3);
}

.ws-pub-section-title > span {
  color: var(--ws-accent);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.ws-pub-section-title h3,
.ws-pub-section-title p {
  margin: 0;
}

.ws-pub-section-title h3 {
  font-size: var(--ws-text-sm);
}

.ws-pub-section-title p {
  margin-top: 2px;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-pub-class-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ws-space-3);
  padding: var(--ws-space-3) 0;
}

.ws-pub-class-select {
  display: grid;
  gap: var(--ws-space-1);
}

.ws-pub-class-select span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-pub-class-select select,
.ws-pub-create-class input {
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background-color: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.ws-pub-create-class {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ws-space-2);
}

.ws-pub-class-actions {
  display: flex;
  padding: var(--ws-space-2) 0;
}

.ws-pub-batch-scope {
  display: grid;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) 0;
}

.ws-pub-batch-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-2);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-pub-batch-toggle input,
.ws-pub-batch-classes input {
  accent-color: var(--ws-accent);
}

.ws-pub-batch-classes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-1);
}

.ws-pub-batch-classes label {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-pub-batch-classes label.active {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-pub-batch-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ws-space-1);
  padding: var(--ws-space-2) 0;
}

.ws-pub-batch-actions select {
  width: min(220px, 100%);
}

.ws-pub-batch-schedule {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto auto;
  align-items: end;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) 0;
}

.ws-pub-batch-schedule label {
  display: grid;
  gap: var(--ws-space-1);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-pub-batch-schedule input {
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-xs);
}

.ws-pub-schedule {
  margin-top: var(--ws-space-1);
}

.ws-pub-target {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ws-space-3);
  padding: var(--ws-space-3) 0;
  border-bottom: 1px solid var(--ws-line);
}

.ws-pub-target-global {
  padding-right: var(--ws-space-2);
  padding-left: var(--ws-space-2);
  background: var(--ws-surface-alt);
}

.ws-pub-target-info {
  min-width: 0;
}

.ws-pub-target-info strong {
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  font-size: var(--ws-text-sm);
}

.ws-pub-target-info small {
  display: block;
  margin-top: var(--ws-space-1);
  overflow: hidden;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-pub-badge {
  display: inline-block;
  margin-top: var(--ws-space-1);
  font-size: var(--ws-text-xs);
  white-space: nowrap;
}

.ws-pub-badge.open {
  color: var(--ws-ok, #1a7f37);
  background: transparent;
}

.ws-pub-badge.closed {
  color: var(--ws-ink-muted);
  background: transparent;
}

.ws-pub-target-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ws-space-1);
}

.ws-pub-target-actions select {
  width: min(190px, 100%);
}

.ws-pub-no-variants {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-pub-quick-note {
  margin: var(--ws-space-2) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-pub-block:not(.ws-pub-quick) > .ws-pub-target-global {
  display: none;
}

.ws-pub-variant-help {
  margin-top: var(--ws-space-3);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-pub-variant-help summary {
  cursor: pointer;
}

.ws-pub-variant-help p {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2) var(--ws-space-4);
  margin: var(--ws-space-2) 0 0;
}

.ws-pub-variant-help code {
  color: var(--ws-accent);
}

.ws-pub-student-picker {
  display: grid;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) 0;
}

.ws-pub-student-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: var(--ws-space-1);
}

.ws-pub-student-current,
.ws-pub-notice-scope {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-pub-notice-scope {
  margin-bottom: var(--ws-space-2);
}

.ws-pub select {
  max-width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background-color: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.ws-pub textarea {
  width: 100%;
  margin-bottom: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-sm);
  resize: vertical;
}

.ws-pub button:not(.ws-pub-refresh) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
  white-space: nowrap;
}

.ws-pub button.ghost {
  color: var(--ws-accent);
  background: transparent;
}

.ws-pub button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ws-pub-empty {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-pub-loading {
  padding: var(--ws-space-4);
}

.ws-pub-note {
  margin: 0;
  padding: var(--ws-space-1) var(--ws-space-4);
  color: var(--ws-danger, #c0392b);
  font-size: var(--ws-text-xs);
}

.ws-pub-note.ok {
  color: var(--ws-ok, #1a7f37);
}

.ws-pub-report-entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.ws-pub-report-entry p {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.ws-pub-report-entry strong {
  color: var(--ws-ink);
}

.ws-pub-report-entry button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--ws-control-sm);
  padding: 6px 12px;
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-pub-llm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ws-space-3);
}

.ws-pub-llm-field {
  display: grid;
  min-width: 0;
  gap: var(--ws-space-1);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-pub-llm-field > input,
.ws-pub-key-input > input {
  width: 100%;
  min-width: 0;
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-xs);
}

.ws-pub-llm-key-field {
  grid-column: 1 / -1;
}

.ws-pub-key-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--ws-control-sm);
  gap: var(--ws-space-1);
}

.ws-pub .ws-pub-key-toggle {
  width: var(--ws-control-sm);
  padding: 0;
}

.ws-pub-llm-toggle {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-3);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-pub-llm-toggle input {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  accent-color: var(--ws-accent);
}

.ws-pub-llm-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-3);
}

.ws-pub-llm-status {
  min-width: 0;
  margin: 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  overflow-wrap: anywhere;
}

.ws-pub-llm-status[data-state='connected'] {
  color: var(--ws-ok, #1a7f37);
}

.ws-pub-llm-status[data-state='offline'] {
  color: var(--ws-danger, #c0392b);
}

.ws-pub-llm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-1);
}

.ws-pub-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--ws-z-modal);
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: rgba(15, 23, 42, 0.45);
}

.ws-pub-modal {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(820px, 100%);
  max-height: min(88vh, 900px);
  overflow: hidden;
  border: 1px solid var(--ws-line);
  border-radius: 12px;
  background: var(--ws-surface);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.25);
}

.ws-pub-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-pub-modal-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-pub-modal-head span {
  display: block;
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-pub-modal-head strong {
  display: block;
  margin-top: 2px;
  font-size: var(--ws-text-sm);
}

.ws-pub-modal-close {
  display: grid;
  width: 32px;
  height: 32px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: 8px;
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

.ws-pub-modal-body {
  min-height: 0;
  padding: 12px 16px 20px;
  overflow-y: auto;
}

.ws-pub-report-import-hint {
  margin: 0 0 12px;
  padding: 8px 10px;
  color: var(--ws-ink-muted);
  border-radius: 8px;
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
  line-height: 1.5;
}

.ws-pub-report-import-hint code {
  font-size: 11px;
}

.ws-pub-report-field,
.ws-pub-report-section label {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
  font-size: var(--ws-text-xs);
  color: var(--ws-ink-muted);
}

.ws-pub-report-field textarea,
.ws-pub-report-section textarea,
.ws-pub-report-section input[type='text'],
.ws-pub-report-section input[type='number'],
.ws-pub-report-section select {
  width: 100%;
  padding: 6px 8px;
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background-color: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.ws-pub-report-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: var(--ws-text-xs);
  color: var(--ws-ink-muted);
}

.ws-pub-report-section {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.ws-pub-report-section header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ws-pub-report-section header strong {
  font-size: var(--ws-text-sm);
  color: var(--ws-ink);
}

.ws-pub-report-move {
  display: flex;
  gap: 4px;
}

.ws-pub-report-move button {
  display: inline-flex;
  padding: 4px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: 6px;
  background: var(--ws-surface);
  cursor: pointer;
}

.ws-pub-report-move button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ws-pub-report-fixed {
  opacity: 0.92;
}

.ws-pub-report-fixed p {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  line-height: 1.5;
}

.ws-pub-report-meta {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.6fr);
  gap: 10px;
}

.ws-pub-report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 12px;
}

.ws-pub-report-actions.sticky {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 0;
  background: var(--ws-surface);
}

.ws-pub-report-actions button,
.ws-pub-report-actions .ghost,
.ws-pub-modal-foot button,
.ws-pub-modal-foot .ghost {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: var(--ws-control-sm);
  padding: 4px 10px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-pub-report-actions button:not(.ghost),
.ws-pub-modal-foot button:not(.ghost) {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-pub-report-preview {
  margin-top: 4px;
  border: 1px dashed var(--ws-line);
  border-radius: var(--ws-radius-md);
  padding: 8px 10px;
  font-size: var(--ws-text-xs);
}

.ws-pub-report-preview summary {
  cursor: pointer;
  color: var(--ws-ink-muted);
}

.ws-pub-report-preview pre {
  margin: 8px 0 0;
  padding: 10px;
  overflow: auto;
  white-space: pre-wrap;
  border-radius: 6px;
  background: var(--ws-surface);
  color: var(--ws-ink);
  font-size: 12px;
  line-height: 1.5;
}

.ws-pub-final-scope {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-3);
  color: var(--ws-ink-muted);
}

.ws-pub-final-scope svg {
  flex: 0 0 auto;
  color: var(--ws-accent);
}

.ws-pub-final-scope select {
  flex: 1 1 auto;
}

@media (max-width: 1180px) {
  .ws-pub-class-picker {
    grid-template-columns: minmax(0, 1fr);
  }

  .ws-pub-target {
    grid-template-columns: minmax(0, 1fr);
  }

  .ws-pub-target-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 560px) {
  .ws-pub-scroll {
    padding-right: var(--ws-space-3);
    padding-left: var(--ws-space-3);
  }

  .ws-pub-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ws-pub-target-actions select,
  .ws-pub-student-actions select {
    flex: 1 1 100%;
    width: 100%;
  }

  .ws-pub-batch-actions select {
    flex: 1 1 100%;
    width: 100%;
  }

  .ws-pub-batch-schedule {
    grid-template-columns: minmax(0, 1fr);
  }

  .ws-pub-llm-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ws-pub-llm-key-field {
    grid-column: auto;
  }

  .ws-pub-llm-status,
  .ws-pub-llm-actions {
    width: 100%;
  }

  .ws-pub-llm-actions button {
    flex: 1 1 auto;
  }

}
</style>
