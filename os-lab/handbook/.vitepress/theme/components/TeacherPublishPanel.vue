<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Megaphone, RefreshCw, Send, Unlock, UserRound, Users } from 'lucide-vue-next'
import { authHeaders, type TutorLab } from '../tutor-model'

/**
 * 教师工作台右栏 · 作业发布面板（占满整栏）。
 *
 * 以「班级」为主视角发布当前 Lab 的作业：
 *  - 任务类型可插拔：来自 scaffold/exercises/<lab>/ 的变体（补代码 fill、排错 debug…），
 *    新变体放进目录即自动出现在下拉里；
 *  - 每个班级独立一行：A 班留 fill、B 班留 debug 互不影响，也可跟随全局默认；
 *  - 附带开放进度（把阶段代码下发到本实验）、个别学生调整与作业公告。
 */
const props = defineProps<{ lab: TutorLab; endpoint: string }>()
const emit = defineEmits<{ (event: 'notice', text: string): void }>()

interface ScopeConfig {
  openLab?: string
  assignments?: Record<string, string>
  notice?: string
}

interface Overview {
  config: {
    openLab: string
    assignments: Record<string, string>
    notice: string
    classes: Record<string, ScopeConfig>
    students: Record<string, ScopeConfig>
  }
  students: Array<{ user: string; className: string }>
  labs: string[]
  exercises: Record<string, { default: string; variants: Array<{ name: string; label: string }> }>
}

const overview = ref<Overview | null>(null)
const busy = ref(false)
const note = ref('')
const noteOk = ref(false)

/* 每个作用域一份任务类型草稿：'' = 全局默认，其余为班级名 / student:用户名。 */
const variantDrafts = ref<Record<string, string>>({})
const studentSel = ref('')
const noticeScope = ref('')
const noticeDraft = ref('')

const classList = computed(() =>
  [...new Set((overview.value?.students || []).map((s) => s.className).filter(Boolean))],
)
const studentList = computed(() => (overview.value?.students || []).map((s) => s.user))
const variants = computed(() => overview.value?.exercises?.[props.lab.id]?.variants || [])
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

/** 该作用域实际生效的开放进度（覆盖 > 全局）。 */
function effectiveOpenLab(entry?: ScopeConfig) {
  return entry?.openLab || overview.value?.config.openLab || ''
}

/** 本实验对该作用域是否已开放。 */
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

function classEntry(name: string) {
  return overview.value?.config.classes?.[name]
}

function studentEntry(user: string) {
  return overview.value?.config.students?.[user]
}

function variantLabel(name: string) {
  if (name === 'random') return '每人随机'
  return variants.value.find((v) => v.name === name)?.label || ''
}

