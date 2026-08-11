<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCw, Search, UserRound, Users } from 'lucide-vue-next'
import { authHeaders } from '../tutor-model'
import FinalProjectEditor, { type FinalProjectDraft } from './FinalProjectEditor.vue'

/**
 * 期末探索任务独立发布页：不依赖实验手册，按全局 / 班级 / 单个学生发布。
 * 数据与教师工作台共用 /teacher/overview 与 /teacher/config，发布后学生端
 * 在「系统构建路径」的 Lab9 节点读取。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

interface ScopeConfig {
  finalProject?: FinalProjectDraft | null
}

interface Overview {
  config: {
    finalProject?: FinalProjectDraft | null
    classes: Record<string, ScopeConfig>
    students: Record<string, ScopeConfig>
  }
  classNames: string[]
  students: Array<{ user: string; className: string }>
}

interface FinalScoreRow {
  rank: number
  user: string
  className: string
  metric: string
  value: number
  direction: 'higher' | 'lower'
  unit: string
  evidenceRunId: string
  note: string
  submittedAt: string
  verified?: boolean
  trusted?: boolean
  runStatus?: string
}

interface ScopeEntry {
  key: string
  label: string
  sublabel: string
  type: 'global' | 'class' | 'student'
  own: boolean
  effective: FinalProjectDraft | null
  status: 'own' | 'inherit' | 'none'
}

const overview = ref<Overview | null>(null)
const busy = ref(false)
const note = ref('')
const noteOk = ref(false)
const finalProjectScope = ref('')
const studentFilter = ref('')
const leaderboardMetric = ref('')
const leaderboardRows = ref<FinalScoreRow[]>([])
const leaderboardLoading = ref(false)

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

const studentList = computed(() =>
  (overview.value?.students || []).map((student) => ({
    user: student.user,
    className: String(student.className || '').trim(),
  })),
)

const filteredStudents = computed(() => {
  const keyword = studentFilter.value.trim().toLowerCase()
  if (!keyword) return studentList.value
  return studentList.value.filter((student) =>
    `${student.user} ${student.className}`.toLowerCase().includes(keyword),
  )
})

function classEntry(name: string) {
  return overview.value?.config.classes?.[name]
}

function studentEntry(user: string) {
  return overview.value?.config.students?.[user]
}

/** 期末任务按作用域就近读取：学生 > 班级 > 全局；未设置时回落上一级。 */
function finalProjectFor(scopeKey: string): FinalProjectDraft | null | undefined {
  if (!overview.value) return null
  if (scopeKey.startsWith('student:')) {
    const user = scopeKey.slice(8)
    const own = studentEntry(user)?.finalProject
    if (own) return own
    const student = studentList.value.find((item) => item.user === user)
    const className = String(student?.className || '').trim()
    const classProject = className ? classEntry(className)?.finalProject : null
    return classProject || overview.value.config.finalProject
  }
  if (scopeKey) return classEntry(scopeKey)?.finalProject || overview.value.config.finalProject
  return overview.value.config.finalProject
}

const scopeEntries = computed<ScopeEntry[]>(() => {
  if (!overview.value) return []
  const entries: ScopeEntry[] = []
  const global = overview.value.config.finalProject || null
  entries.push({
    key: '',
    label: '全体学生',
    sublabel: `${studentList.value.length} 名学生`,
    type: 'global',
    own: Boolean(global),
    effective: global,
    status: global ? 'own' : 'none',
  })
  for (const name of classList.value) {
    const own = classEntry(name)?.finalProject || null
    const effective = finalProjectFor(name) || null
    entries.push({
      key: name,
      label: name,
      sublabel: own ? '本班已发布' : effective ? '跟随全局' : '未发布',
      type: 'class',
      own: Boolean(own),
      effective,
      status: own ? 'own' : effective ? 'inherit' : 'none',
    })
  }
  for (const student of studentList.value) {
    const key = `student:${student.user}`
    const own = studentEntry(student.user)?.finalProject || null
    const effective = finalProjectFor(key) || null
    entries.push({
      key,
      label: student.user,
      sublabel: student.className ? `${student.className} · 单个学生` : '单个学生',
      type: 'student',
      own: Boolean(own),
      effective,
      status: own ? 'own' : effective ? 'inherit' : 'none',
    })
  }
  return entries
})

