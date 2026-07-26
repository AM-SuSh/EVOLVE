<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  LockKeyhole,
  Waypoints,
  X,
} from 'lucide-vue-next'
import { tutorLabs, type LabJourneyItem, type TutorLabId } from '../tutor-model'

/**
 * 系统构建路径。
 *
 * 旧版把它藏在顶栏一个 Layers3 图标后面，锁定原因只靠 2.4 秒的 11px toast
 * 一闪而过，学生完全不知道自己为什么进不去下一层。这里改成顶栏常驻 stepper，
 * 锁定原因写成常驻文字。
 */
const props = defineProps<{ journey: LabJourneyItem[]; compact?: boolean }>()

const emit = defineEmits<{
  (event: 'enter-lab', labId: TutorLabId): void
  (event: 'export-growth'): void
}>()

const open = ref(false)

const completedCount = computed(() => props.journey.filter((item) => item.completed).length)
const progress = computed(() => Math.round((completedCount.value / tutorLabs.length) * 100))
const builtLayers = computed(() =>
  props.journey.filter((item) => item.completed).map((item) => item.lab.systemLayer),
)

function enter(item: LabJourneyItem) {
  if (!item.unlocked) return
  open.value = false
  emit('enter-lab', item.lab.id)
}
</script>

<template>
  <div class="ws-journey">
    <button
      class="ws-journey-trigger"
      type="button"
      :aria-expanded="open"
      @click="open = true"
    >
      <Waypoints :size="16" aria-hidden="true" />
      <span class="ws-journey-trigger-text">系统构建路径</span>
      <ol class="ws-journey-dots" aria-hidden="true">
        <li
          v-for="item in journey"
          :key="item.lab.id"
          :class="{ complete: item.completed, current: item.current, locked: !item.unlocked }"
        />
      </ol>
      <strong>{{ completedCount }}/{{ tutorLabs.length }}</strong>
    </button>

    <div v-if="open" class="ws-journey-backdrop" @click.self="open = false">
      <section
        class="ws-journey-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ws-journey-title"
      >
        <header class="ws-journey-header">
          <div>
            <span><Waypoints :size="16" aria-hidden="true" />你的系统构建路径</span>
            <h2 id="ws-journey-title">从启动代码，逐层构建一个完整小系统</h2>
            <p>每一层都要留下提问、验证和复盘证据。完成验证与复盘后，下一层才会解锁。</p>
          </div>
          <button type="button" aria-label="关闭系统构建路径" @click="open = false">
            <X :size="19" aria-hidden="true" />
          </button>
        </header>

        <div class="ws-journey-stack">
          <div class="ws-journey-track"><span :style="{ width: `${progress}%` }" /></div>
          <div class="ws-journey-layers">
            <span
              v-for="item in journey"
              :key="item.lab.id"
              :class="{ complete: item.completed }"
            >{{ item.lab.systemLayer }}</span>
          </div>
        </div>

        <div class="ws-journey-summary">
          <div>
            <strong>{{ completedCount }}/{{ tutorLabs.length }}</strong>
            <span>系统层已构建</span>
          </div>
          <p v-if="builtLayers.length">已获得：{{ builtLayers.join('、') }}</p>
          <p v-else>从 Lab1 的启动底座开始，第一次验证通过后，你的系统会点亮第一层。</p>
          <button type="button" @click="emit('export-growth')">
            <Download :size="15" aria-hidden="true" />导出成长档案
          </button>
        </div>

        <ol class="ws-journey-list">
          <li
            v-for="item in journey"
            :key="item.lab.id"
            :class="{ complete: item.completed, current: item.current, locked: !item.unlocked }"
          >
            <div class="ws-journey-rail" aria-hidden="true">
              <span>
                <CheckCircle2 v-if="item.completed" :size="20" />
                <LockKeyhole v-else-if="!item.unlocked" :size="18" />
                <strong v-else>{{ item.index + 1 }}</strong>
              </span>
              <i v-if="item.index < journey.length - 1" />
            </div>

            <div class="ws-journey-lab">
              <span>{{ item.lab.label }}</span>
              <strong>{{ item.lab.systemLayer }}</strong>
              <small>{{ item.status }}</small>
            </div>

            <div class="ws-journey-outcome">
              <h3>{{ item.lab.title }}</h3>
              <p>{{ item.lab.buildOutcome }}</p>
              <small class="ws-journey-bridge">
                <ArrowRight :size="14" aria-hidden="true" />{{ item.lab.bridge }}
              </small>
              <p v-if="item.lockReason" class="ws-journey-lock">
                <LockKeyhole :size="13" aria-hidden="true" />{{ item.lockReason }}
              </p>
              <div class="ws-journey-evidence">
                <span :class="{ done: item.passedVerification }">
                  <Check v-if="item.passedVerification" :size="14" aria-hidden="true" />
                  <Circle v-else :size="11" aria-hidden="true" />运行验证
                </span>
                <span :class="{ done: item.reflected }">
                  <Check v-if="item.reflected" :size="14" aria-hidden="true" />
                  <Circle v-else :size="11" aria-hidden="true" />学习复盘
                </span>
                <span v-if="item.evidenceCount">{{ item.evidenceCount }} 条成长证据</span>
              </div>
            </div>

            <button
              class="ws-journey-action"
              type="button"
              :disabled="!item.unlocked"
              @click="enter(item)"
            >
              <template v-if="!item.unlocked">未解锁</template>
              <template v-else-if="item.current">回到学习</template>
              <template v-else-if="item.started">继续学习</template>
              <template v-else>开始构建</template>
              <ChevronRight v-if="item.unlocked" :size="15" aria-hidden="true" />
            </button>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ws-journey-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-2);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-journey-trigger:hover {
  border-color: var(--ws-accent);
}

