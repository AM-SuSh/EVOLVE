<script setup lang="ts">
import { computed, ref } from 'vue'
import { Cpu, Leaf, Rocket, RotateCcw } from 'lucide-vue-next'
import {
  tutorLabs,
  type FinalProjectAccess,
  type LabJourneyItem,
} from '../tutor-model'

/**
 * 内核年轮：每个 Lab 是一圈宽色环，从核心向外生长。
 * 完成圈从起点开始一圈圈填充，当前圈用金色弧线扫描，期末任务是最外圈与芽点。
 */
const props = defineProps<{
  journey: LabJourneyItem[]
  finalProject?: FinalProjectAccess | null
  finalUnlocked?: boolean
}>()

const hoveredKey = ref<string | null>(null)
const selectedKey = ref<string | null>(null)
const replayKey = ref(0)

function pick(key: string) {
  selectedKey.value = selectedKey.value === key ? null : key
}

function replay() {
  replayKey.value += 1
}

const rings = computed(() => {
  const layers = props.journey.map((item, index) => ({
    key: item.lab.id,
    label: `${item.lab.label} · ${item.lab.systemLayer}`,
    complete: item.completed,
    current: item.current,
    unlocked: item.unlocked,
    radius: 34 + index * 13,
    width: 9,
    index,
  }))
  return [
    ...layers,
    {
      key: 'final',
      label: props.finalProject?.title || '期末探索任务',
      complete: false,
      current: false,
      unlocked: props.finalUnlocked === true,
      radius: 138,
      width: 7,
      index: 8,
    },
  ]
})

const completedCount = computed(() => props.journey.filter((item) => item.completed).length)
const allComplete = computed(() => completedCount.value === tutorLabs.length)
const progressPercent = computed(() =>
  Math.round((completedCount.value / tutorLabs.length) * 100),
)
const showSprout = computed(() => props.finalUnlocked === true)

const activeKey = computed(() => hoveredKey.value || selectedKey.value)
const activeRing = computed(
  () => rings.value.find((ring) => ring.key === activeKey.value) || null,
)

const currentLabel = computed(() => {
  const active =
    props.journey.find((item) => item.current && !item.completed) ||
    [...props.journey].reverse().find((item) => item.unlocked && !item.completed)
  if (active) return `${active.lab.label} · ${active.lab.systemLayer}`
  if (allComplete.value) return '内核已成形，等待探索新边界'
  return '等待教师分发下一层'
})
const displayLabel = computed(() => activeRing.value?.label || currentLabel.value)
</script>

<template>
  <div class="kbs" :class="{ booted: allComplete }">
    <header class="kbs-head">
      <span class="kbs-title">内核年轮</span>
      <strong>{{ completedCount }}/{{ tutorLabs.length }} · {{ progressPercent }}%</strong>
      <button type="button" class="kbs-replay" title="重新点亮已完成的年轮" @click="replay">
        <RotateCcw :size="13" aria-hidden="true" />
      </button>
    </header>

    <div :key="replayKey" class="kbs-replay-scope">
      <div class="kbs-body">
        <div class="kbs-orbit" @mouseleave="hoveredKey = null">
          <svg viewBox="0 0 300 300" role="img" aria-label="内核年轮构建进度">
            <defs>
              <linearGradient id="kbs-ring-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" class="kbs-stop-a" />
                <stop offset="100%" class="kbs-stop-b" />
              </linearGradient>
            </defs>

            <g
              v-for="ring in rings"
              :key="ring.key"
              :class="{
                complete: ring.complete,
                current: ring.current,
                unlocked: ring.unlocked,
                locked: !ring.unlocked,
                final: ring.key === 'final',
                hovered: activeKey === ring.key,
                active: selectedKey === ring.key,
              }"
              :style="{ '--ring-index': String(ring.index) }"
              tabindex="0"
              @mouseenter="hoveredKey = ring.key"
              @mouseleave="hoveredKey = null"
              @click="pick(ring.key)"
              @keydown.enter.prevent="pick(ring.key)"
              @keydown.space.prevent="pick(ring.key)"
            >
              <title>{{ ring.label }}</title>
              <circle
                class="kbs-ring-base"
                cx="150"
                cy="150"
                :r="ring.radius"
                :stroke-width="ring.width"
                pathLength="100"
              />
              <circle
                class="kbs-ring-fill"
                cx="150"
                cy="150"
                :r="ring.radius"
                :stroke-width="ring.width"
                pathLength="100"
              />
            </g>

            <circle
              class="kbs-progress"
              cx="150"
              cy="150"
              r="146"
              pathLength="100"
              :stroke-dasharray="`${progressPercent} ${100 - progressPercent}`"
            />
          </svg>

          <span class="kbs-ray" aria-hidden="true" />
          <span class="kbs-core"><Cpu :size="22" aria-hidden="true" /></span>
          <span v-if="showSprout" class="kbs-sprout"><Leaf :size="22" aria-hidden="true" /></span>
        </div>

        <div class="kbs-side">
          <div class="kbs-side-count">
            <strong>{{ completedCount }}</strong>
            <span>/ {{ tutorLabs.length }} 圈年轮</span>
          </div>
          <p class="kbs-current">{{ displayLabel }}</p>
          <div class="kbs-track" aria-hidden="true">
            <span :style="{ width: `${progressPercent}%` }" />
          </div>
          <p class="kbs-hint">悬停或点击年轮，这里会显示对应实验</p>
        </div>
      </div>
    </div>

    <transition name="kbs-boot">
      <p v-if="allComplete" class="kbs-boot">
        <Rocket :size="15" aria-hidden="true" />
        内核已启动，可以进入期末探索任务。
      </p>
    </transition>
  </div>