const publishedCount = computed(() => scopeEntries.value.filter((entry) => entry.own).length)

const selectedScope = computed(
  () => scopeEntries.value.find((entry) => entry.key === finalProjectScope.value) || null,
)

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

const leaderboardMetrics = computed(() => {
  const project = finalProjectFor(finalProjectScope.value)
  return Array.isArray(project?.leaderboard?.metrics) ? project.leaderboard.metrics : []
})

async function loadLeaderboard() {
  const metrics = leaderboardMetrics.value
  if (!metrics.length) {
    leaderboardRows.value = []
    return
  }
  if (!leaderboardMetric.value || !metrics.some((metric) => metric.id === leaderboardMetric.value)) {
    leaderboardMetric.value = metrics[0].id
  }
  if (!leaderboardMetric.value) return
  leaderboardLoading.value = true
  try {
    const response = await fetch(
      `${endpoint}/teacher/final/performance?metric=${encodeURIComponent(leaderboardMetric.value)}`,
      { headers: authHeaders() },
    )
    const payload = await response.json().catch(() => ({}))
    leaderboardRows.value = response.ok && Array.isArray(payload.scores) ? payload.scores : []
  } catch {
    leaderboardRows.value = []
  } finally {
    leaderboardLoading.value = false
  }
}

function scopeOf(key: string): { type: 'global' | 'class' | 'student'; id: string } {
  if (!key) return { type: 'global', id: '' }
  if (key.startsWith('student:')) return { type: 'student', id: key.slice(8) }
  return { type: 'class', id: key }
}

function scopeName(key: string) {
  if (!key) return '全体学生'
  if (key.startsWith('student:')) return key.slice(8)
  return `${key} 班`
}

async function load() {
  try {
    const response = await fetch(`${endpoint}/teacher/overview`, { headers: authHeaders() })
    if (response.ok) {
    overview.value = await response.json()
      if (
        finalProjectScope.value &&
        !scopeEntries.value.some((entry) => entry.key === finalProjectScope.value)
      ) {
        finalProjectScope.value = ''
      }
      void loadLeaderboard()
    } else {
      note.value = '需教师账号登录后使用。'
      noteOk.value = false
    }
  } catch {
    note.value = '无法连接导师服务（npm run tutor）。'
    noteOk.value = false
  }
}