.ws-journey-trigger > svg {
  color: var(--ws-accent);
}

.ws-journey-dots {
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ws-journey-dots li {
  width: 9px;
  height: 9px;
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-full);
}

.ws-journey-dots li.complete {
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-journey-dots li.current {
  border-color: var(--ws-accent);
  box-shadow: 0 0 0 2px var(--ws-accent-soft);
}

.ws-journey-dots li.locked {
  opacity: 0.4;
}

.ws-journey-trigger strong {
  color: var(--ws-accent);
  font-variant-numeric: tabular-nums;
}

/* -- 弹窗 ------------------------------------------------------------------ */
.ws-journey-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--ws-z-dialog);
  display: grid;
  padding: var(--ws-space-5);
  background: rgba(14, 22, 26, 0.5);
  backdrop-filter: blur(4px);
  place-items: center;
}

.ws-journey-dialog {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: min(940px, 100%);
  max-height: min(780px, calc(100dvh - 2 * var(--ws-space-5)));
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
  overflow: hidden;
  text-align: left;
}

.ws-journey-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ws-space-5);
  padding: var(--ws-space-6) var(--ws-space-6) var(--ws-space-4);
}

.ws-journey-header > div {
  min-width: 0;
}

.ws-journey-header span {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-2);
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-journey-header h2 {
  margin: var(--ws-space-2) 0;
  font-size: var(--ws-text-xl);
  line-height: var(--ws-leading-tight);
}

.ws-journey-header p {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-journey-header > button {
  display: grid;
  flex: 0 0 auto;
  width: var(--ws-control-md);
  height: var(--ws-control-md);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
  place-items: center;
  cursor: pointer;
}

.ws-journey-stack {
  padding: 0 var(--ws-space-6) var(--ws-space-4);
}

.ws-journey-track {
  height: 8px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface-soft);
  overflow: hidden;
}

.ws-journey-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ws-accent);
  transition: width 240ms ease;
}

.ws-journey-layers {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-top: var(--ws-space-2);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-journey-layers span {
  text-align: center;
}

.ws-journey-layers span:first-child {
  text-align: left;
}

.ws-journey-layers span:last-child {
  text-align: right;
}

.ws-journey-layers span.complete {
  color: var(--ws-accent);
  font-weight: var(--ws-weight-semibold);
}

.ws-journey-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ws-space-4);
  padding: var(--ws-space-3) var(--ws-space-6);
  border-block: 1px solid var(--ws-line);
  background: var(--ws-surface-soft);
}

.ws-journey-summary > div {
  display: flex;
  align-items: baseline;
  gap: var(--ws-space-2);
}

.ws-journey-summary strong {
  color: var(--ws-accent);
  font-size: var(--ws-text-xl);
  font-variant-numeric: tabular-nums;
}