</template>

<style scoped>
.kbs {
  padding: 0 var(--ws-space-6) var(--ws-space-3);
}

.kbs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-2);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.kbs-title {
  color: var(--ws-accent);
  font-weight: var(--ws-weight-bold);
  letter-spacing: 0;
}

.kbs-head strong {
  font-variant-numeric: tabular-nums;
}

.kbs-replay {
  display: inline-grid;
  width: var(--ws-control-sm);
  height: var(--ws-control-sm);
  margin-left: auto;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

.kbs-replay:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.kbs-body {
  display: grid;
  grid-template-columns: minmax(0, 250px) minmax(0, 1fr);
  align-items: center;
  gap: var(--ws-space-4);
}

.kbs-orbit {
  position: relative;
  width: min(250px, 100%);
  aspect-ratio: 1;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--ws-line);
  border-radius: 50%;
  background:
    radial-gradient(
      circle at 50% 50%,
      color-mix(in srgb, var(--ws-accent) 7%, transparent),
      transparent 68%
    ),
    var(--ws-surface-soft);
}

.kbs-orbit svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.kbs-orbit :deep(circle) {
  fill: none;
  stroke-linecap: round;
}

.kbs-orbit :deep(.kbs-ring-base) {
  stroke: var(--ws-line);
  opacity: 0.35;
}

.kbs-orbit :deep(.kbs-ring-fill) {
  stroke: var(--ws-line-strong);
  stroke-dasharray: 0 100;
  opacity: 0.4;
  transition:
    stroke 240ms ease,
    opacity 240ms ease,
    filter 240ms ease;
}

.kbs-orbit :deep(g.complete .kbs-ring-fill) {
  stroke: url(#kbs-ring-fill);
  opacity: 1;
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--ws-accent) 55%, transparent));
  animation: kbs-fill-in 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--ring-index) * 130ms);
}

.kbs-orbit :deep(g.current .kbs-ring-fill) {
  stroke: var(--ws-warn);
  stroke-dasharray: 32 68;
  opacity: 1;
  animation: kbs-fill-sweep 2.2s linear infinite;
}

.kbs-orbit :deep(g.unlocked:not(.complete):not(.current) .kbs-ring-fill) {
  stroke: var(--ws-accent);
  stroke-dasharray: 2 98;
  opacity: 0.8;
}

.kbs-orbit :deep(g.final.unlocked .kbs-ring-fill) {
  stroke: var(--ws-ok);
  stroke-dasharray: 100 0;
  opacity: 1;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--ws-ok) 60%, transparent));
  animation: kbs-fill-in 520ms ease both;
  animation-delay: 900ms;
}

.kbs-orbit :deep(g.locked) {
  opacity: 0.6;
}

.kbs-orbit :deep(g) {
  cursor: pointer;
  outline: none;
}

.kbs-orbit :deep(g:focus-visible) {
  filter: drop-shadow(0 0 5px var(--ws-accent));
}