async function publish(
  scope: { type: 'global' | 'class' | 'student'; id: string },
  extra: Record<string, unknown>,
  okText: string,
) {
  if (busy.value) return false
  busy.value = true
  note.value = ''
  let ok = false
  try {
    const response = await fetch(`${endpoint}/teacher/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ scope, ...extra }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    ok = true
    note.value = okText
    noteOk.value = true
    await load()
  } catch (err) {
    note.value = err instanceof Error ? err.message : '发布失败'
    noteOk.value = false
  } finally {
    busy.value = false
  }
  return ok
}

async function publishFinalProject(draft: FinalProjectDraft) {
  if (busy.value) return
  if (!draft.title || !draft.description) {
    note.value = '期末探索任务至少需要名称和任务书。'
    noteOk.value = false
    return
  }
  const ok = await publish(
    scopeOf(finalProjectScope.value),
    { finalProject: draft },
    `${scopeName(finalProjectScope.value)}：期末探索任务已发布。`,
  )
  if (ok) await loadLeaderboard()
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

onMounted(load)

watch(finalProjectScope, () => {
  leaderboardMetric.value = ''
  void loadLeaderboard()
})

watch(leaderboardMetric, (value) => {
  if (value) void loadLeaderboard()
})
</script>

<template>
  <div class="fpp" aria-label="期末探索任务发布">
    <header class="fpp-head">
      <div>
        <span>Lab9 · 期末探索任务</span>
        <strong>期末探索任务</strong>
        <p>不依赖实验手册，按全局、班级或单个学生发布。</p>
      </div>
      <button type="button" class="fpp-refresh" title="刷新发布状态" aria-label="刷新发布状态" @click="load">
        <RefreshCw :size="15" aria-hidden="true" />
      </button>
    </header>

    <p v-if="note" class="fpp-note" :class="{ ok: noteOk }">{{ note }}</p>

    <div v-if="overview" class="fpp-body">
      <aside class="fpp-rail">
        <div class="fpp-summary" aria-label="发布概况">
          <span><strong>{{ publishedCount }}/{{ scopeEntries.length }}</strong>范围已发布</span>
          <span><strong>{{ classList.length }}</strong>个班级</span>
          <span><strong>{{ studentList.length }}</strong>名学生</span>
        </div>

        <div class="fpp-scope-group">
          <span class="fpp-group-title">发布范围</span>
          <button
            type="button"
            class="fpp-scope"
            :class="{ active: finalProjectScope === '' }"
            @click="finalProjectScope = ''"
          >
            <Users :size="15" aria-hidden="true" />
            <span>
              <strong>全体学生</strong>
              <small>{{ scopeEntries[0]?.sublabel }}</small>
            </span>
            <span class="fpp-chip" :data-state="scopeEntries[0]?.status">
              {{ scopeEntries[0]?.status === 'own' ? '已发布' : '未发布' }}
            </span>
          </button>
        </div>

        <div class="fpp-scope-group">
          <span class="fpp-group-title">按班级</span>
          <button
            v-for="entry in scopeEntries.filter((item) => item.type === 'class')"
            :key="entry.key"
            type="button"
            class="fpp-scope"
            :class="{ active: finalProjectScope === entry.key }"
            @click="finalProjectScope = entry.key"
          >
            <Users :size="15" aria-hidden="true" />
            <span>
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.sublabel }}</small>
            </span>
            <span class="fpp-chip" :data-state="entry.status">
              {{ entry.status === 'own' ? '已发布' : entry.status === 'inherit' ? '继承' : '未发布' }}
            </span>
          </button>
          <p v-if="!scopeEntries.some((item) => item.type === 'class')" class="fpp-empty">
            还没有班级。
          </p>
        </div>

        <div class="fpp-scope-group">
          <span class="fpp-group-title">单个学生</span>
          <label class="fpp-search">
            <Search :size="13" aria-hidden="true" />
            <input v-model="studentFilter" type="search" placeholder="搜索学生…" />
          </label>
          <button
            v-for="entry in scopeEntries.filter(
              (item) => item.type === 'student' && (!studentFilter.trim() || filteredStudents.some((s) => `student:${s.user}` === item.key)),
            )"
            :key="entry.key"
            type="button"
            class="fpp-scope"
            :class="{ active: finalProjectScope === entry.key }"
            @click="finalProjectScope = entry.key"
          >
            <UserRound :size="15" aria-hidden="true" />
            <span>
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.sublabel }}</small>
            </span>
            <span class="fpp-chip" :data-state="entry.status">
              {{ entry.status === 'own' ? '已发布' : entry.status === 'inherit' ? '继承' : '未发布' }}
            </span>
          </button>
          <p v-if="!filteredStudents.length" class="fpp-empty">没有匹配的学生。</p>
        </div>
      </aside>

      <section class="fpp-editor">
        <header class="fpp-editor-head">
          <span>当前范围</span>
          <strong>{{ selectedScope?.label || scopeName(finalProjectScope) }}</strong>
          <p v-if="selectedScope?.effective">
            当前生效任务：{{ selectedScope.effective.title }}
            <template v-if="selectedScope.status === 'inherit'">
              · {{ selectedScope.type === 'student' ? '跟随班级或全局' : '跟随全局' }}
            </template>
          </p>
          <p v-else>该范围尚未发布任务，编辑并保存后即生效。</p>
        </header>

        <FinalProjectEditor
          :key="finalProjectScope"
          :initial="finalProjectSeed"
          :busy="busy"
          @save="publishFinalProject"
          @clear="clearFinalProject"
        />

        <section v-if="leaderboardMetrics.length" class="fpp-leaderboard">
          <div class="fpp-leaderboard-head">
            <div>
              <h3>性能打榜</h3>
              <p>学生提交最佳成绩后按指标自动排序；同一指标只保留每位学生的更优值。</p>
            </div>
          </div>

          <p class="fpp-check-hint">
            学生报告在「实验验收」的 Lab8 报告中复核；打榜成绩可直接在本页按指标查看。
          </p>

          <label class="fpp-leaderboard-metric">
            <span>指标</span>
            <select v-model="leaderboardMetric" aria-label="性能打榜指标">
              <option v-for="metric in leaderboardMetrics" :key="metric.id" :value="metric.id">
                {{ metric.label }}（{{ metric.unit }}）
              </option>
            </select>
          </label>

          <div class="fpp-leaderboard-table">
            <table>
              <thead>
                <tr>
                  <th>名次</th>
                  <th>学生</th>
                  <th>班级</th>
                  <th>成绩</th>
                  <th>单位</th>
                  <th>证据 run</th>
                  <th>运行状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in leaderboardRows" :key="`${row.user}-${row.metric}`">
                  <td>{{ row.rank }}</td>
                  <td>{{ row.user }}</td>
                  <td>{{ row.className }}</td>
                  <td>{{ row.value }}</td>
                  <td>{{ row.unit }}</td>
                  <td><code>{{ row.evidenceRunId.slice(0, 12) }}…</code></td>
                  <td>
                    <span v-if="row.verified" class="fpp-run-ok">已验证</span>
                    <span v-else-if="row.runStatus === 'finished'">exit 0</span>
                    <span v-else>{{ row.runStatus || '未知' }}</span>
                  </td>
                </tr>
                <tr v-if="!leaderboardRows.length">
                  <td colspan="7">{{ leaderboardLoading ? '加载中…' : '还没有学生提交成绩' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>

    <p v-else class="fpp-loading">正在载入班级与期末任务配置…</p>
  </div>
</template>

<style scoped>
.fpp {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: calc(100dvh - var(--vp-nav-height));
  min-height: 0;
  background: var(--ws-surface);
}

.fpp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  min-height: 64px;
  padding: var(--ws-space-2) var(--ws-space-5);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.fpp-head span {
  display: block;
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.fpp-head strong {
  display: block;
  margin-top: 2px;
  font-size: var(--ws-text-lg);
}

.fpp-head p {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.fpp-refresh {
  display: grid;
  flex: 0 0 auto;
  width: var(--ws-control-md);
  height: var(--ws-control-md);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

.fpp-refresh:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.fpp-note {
  margin: 0;
  padding: var(--ws-space-1) var(--ws-space-5);
  color: var(--ws-danger, #c0392b);
  border-bottom: 1px solid var(--ws-line);
  font-size: var(--ws-text-xs);
}

.fpp-note.ok {
  color: var(--ws-ok, #1a7f37);
}

.fpp-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.fpp-rail {
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface-soft);
}

.fpp-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ws-space-1);
  padding: var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.fpp-summary span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.fpp-summary strong {
  display: block;
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
  font-variant-numeric: tabular-nums;
}

.fpp-scope-group {
  padding: var(--ws-space-3) var(--ws-space-2);
  border-bottom: 1px solid var(--ws-line);
}

.fpp-group-title {
  display: block;
  margin: 0 var(--ws-space-2) var(--ws-space-2);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.fpp-scope {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ws-space-2);
  width: 100%;
  padding: var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-md);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.fpp-scope:hover {
  background: var(--ws-accent-soft);
}

.fpp-scope.active {
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.fpp-scope > svg {
  flex: 0 0 auto;
  color: var(--ws-ink-muted);
}

.fpp-scope.active > svg {
  color: var(--ws-accent);
}

.fpp-scope strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  font-size: var(--ws-text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fpp-scope small {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fpp-chip {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: var(--ws-radius-full);
  font-size: var(--ws-text-xs);
  white-space: nowrap;
}

.fpp-chip[data-state='own'] {
  color: var(--ws-ok);
  background: var(--ws-ok-soft);
}

.fpp-chip[data-state='inherit'] {
  color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.fpp-chip[data-state='none'] {
  color: var(--ws-ink-faint);
  background: var(--ws-surface-alt);
}

.fpp-empty {
  margin: var(--ws-space-2) var(--ws-space-2) 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.fpp-search {
  position: relative;
  display: block;
  margin: 0 var(--ws-space-2) var(--ws-space-2);
}

.fpp-search svg {
  position: absolute;
  top: 50%;
  left: 9px;
  color: var(--ws-ink-faint);
  transform: translateY(-50%);
}

.fpp-search input {
  width: 100%;
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2) var(--ws-space-1) 26px;
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
}

.fpp-editor {
  min-width: 0;
  min-height: 0;
  padding: var(--ws-space-4) var(--ws-space-5) var(--ws-space-6);
  overflow-y: auto;
}

.fpp-editor-head {
  margin-bottom: var(--ws-space-4);
  padding-bottom: var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
}

.fpp-editor-head > span {
  color: var(--ws-accent);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.fpp-editor-head strong {
  display: block;
  margin-top: 2px;
  font-size: var(--ws-text-xl);
}

.fpp-editor-head p {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
  overflow-wrap: anywhere;
}

.fpp-loading {
  padding: var(--ws-space-4) var(--ws-space-5);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-sm);
}

.fpp-leaderboard {
  margin-top: var(--ws-space-5);
  padding-top: var(--ws-space-4);
  border-top: 1px solid var(--ws-line);
}

.fpp-leaderboard-head h3 {
  margin: 0 0 var(--ws-space-1);
  font-size: var(--ws-text-base);
}

.fpp-leaderboard-head p {
  margin: 0 0 var(--ws-space-3);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.fpp-leaderboard-metric {
  display: grid;
  gap: 4px;
  margin-bottom: var(--ws-space-3);
}

.fpp-leaderboard-metric > span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.fpp-leaderboard-metric select {
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.fpp-leaderboard-table {
  overflow-x: auto;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
}

.fpp-leaderboard-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ws-text-xs);
}

.fpp-leaderboard-table th,
.fpp-leaderboard-table td {
  padding: 6px var(--ws-space-2);
  text-align: left;
  border-bottom: 1px solid var(--ws-line);
  white-space: nowrap;
}

.fpp-leaderboard-table th {
  color: var(--ws-ink-muted);
  background: var(--ws-surface-alt);
  font-weight: var(--ws-weight-semibold);
}

.fpp-leaderboard-table tr:last-child td {
  border-bottom: 0;
}

.fpp-leaderboard-table code {
  font-family: var(--ws-font-mono);
}

.fpp-check-hint {
  margin: 0 0 var(--ws-space-3);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.fpp-run-ok {
  color: var(--ws-ok);
  font-weight: var(--ws-weight-semibold);
}

@media (max-width: 900px) {
  .fpp-body {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }

  .fpp-rail {
    max-height: 42dvh;
    overflow-y: auto;
    border-right: 0;
    border-bottom: 1px solid var(--ws-line);
  }

  .fpp-editor {
    overflow-y: visible;
  }
}
</style>