.ws-journey-summary span,
.ws-journey-summary p {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.ws-journey-summary p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-journey-summary > button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-2);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-journey-summary > button:hover {
  border-color: var(--ws-accent);
}

.ws-journey-list {
  min-height: 0;
  margin: 0;
  padding: var(--ws-space-2) var(--ws-space-6) var(--ws-space-5);
  overflow-y: auto;
  list-style: none;
}

.ws-journey-list li {
  display: grid;
  grid-template-columns: 44px 130px minmax(0, 1fr) 120px;
  align-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-3) 0;
  border-bottom: 1px solid var(--ws-line);
}

.ws-journey-list li:last-child {
  border-bottom: 0;
}

.ws-journey-list li.current {
  margin-inline: calc(-1 * var(--ws-space-3));
  padding-inline: var(--ws-space-3);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent-soft);
}

.ws-journey-list li.locked {
  opacity: 0.7;
}

.ws-journey-rail {
  position: relative;
  align-self: stretch;
  display: flex;
  justify-content: center;
}

.ws-journey-rail > span {
  position: relative;
  z-index: 2;
  display: grid;
  align-self: center;
  width: 32px;
  height: 32px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface);
  place-items: center;
  font-variant-numeric: tabular-nums;
}

.ws-journey-list li.complete .ws-journey-rail > span,
.ws-journey-list li.current .ws-journey-rail > span {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-journey-rail strong {
  font-size: var(--ws-text-sm);
}

.ws-journey-rail i {
  position: absolute;
  top: 50%;
  bottom: calc(-50% - var(--ws-space-3));
  width: 1px;
  background: var(--ws-line);
}

.ws-journey-list li.complete .ws-journey-rail i {
  background: var(--ws-accent);
}

.ws-journey-lab span,
.ws-journey-lab strong,
.ws-journey-lab small {
  display: block;
}

.ws-journey-lab span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-journey-lab strong {
  margin-top: 2px;
  font-size: var(--ws-text-base);
}

.ws-journey-lab small {
  margin-top: 2px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-journey-outcome {
  min-width: 0;
  padding-right: var(--ws-space-4);
}

.ws-journey-outcome h3 {
  margin: 0;
  font-size: var(--ws-text-base);
}

.ws-journey-outcome p {
  margin: var(--ws-space-1) 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-journey-bridge {
  display: flex;
  align-items: flex-start;
  gap: var(--ws-space-1);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.ws-journey-bridge svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--ws-warn);
}

.ws-journey-lock {
  display: flex !important;
  align-items: center;
  gap: var(--ws-space-1);
  margin-top: var(--ws-space-2) !important;
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-warn) !important;
  border-radius: var(--ws-radius-sm);
  background: var(--ws-warn-soft);
  font-size: var(--ws-text-xs) !important;
}

.ws-journey-evidence {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-1) var(--ws-space-4);
  margin-top: var(--ws-space-2);
}

.ws-journey-evidence span {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-journey-evidence span.done {
  color: var(--ws-ok);
}

.ws-journey-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-journey-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ws-journey-list li.current .ws-journey-action,
.ws-journey-action:hover:not(:disabled) {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

@media (max-width: 860px) {
  .ws-journey-trigger-text {
    display: none;
  }

  .ws-journey-backdrop {
    padding: 0;
    place-items: stretch;
  }

  .ws-journey-dialog {
    width: 100%;
    max-height: none;
    border: 0;
    border-radius: 0;
  }

  .ws-journey-header,
  .ws-journey-stack,
  .ws-journey-summary,
  .ws-journey-list {
    padding-inline: var(--ws-space-4);
  }

  .ws-journey-summary {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ws-journey-summary p {
    grid-column: 1 / -1;
    white-space: normal;
  }

  .ws-journey-list li,
  .ws-journey-list li.current {
    grid-template-columns: 40px minmax(0, 1fr);
    margin-inline: 0;
    padding-inline: 0;
  }

  .ws-journey-rail {
    grid-row: 1 / 4;
  }

  .ws-journey-lab,
  .ws-journey-outcome,
  .ws-journey-action {
    grid-column: 2;
  }

  .ws-journey-lab span,
  .ws-journey-lab strong,
  .ws-journey-lab small {
    display: inline;
    margin-right: var(--ws-space-2);
  }

  .ws-journey-action {
    justify-self: start;
    margin-top: var(--ws-space-2);
  }
}
</style>
