<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Download,
  LockKeyhole,
  Play,
} from 'lucide-vue-next'
import {
  buildLabJourney,
  exportEventsAsJsonl,
  getTutorLab,
  loadEvents,
  recommendedLabId,
  tutorLabs,
  type LearningEvent,
} from '../tutor-model'

/**
 * 引导式学习的入口页。
 * 工作台本身在 /learn/labN，这一页只负责「我现在该进哪一层」和成长档案总览。
 */
const events = ref<LearningEvent[]>([])
const mounted = ref(false)

const journey = computed(() => buildLabJourney(events.value))
const completedCount = computed(() => journey.value.filter((item) => item.completed).length)
const progress = computed(() => Math.round((completedCount.value / tutorLabs.length) * 100))
const nextLab = computed(() => getTutorLab(recommendedLabId(events.value)))
const nextLabStarted = computed(
  () => journey.value.find((item) => item.lab.id === nextLab.value.id)?.started,
)

function exportGrowth() {
  exportEventsAsJsonl(
    events.value,
    `os-lab-growth-record-${new Date().toISOString().slice(0, 10)}.jsonl`,
  )
}

onMounted(() => {
  events.value = loadEvents()
  mounted.value = true
})
</script>

<template>
  <div class="ws-entry">
    <section class="ws-entry-hero">
      <div>
        <span>引导式学习</span>
        <h2>在实验手册旁边，有一位只提问不代写的导师</h2>
        <p>
          左边是实验正文，右边是 AI 导师。导师知道你正在读哪一节，会顺着你的判断往下追问；
          它不会给你可直接粘贴的完整实现。每一层都要留下一次通过验证和一次学习复盘，
          下一层才会解锁。
        </p>
        <div class="ws-entry-cta">
          <a class="primary" :href="withBase(`/learn/${nextLab.id}`)">
            <Play :size="16" aria-hidden="true" />
            {{ mounted && nextLabStarted ? '继续' : '开始' }}{{ nextLab.label }} · {{ nextLab.systemLayer }}
          </a>
          <button v-if="mounted && events.length" type="button" @click="exportGrowth">
            <Download :size="15" aria-hidden="true" />导出成长档案
          </button>
        </div>
      </div>

      <div class="ws-entry-progress" role="img" :aria-label="`已构建 ${completedCount} / ${tutorLabs.length} 个系统层`">
        <strong>{{ completedCount }}<em>/{{ tutorLabs.length }}</em></strong>
        <span>系统层已构建</span>
        <i><b :style="{ width: `${progress}%` }" /></i>
      </div>
    </section>

    <ol class="ws-entry-list">
      <li
        v-for="item in journey"
        :key="item.lab.id"
        :class="{ complete: item.completed, locked: !item.unlocked }"
      >
        <div class="ws-entry-mark" aria-hidden="true">
          <CheckCircle2 v-if="item.completed" :size="20" />
          <LockKeyhole v-else-if="!item.unlocked" :size="17" />
          <strong v-else>{{ item.index + 1 }}</strong>
        </div>

        <div class="ws-entry-body">
          <h3>
            {{ item.lab.label }} · {{ item.lab.systemLayer }}
            <small>{{ item.status }}</small>
          </h3>
          <p>{{ item.lab.buildOutcome }}</p>
          <p v-if="item.lockReason" class="ws-entry-lock">
            <LockKeyhole :size="13" aria-hidden="true" />{{ item.lockReason }}
          </p>
          <div class="ws-entry-evidence">
            <span :class="{ done: item.passedVerification }">
              <Check v-if="item.passedVerification" :size="13" aria-hidden="true" />
              <Circle v-else :size="10" aria-hidden="true" />运行验证
            </span>
            <span :class="{ done: item.reflected }">
              <Check v-if="item.reflected" :size="13" aria-hidden="true" />
              <Circle v-else :size="10" aria-hidden="true" />学习复盘
            </span>
            <span v-if="item.evidenceCount">{{ item.evidenceCount }} 条成长证据</span>
          </div>
        </div>

        <div class="ws-entry-links">
          <a v-if="item.unlocked" class="primary" :href="withBase(`/learn/${item.lab.id}`)">
            进入工作台<ArrowRight :size="14" aria-hidden="true" />
          </a>
          <a :href="withBase(item.lab.documentRoute)">只读手册</a>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.ws-entry {
  max-width: 960px;
  margin: 0 auto;
}

.ws-entry-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 200px;
  align-items: center;
  gap: var(--ws-space-6);
  padding: var(--ws-space-6);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface-soft);
}

.ws-entry-hero > div:first-child > span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-entry-hero h2 {
  margin: var(--ws-space-2) 0;
  padding: 0;
  border: 0;
  font-size: var(--ws-text-xl);
  line-height: var(--ws-leading-tight);
}

.ws-entry-hero p {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-base);
  line-height: var(--ws-leading-relaxed);
}

.ws-entry-cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-4);
}

.ws-entry-cta a,
.ws-entry-cta button,
.ws-entry-links a {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-2);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-2) var(--ws-space-4);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  text-decoration: none;
  cursor: pointer;
}

.ws-entry-cta a.primary,
.ws-entry-links a.primary {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-entry-cta a.primary:hover,
.ws-entry-links a.primary:hover {
  background: var(--ws-accent-hover);
}

.ws-entry-cta button:hover,
.ws-entry-links a:not(.primary):hover {
  border-color: var(--ws-accent);
}

.ws-entry-progress {
  text-align: center;
}

.ws-entry-progress strong {
  display: block;
  color: var(--ws-accent);
  font-size: 40px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.ws-entry-progress em {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xl);
  font-style: normal;
}

.ws-entry-progress span {
  display: block;
  margin-top: var(--ws-space-2);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.ws-entry-progress i {
  display: block;
  height: 8px;
  margin-top: var(--ws-space-3);
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface);
  overflow: hidden;
}

.ws-entry-progress i b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ws-accent);
}

.ws-entry-list {
  margin: var(--ws-space-6) 0 0;
  padding: 0;
  list-style: none;
}

.ws-entry-list li {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ws-space-3);
  padding: var(--ws-space-4) 0;
  border-bottom: 1px solid var(--ws-line);
}

.ws-entry-list li.locked {
  opacity: 0.72;
}

.ws-entry-mark {
  display: grid;
  width: 34px;
  height: 34px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-full);
  place-items: center;
  font-variant-numeric: tabular-nums;
}

.ws-entry-list li.complete .ws-entry-mark {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-entry-body h3 {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ws-space-2);
  margin: 0;
  padding: 0;
  border: 0;
  font-size: var(--ws-text-lg);
}

.ws-entry-body h3 small {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-medium);
}

.ws-entry-body p {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-entry-lock {
  display: inline-flex !important;
  align-items: center;
  gap: var(--ws-space-1);
  margin-top: var(--ws-space-2) !important;
  padding: 2px var(--ws-space-2);
  color: var(--ws-warn) !important;
  border-radius: var(--ws-radius-sm);
  background: var(--ws-warn-soft);
  font-size: var(--ws-text-xs) !important;
}

.ws-entry-evidence {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-1) var(--ws-space-4);
  margin-top: var(--ws-space-2);
}

.ws-entry-evidence span {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-entry-evidence span.done {
  color: var(--ws-ok);
}

.ws-entry-links {
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-2);
}

@media (max-width: 720px) {
  .ws-entry-hero {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--ws-space-4);
  }

  .ws-entry-list li {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .ws-entry-links {
    grid-column: 2;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