.kbs-orbit :deep(g.hovered .kbs-ring-fill),
.kbs-orbit :deep(g.active .kbs-ring-fill) {
  stroke: var(--ws-warn);
  stroke-width: 15;
  opacity: 1;
  filter: drop-shadow(0 0 14px color-mix(in srgb, var(--ws-warn) 80%, transparent));
  transform: scale(1.07);
  transform-origin: 150px 150px;
}

.kbs-orbit :deep(g.hovered.locked),
.kbs-orbit :deep(g.active.locked) {
  opacity: 0.9;
}

.kbs-stop-a {
  stop-color: var(--ws-accent);
}

.kbs-stop-b {
  stop-color: var(--ws-ok);
}

@keyframes kbs-fill-in {
  from {
    stroke-dasharray: 0 100;
    opacity: 0;
  }
  to {
    stroke-dasharray: 100 0;
    opacity: 1;
  }
}

@keyframes kbs-fill-sweep {
  to {
    stroke-dashoffset: -100;
  }
}

.kbs-progress {
  stroke: var(--ws-ok);
  stroke-width: 3;
  opacity: 0.8;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--ws-ok) 55%, transparent));
  transition: stroke-dasharray 520ms cubic-bezier(0.22, 1, 0.36, 1);
  transform: rotate(-90deg);
  transform-origin: 150px 150px;
}

.kbs-ray {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0 64%,
    color-mix(in srgb, var(--ws-accent) 40%, transparent) 82%,
    transparent 100%
  );
  opacity: 0.5;
  pointer-events: none;
  animation: kbs-spin 6s linear infinite;
}

@keyframes kbs-spin {
  to {
    transform: rotate(360deg);
  }
}

.kbs-core {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  width: 38px;
  height: 38px;
  color: var(--ws-accent-contrast);
  border-radius: var(--ws-radius-full);
  background: var(--ws-accent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--ws-accent) 65%, transparent);
  place-items: center;
  transform: translate(-50%, -50%);
}

.kbs.booted .kbs-core {
  animation: kbs-core-boot 1.6s ease-in-out infinite;
}

@keyframes kbs-core-boot {
  0%,
  100% {
    box-shadow: 0 0 14px color-mix(in srgb, var(--ws-accent) 55%, transparent);
  }
  50% {
    box-shadow: 0 0 28px color-mix(in srgb, var(--ws-ok) 70%, transparent);
  }
}

.kbs-sprout {
  position: absolute;
  top: 4px;
  left: 50%;
  display: grid;
  color: var(--ws-ok);
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--ws-ok) 65%, transparent));
  place-items: center;
  transform: translateX(-50%) rotate(180deg);
  transform-origin: 50% 100%;
  animation: kbs-sprout 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes kbs-sprout {
  from {
    opacity: 0;
    transform: translateX(-50%) rotate(180deg) scale(0.4);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) rotate(180deg) scale(1);
  }
}

.kbs-side {
  display: grid;
  gap: var(--ws-space-2);
  min-width: 0;
}

.kbs-side-count {
  display: flex;
  align-items: baseline;
  gap: var(--ws-space-1);
}

.kbs-side-count strong {
  color: var(--ws-accent);
  font-size: var(--ws-text-xl);
  font-variant-numeric: tabular-nums;
}

.kbs-side-count span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.kbs-current {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.kbs-track {
  height: 6px;
  overflow: hidden;
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface-alt);
}

.kbs-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ws-accent), var(--ws-ok));
  box-shadow: 0 0 8px color-mix(in srgb, var(--ws-ok) 55%, transparent);
  transition: width 520ms cubic-bezier(0.22, 1, 0.36, 1);
}

.kbs-hint {
  margin: 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.kbs-boot {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  margin: var(--ws-space-2) 0 0;
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ok);
  border: 1px solid color-mix(in srgb, var(--ws-ok) 45%, transparent);
  border-radius: var(--ws-radius-md);
  background: color-mix(in srgb, var(--ws-ok) 9%, var(--ws-surface));
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.kbs-boot-enter-active,
.kbs-boot-leave-active {
  transition:
    opacity 300ms ease,
    transform 300ms ease;
}

.kbs-boot-enter-from,
.kbs-boot-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 860px) {
  .kbs {
    padding-inline: var(--ws-space-4);
  }

  .kbs-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .kbs-orbit {
    width: min(220px, 72vw);
  }
}
</style>
