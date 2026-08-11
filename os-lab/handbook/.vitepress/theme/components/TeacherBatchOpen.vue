<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Send,
  Users,
  X,
} from 'lucide-vue-next'
import { authHeaders, tutorLabs, type TutorLabId } from '../tutor-model'

const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

interface ScheduleEntry {
  unlockAt?: string | null
  lockAt?: string | null
}

interface ScopeConfig {
  schedules?: Record<string, ScheduleEntry>
}

interface Overview {
  classNames: string[]
  config: {
    schedules?: Record<string, ScheduleEntry>
    classes: Record<string, ScopeConfig>
  }
}

interface CalendarEvent {
  when: string
  labId: TutorLabId
  kind: 'unlock' | 'lock'
  classLabel: string
}

const overview = ref<Overview | null>(null)
const selectedClasses = ref<string[]>([])
const selectedLab = ref<TutorLabId>('lab1')
const unlockAt = ref('')
const lockAt = ref('')
const busy = ref(false)
const note = ref('')
const noteOk = ref(false)
const calendarOpen = ref(false)
const selectedDate = ref('')
const calendarMonth = ref(monthStart(new Date()))

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function dateKey(date: Date) {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const classList = computed(() => overview.value?.classNames || [])
const hasClassSelection = computed(() => selectedClasses.value.length > 0)
const allClassesSelected = computed(
  () => classList.value.length > 0 && classList.value.every((name) => selectedClasses.value.includes(name)),
)
const selectedLabLabel = computed(
  () => tutorLabs.find((lab) => lab.id === selectedLab.value)?.label || selectedLab.value,
)

const calendarEvents = computed<CalendarEvent[]>(() => {
  const events: CalendarEvent[] = []
  const config = overview.value?.config
  if (!config) return events
  const pushSchedule = (classLabel: string, schedule?: Record<string, ScheduleEntry>) => {
    for (const [labId, entry] of Object.entries(schedule || {})) {
      if (!tutorLabs.some((lab) => lab.id === labId)) continue
      if (entry?.unlockAt) events.push({ when: entry.unlockAt, labId: labId as TutorLabId, kind: 'unlock', classLabel })
      if (entry?.lockAt) events.push({ when: entry.lockAt, labId: labId as TutorLabId, kind: 'lock', classLabel })
    }
  }
  pushSchedule('全局默认', config.schedules)
  for (const [name, scope] of Object.entries(config.classes || {})) {
    pushSchedule(name, scope.schedules)
  }
  return events.sort((left, right) => left.when.localeCompare(right.when))
})

const calendarTitle = computed(() => {
  const date = calendarMonth.value
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
})

const calendarCells = computed(() => {
  const year = calendarMonth.value.getFullYear()
  const month = calendarMonth.value.getMonth()
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey = dateKey(new Date())
  const cells: Array<{ key: string; day: number; isToday: boolean; events: CalendarEvent[] } | null> = []
  for (let index = 0; index < lead; index += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day)
    const key = dateKey(date)
    cells.push({
      key,
      day,
      isToday: key === todayKey,
      events: calendarEvents.value.filter((event) => dateKey(new Date(event.when)) === key),
    })
  }
  return cells
})

function toggleClass(name: string) {
  selectedClasses.value = selectedClasses.value.includes(name)
    ? selectedClasses.value.filter((item) => item !== name)
    : [...selectedClasses.value, name]
}

function toggleAllClasses() {
  selectedClasses.value = allClassesSelected.value ? [] : [...classList.value]
}

function shiftMonth(delta: number) {
  const next = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() + delta, 1)
  calendarMonth.value = next
  selectedDate.value = ''
}

function eventLabel(event: CalendarEvent) {
  const lab = tutorLabs.find((item) => item.id === event.labId)
  return `${event.kind === 'unlock' ? '解锁' : '截止'} ${lab?.label || event.labId} · ${event.classLabel}`
}

async function load() {
  try {
    const response = await fetch(`${endpoint}/teacher/overview`, { headers: authHeaders() })
    if (response.ok) {
      overview.value = await response.json()
      prefillExistingSchedule()
    }
  } catch {
    overview.value = null
  }
}