async function load() {
  try {
    const response = await fetch(`${props.endpoint}/teacher/overview`, { headers: authHeaders() })
    if (response.ok) {
      overview.value = await response.json()
      if (!noticeScope.value) noticeDraft.value = overview.value?.config.notice || ''
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
async function publish(
  scope: { type: 'global' | 'class' | 'student'; id: string },
  extra: Record<string, unknown>,
  okText: string,
) {
  if (busy.value) return
  busy.value = true
  note.value = ''
  try {
    const response = await fetch(`${props.endpoint}/teacher/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ scope, ...extra }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
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
  await publish(
    scopeOf(key),
    { assignment: { labId: props.lab.id, variant } },
    `${scopeName(key)}：${props.lab.id} 任务已设为 ${variant}。`,
  )
}

/** 开放本实验：把阶段代码下发到当前 Lab。 */
async function openTo(key: string) {
  await publish(scopeOf(key), { openLab: props.lab.id }, `${scopeName(key)}：已开放到 ${props.lab.id}。`)
}

async function publishNotice() {
  if (!noticeDraft.value.trim()) return
  await publish(
    scopeOf(noticeScope.value),
    { notice: noticeDraft.value },
    `${scopeName(noticeScope.value)}：公告已发布。`,
  )
}

watch(noticeScope, (scope) => {
  if (!overview.value) return
  noticeDraft.value = scope
    ? classEntry(scope)?.notice || overview.value.config.notice || ''
    : overview.value.config.notice || ''
})

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
        <span><strong>{{ openTargetCount }}/{{ targetCount }}</strong>目标已开放</span>
        <span><strong>{{ classList.length }}</strong>个班级</span>
        <span><strong>{{ studentList.length }}</strong>名学生</span>
      </div>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>01</span>
          <div><h3>按班级安排</h3><p>班级设置会覆盖全局默认，只影响当前实验。</p></div>
        </div>

        <div class="ws-pub-target ws-pub-target-global">
          <div class="ws-pub-target-info">
            <strong><Users :size="15" aria-hidden="true" />全局默认</strong>
            <span class="ws-pub-badge" :class="isOpen(undefined) ? 'open' : 'closed'">
              {{ isOpen(undefined) ? '本实验已开放' : `当前开放到 ${effectiveOpenLab(undefined) || '—'}` }}
            </span>
            <small>当前任务：{{ assignedVariant(undefined)[0] }}<template v-if="variantLabel(assignedVariant(undefined)[0])"> · {{ variantLabel(assignedVariant(undefined)[0]) }}</template></small>
          </div>
          <div class="ws-pub-target-actions">
            <template v-if="variants.length">
              <select v-model="variantDrafts['']" aria-label="全局默认任务类型">
                <option value="" disabled>选择任务类型</option>
                <option v-for="v in variants" :key="v.name" :value="v.name">{{ v.name }} · {{ v.label }}</option>
                <option value="random">random · 每人随机</option>
              </select>
              <button type="button" :disabled="busy || !variantDrafts['']" title="下发任务" @click="assignTo('')"><Send :size="14" aria-hidden="true" />下发</button>
            </template>
            <span v-else class="ws-pub-no-variants">暂无任务变体</span>
            <button v-if="!isOpen(undefined)" type="button" class="ghost" :disabled="busy" title="开放本实验" @click="openTo('')"><Unlock :size="14" aria-hidden="true" /></button>
          </div>
        </div>

        <div v-for="c in classList" :key="c" class="ws-pub-target">
          <div class="ws-pub-target-info">
            <strong><Users :size="15" aria-hidden="true" />{{ c }}</strong>
            <span class="ws-pub-badge" :class="isOpen(classEntry(c)) ? 'open' : 'closed'">
              {{ isOpen(classEntry(c)) ? '本实验已开放' : `当前开放到 ${effectiveOpenLab(classEntry(c)) || '—'}` }}
            </span>
            <small>当前任务：{{ assignedVariant(classEntry(c))[0] }} · {{ assignedVariant(classEntry(c))[1] ? '本班设置' : '跟随默认' }}</small>
          </div>
          <div class="ws-pub-target-actions">
            <template v-if="variants.length">
              <select v-model="variantDrafts[c]" :aria-label="`${c}任务类型`">
                <option value="" disabled>选择任务类型</option>
                <option v-for="v in variants" :key="v.name" :value="v.name">{{ v.name }} · {{ v.label }}</option>
                <option value="random">random · 每人随机</option>
              </select>
              <button type="button" :disabled="busy || !variantDrafts[c]" title="下发任务" @click="assignTo(c)"><Send :size="14" aria-hidden="true" />下发</button>
            </template>
            <span v-else class="ws-pub-no-variants">暂无任务变体</span>
            <button v-if="!isOpen(classEntry(c))" type="button" class="ghost" :disabled="busy" title="开放本实验" @click="openTo(c)"><Unlock :size="14" aria-hidden="true" /></button>
          </div>
        </div>

        <p v-if="!classList.length" class="ws-pub-empty">学生注册并填写班级后，班级会自动出现在这里。</p>

        <details class="ws-pub-variant-help">
          <summary>查看本实验可用的 {{ variants.length + 1 }} 种任务类型</summary>
          <p v-if="variants.length"><span v-for="v in variants" :key="v.name"><code>{{ v.name }}</code> {{ v.label }}</span><span><code>random</code> 每人随机</span></p>
          <p v-else>当前只有默认任务。向 <code>scaffold/exercises/{{ lab.id }}/</code> 添加变体后会自动出现。</p>
        </details>
      </section>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>02</span>
          <div><h3>个别调整</h3><p>仅在学生需要不同任务或额外开放时使用。</p></div>
        </div>
        <div class="ws-pub-student-row">
          <select v-model="studentSel" aria-label="选择学生">
            <option value="" disabled>选择学生</option>
            <option v-for="u in studentList" :key="u" :value="u">{{ u }}</option>
          </select>
          <template v-if="studentSel">
            <span class="ws-pub-student-current">
              <UserRound :size="14" aria-hidden="true" />当前 {{ assignedVariant(studentEntry(studentSel))[0] }} · {{ assignedVariant(studentEntry(studentSel))[1] ? '单独设置' : '跟随班级/默认' }}
            </span>
            <select v-model="variantDrafts[`student:${studentSel}`]" :disabled="!variants.length" aria-label="学生任务类型">
              <option value="" disabled>选择任务类型</option>
              <option v-for="v in variants" :key="v.name" :value="v.name">{{ v.name }} · {{ v.label }}</option>
              <option value="random">random</option>
            </select>
            <button
              type="button"
              :disabled="busy || !variantDrafts[`student:${studentSel}`]"
              @click="assignTo(`student:${studentSel}`)"
            >
              <Send :size="14" aria-hidden="true" />下发
            </button>
            <button
              v-if="!isOpen(studentEntry(studentSel))"
              type="button"
              class="ghost"
              :disabled="busy"
              @click="openTo(`student:${studentSel}`)"
            >
              <Unlock :size="14" aria-hidden="true" />开放
            </button>
          </template>
        </div>
        <p v-if="!studentList.length" class="ws-pub-empty">还没有学生注册。</p>
      </section>

      <section class="ws-pub-block">
        <div class="ws-pub-section-title">
          <span>03</span>
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
    </div>

    <p v-else class="ws-pub-empty ws-pub-loading">正在载入班级与作业配置…</p>
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

.ws-pub-target-actions,
.ws-pub-student-row {
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

.ws-pub-student-row {
  justify-content: flex-start;
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
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-xs);
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

@media (max-width: 1180px) {
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
  .ws-pub-student-row > select {
    flex: 1 1 100%;
    width: 100%;
  }
}
</style>