function existingScheduleForLab() {
  const labId = selectedLab.value
  for (const name of selectedClasses.value) {
    const entry = overview.value?.config.classes?.[name]?.schedules?.[labId]
    if (entry && (entry.unlockAt || entry.lockAt)) return entry
  }
  const global = overview.value?.config.schedules?.[labId]
  return global && (global.unlockAt || global.lockAt) ? global : null
}

function toLocalInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function prefillExistingSchedule() {
  const existing = existingScheduleForLab()
  unlockAt.value = toLocalInput(existing?.unlockAt)
  lockAt.value = toLocalInput(existing?.lockAt)
}

async function batchOpen() {
  if (busy.value) return
  if (!overview.value || !classList.value.length) await load()
  if (!hasClassSelection.value) {
    note.value = classList.value.length
      ? '请先选择至少一个班级。'
      : '还没有班级，请先在实验工作台创建班级。'
    noteOk.value = false
    return
  }
  if (!unlockAt.value) {
    note.value = '请选择本实验的起始时间。'
    noteOk.value = false
    return
  }
  busy.value = true
  note.value = ''
  try {
    const response = await fetch(`${endpoint}/teacher/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        scope: { type: 'batch', ids: selectedClasses.value },
        openLab: selectedLab.value,
        schedule: {
          labId: selectedLab.value,
          unlockAt: new Date(unlockAt.value).toISOString(),
          lockAt: lockAt.value ? new Date(lockAt.value).toISOString() : '',
        },
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    note.value = `已为 ${selectedClasses.value.length} 个班级安排 ${selectedLabLabel.value}，起始时间 ${formatTime(unlockAt.value)}。`
    noteOk.value = true
    await load()
  } catch (error) {
    note.value = error instanceof Error ? error.message : '批量开放失败'
    noteOk.value = false
  } finally {
    busy.value = false
  }
}

async function openCalendar() {
  await load()
  const first = calendarEvents.value[0]
  calendarMonth.value = first ? monthStart(new Date(first.when)) : monthStart(new Date())
  selectedDate.value = ''
  calendarOpen.value = true
}

function formatTime(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDateTitle(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

function selectDay(key: string) {
  selectedDate.value = key
}

const selectedDayEvents = computed(() =>
  calendarEvents.value.filter((event) => dateKey(new Date(event.when)) === selectedDate.value),
)

watch([selectedClasses, selectedLab], prefillExistingSchedule)

onMounted(load)
</script>

<template>
  <section class="ws-batch-open" aria-label="批量开放">
    <header>
      <div>
        <span>快捷发布</span>
        <h3>批量开放</h3>
        <p>选择班级和实验，设置起始时间后一键安排。</p>
      </div>
      <button type="button" class="ghost" :disabled="busy" @click="openCalendar">
        <CalendarDays :size="15" aria-hidden="true" />查看日程
      </button>
    </header>

    <div class="ws-batch-form">
      <label>
        <span><Users :size="13" aria-hidden="true" />班级</span>
        <div class="ws-batch-classes">
          <button
            v-if="classList.length"
            type="button"
            :class="{ active: allClassesSelected }"
            @click="toggleAllClasses"
          >
            全选
          </button>
          <button
            v-for="name in classList"
            :key="name"
            type="button"
            :class="{ active: selectedClasses.includes(name) }"
            @click="toggleClass(name)"
          >
            {{ name }}
          </button>
          <span v-if="!classList.length" class="ws-batch-empty">还没有班级，可在单个实验工作台创建。</span>
        </div>
      </label>

      <div class="ws-batch-grid">
        <label>
          <span>实验</span>
          <select v-model="selectedLab" aria-label="批量开放实验">
            <option v-for="lab in tutorLabs" :key="lab.id" :value="lab.id">
              {{ lab.label }} · {{ lab.systemLayer }}
            </option>
          </select>
        </label>
        <label>
          <span>起始时间</span>
          <input v-model="unlockAt" type="datetime-local" aria-label="批量开放起始时间" />
        </label>
        <label>
          <span>截止时间（可选）</span>
          <input v-model="lockAt" type="datetime-local" aria-label="批量截止时间" />
        </label>
      </div>
    </div>

    <div class="ws-batch-actions">
      <button
        type="button"
        :disabled="busy"
        @click="batchOpen"
      >
        <Send :size="14" aria-hidden="true" />批量开放
      </button>
      <span v-if="note" :class="{ ok: noteOk }">{{ note }}</span>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="calendarOpen" class="ws-batch-calendar-backdrop" @click.self="calendarOpen = false">
      <section class="ws-batch-calendar" role="dialog" aria-modal="true" aria-label="教学日程">
        <header>
          <div>
            <span><Clock3 :size="14" aria-hidden="true" />教学日程</span>
            <h3>已安排的解锁与截止</h3>
          </div>
          <button type="button" aria-label="关闭日程" @click="calendarOpen = false">
            <X :size="18" aria-hidden="true" />
          </button>
        </header>

        <div class="ws-batch-calendar-toolbar">
          <button type="button" @click="shiftMonth(-1)">
            <ChevronLeft :size="15" aria-hidden="true" />上月
          </button>
          <strong>{{ calendarTitle }}</strong>
          <button type="button" @click="shiftMonth(1)">
            下月<ChevronRight :size="15" aria-hidden="true" />
          </button>
        </div>

        <div class="ws-batch-calendar-week">
          <span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</span>
        </div>
        <div class="ws-batch-calendar-grid">
          <div
            v-for="(cell, index) in calendarCells"
            :key="cell?.key || `blank-${index}`"
            class="ws-batch-calendar-cell"
            :class="{ blank: !cell, today: cell?.isToday, active: selectedDate === cell?.key }"
          >
            <button
              v-if="cell"
              type="button"
              class="ws-batch-calendar-day"
              :disabled="!cell.events.length"
              @click="selectDay(cell.key)"
            >
              <span>{{ cell.day }}</span>
              <ul v-if="cell.events.length">
                <li v-for="event in cell.events" :key="`${event.when}-${event.kind}-${event.classLabel}`">
                  {{ eventLabel(event) }}
                </li>
              </ul>
            </button>
          </div>
        </div>
        <div class="ws-batch-calendar-bottom">
          <section v-if="selectedDate" class="ws-batch-day-detail">
            <header>
              <div>
                <span>单日详情</span>
                <strong>{{ formatDateTitle(selectedDate) }}</strong>
              </div>
              <button type="button" aria-label="关闭单日详情" @click="selectedDate = ''">
                <X :size="14" aria-hidden="true" />
              </button>
            </header>
            <ul v-if="selectedDayEvents.length">
              <li v-for="event in selectedDayEvents" :key="`${event.when}-${event.kind}-${event.classLabel}`">
                <time>{{ formatDateTime(event.when) }}</time>
                <span>{{ eventLabel(event) }}</span>
              </li>
            </ul>
            <p v-else class="ws-batch-calendar-empty">当天还没有安排。</p>
          </section>
          <p v-else-if="!calendarEvents.length" class="ws-batch-calendar-empty">还没有已安排的实验日程。</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.ws-batch-open {
  display: grid;
  gap: var(--ws-space-3);
  margin: var(--ws-space-4) 0;
  padding: var(--ws-space-4);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface);
}

.ws-batch-open > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ws-space-3);
}

.ws-batch-open > header span,
.ws-batch-calendar header span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-batch-open h3,
.ws-batch-calendar h3 {
  margin: var(--ws-space-1) 0 0;
  font-size: var(--ws-text-base);
}

.ws-batch-open p,
.ws-batch-calendar p {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-batch-open button,
.ws-batch-calendar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-batch-open button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.ws-batch-open .ghost {
  background: var(--ws-surface);
}

.ws-batch-form {
  display: grid;
  gap: var(--ws-space-3);
}

.ws-batch-form > label,
.ws-batch-grid label {
  display: grid;
  gap: var(--ws-space-1);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-batch-form label > span,
.ws-batch-grid label span {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
}

.ws-batch-classes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-1);
}

.ws-batch-classes button {
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2);
  font-size: var(--ws-text-xs);
}

.ws-batch-classes button.active {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-batch-empty {
  color: var(--ws-ink-faint);
}

.ws-batch-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ws-space-3);
}

.ws-batch-grid select,
.ws-batch-grid input {
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.ws-batch-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ws-space-3);
}

.ws-batch-actions button {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-batch-actions > span {
  color: var(--ws-danger);
  font-size: var(--ws-text-xs);
}

.ws-batch-actions > span.ok {
  color: var(--ws-ok);
}

.ws-batch-calendar-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--ws-z-dialog);
  display: grid;
  padding: var(--ws-space-4);
  background: rgba(14, 22, 26, 0.5);
  place-items: center;
}

.ws-batch-calendar {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  width: min(760px, 100%);
  max-height: min(720px, calc(100dvh - 2 * var(--ws-space-4)));
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
  overflow: hidden;
}

.ws-batch-calendar > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ws-space-3);
  padding: var(--ws-space-4) var(--ws-space-5);
  border-bottom: 1px solid var(--ws-line);
}

.ws-batch-calendar > header button {
  width: var(--ws-control-md);
  padding: 0;
}

.ws-batch-calendar-toolbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-3) var(--ws-space-5);
}

.ws-batch-calendar-toolbar button:last-child {
  justify-self: end;
}

.ws-batch-calendar-toolbar strong {
  font-size: var(--ws-text-base);
}

.ws-batch-calendar-week,
.ws-batch-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.ws-batch-calendar-week {
  padding: 0 var(--ws-space-5);
}

.ws-batch-calendar-week span {
  padding: var(--ws-space-1) 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  text-align: center;
}

.ws-batch-calendar-grid {
  min-height: 0;
  margin: 0 var(--ws-space-5);
  overflow-y: auto;
  border: 1px solid var(--ws-line);
}

.ws-batch-calendar-cell {
  display: flex;
  flex-direction: column;
  min-height: 82px;
  padding: 0;
  border-right: 1px solid var(--ws-line);
  border-bottom: 1px solid var(--ws-line);
  font-size: var(--ws-text-xs);
}

.ws-batch-calendar-day {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ws-space-1);
  min-width: 0;
  min-height: 0;
  padding: var(--ws-space-1) var(--ws-space-2);
  color: inherit;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ws-batch-calendar-day:disabled {
  cursor: default;
}

.ws-batch-calendar-cell.blank {
  background: var(--ws-surface-soft);
}

.ws-batch-calendar-cell.today {
  background: var(--ws-accent-soft);
}

.ws-batch-calendar-cell.active {
  box-shadow: inset 0 0 0 2px var(--ws-accent);
}

.ws-batch-calendar-day > span {
  color: var(--ws-ink-muted);
  font-variant-numeric: tabular-nums;
}

.ws-batch-calendar-cell.today .ws-batch-calendar-day > span {
  color: var(--ws-accent);
  font-weight: var(--ws-weight-bold);
}

.ws-batch-calendar-day ul {
  display: grid;
  gap: 2px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.ws-batch-calendar-day li {
  overflow: hidden;
  color: var(--ws-ink-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-batch-calendar-bottom {
  max-height: 260px;
  margin: var(--ws-space-3) var(--ws-space-5) var(--ws-space-4);
  overflow-y: auto;
  border-top: 1px solid var(--ws-line);
}

.ws-batch-day-detail > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  margin: var(--ws-space-2) 0;
}

.ws-batch-day-detail header span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-batch-day-detail header strong {
  display: block;
  margin-top: 2px;
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.ws-batch-day-detail header button {
  width: var(--ws-control-sm);
  min-height: var(--ws-control-sm);
  padding: 0;
}

.ws-batch-day-detail ul {
  display: grid;
  gap: var(--ws-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ws-batch-day-detail li {
  display: flex;
  align-items: baseline;
  gap: var(--ws-space-2);
  min-width: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-batch-day-detail time {
  flex: 0 0 auto;
  color: var(--ws-accent);
  font-family: var(--ws-font-mono);
  font-variant-numeric: tabular-nums;
}

.ws-batch-day-detail li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-batch-calendar-empty {
  padding: var(--ws-space-3) 0;
  text-align: center;
}

@media (max-width: 640px) {
  .ws-batch-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ws-batch-calendar-cell {
    min-height: 64px;
  }
}
</style>
