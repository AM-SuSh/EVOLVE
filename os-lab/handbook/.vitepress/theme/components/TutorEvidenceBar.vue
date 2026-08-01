<script setup lang="ts">
import { computed } from 'vue'
import { ShieldAlert } from 'lucide-vue-next'
import {
  describeTutorEvidenceHave,
  describeTutorEvidenceNext,
  describeTutorHintLevel,
  isTutorRefused,
  tutorEvidenceChips,
  tutorHintDetail,
  tutorStageMeta,
  type TutorStageId,
  type TutorState,
} from '../tutor-model'

/**
 * 导师证据条：消费 chat 回传的 tutorState。
 * 无服务端状态时用可信空态，不造假 run / 断言。
 */
const props = defineProps<{
  tutorState: TutorState | null
  fallbackStage: TutorStageId
}>()

const emit = defineEmits<{
  (event: 'open-evidence', ref: string): void
}>()

const stageMeta = computed(() =>
  tutorStageMeta(props.tutorState?.stage || props.fallbackStage),
)

const haveText = computed(() => {
  if (!props.tutorState) return '还没有服务端证据摘要；先提问或跑一次可信验证'
  return describeTutorEvidenceHave(props.tutorState)
})

const nextText = computed(() => {
  if (!props.tutorState) return '向导师描述判断或观察，获取门控后的下一步'
  return describeTutorEvidenceNext(props.tutorState)
})

const hintLabel = computed(() => describeTutorHintLevel(props.tutorState?.hintLevel))
const hintTitle = computed(() => tutorHintDetail(props.tutorState?.hintLevel))
const refused = computed(() => isTutorRefused(props.tutorState))
const chips = computed(() => tutorEvidenceChips(props.tutorState))
const hasServerState = computed(() => Boolean(props.tutorState))
</script>

<template>
  <div
    class="ws-evidence-bar"
    role="status"
    :aria-label="`导师证据：阶段 ${stageMeta.shortTitle}；${haveText}；下一步 ${nextText}`"
  >
    <div class="ws-evidence-cols">
      <div class="ws-evidence-col">
        <span class="ws-evidence-label">阶段</span>
        <strong class="ws-evidence-value" :title="stageMeta.title">{{ stageMeta.shortTitle }}</strong>
        <span class="ws-evidence-sub">{{ stageMeta.title }}</span>
      </div>
      <div class="ws-evidence-col ws-evidence-col--grow">
        <span class="ws-evidence-label">已有证据</span>
        <p class="ws-evidence-value" :class="{ faint: !hasServerState }">{{ haveText }}</p>
        <div v-if="chips.length" class="ws-evidence-chips">
          <button
            v-for="chip in chips"
            :key="chip.ref"
            type="button"
            class="ws-evidence-chip"
            :data-kind="chip.kind"
            :title="`打开 ${chip.ref}`"
            @click="emit('open-evidence', chip.ref)"
          >
            {{ chip.label }}
          </button>
        </div>
      </div>
      <div class="ws-evidence-col ws-evidence-col--grow">
        <span class="ws-evidence-label">下一步所需</span>
        <p class="ws-evidence-value next">{{ nextText }}</p>
      </div>
    </div>
    <div class="ws-evidence-badges">
      <span
        v-if="refused"
        class="ws-evidence-refuse"
        title="请求被护栏拦截：不提供完整实现，改为引导判断或观察"
      >
        <ShieldAlert :size="12" aria-hidden="true" />拒答
      </span>
      <span v-if="hintLabel" class="ws-evidence-hint" :title="hintTitle || `当前提示层级 ${hintLabel}`">
        {{ hintLabel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.ws-evidence-bar {
  display: flex;
  align-items: flex-start;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
}

.ws-evidence-cols {
  display: flex;
  flex: 1 1 auto;
  gap: var(--ws-space-3);
  min-width: 0;
}

.ws-evidence-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 0 0 auto;
}

.ws-evidence-col--grow {
  flex: 1 1 0;
}

.ws-evidence-label {
  color: var(--ws-ink-faint);
  letter-spacing: 0.02em;
  text-transform: none;
  font-weight: 500;
}

.ws-evidence-value {
  margin: 0;
  color: var(--ws-ink);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
  font-weight: 600;
}

.ws-evidence-value.faint {
  font-weight: 400;
  color: var(--ws-ink-muted);
}

.ws-evidence-value.next {
  font-weight: 500;
  color: var(--ws-ink);
}

.ws-evidence-sub {
  color: var(--ws-ink-faint);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}

.ws-evidence-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.ws-evidence-chip {
  min-height: 22px;
  padding: 1px 6px;
  color: var(--ws-accent);
  border: 1px solid var(--ws-line);
  border-radius: 4px;
  background: var(--ws-surface);
  font: inherit;
  font-family: var(--ws-font-mono, ui-monospace, monospace);
  font-size: 11px;
  cursor: pointer;
}

.ws-evidence-chip:hover {
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-evidence-badges {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  align-self: center;
}

.ws-evidence-hint {
  min-width: 1.75rem;
  padding: 2px 6px;
  border: 1px solid var(--ws-line);
  border-radius: 4px;
  color: var(--ws-ink-muted);
  background: var(--ws-surface);
  font-family: var(--ws-font-mono, ui-monospace, monospace);
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
}

.ws-evidence-refuse {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  color: var(--ws-warn);
  border: 1px solid var(--ws-warn);
  border-radius: 4px;
  background: var(--ws-warn-soft);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .ws-evidence-cols {
    flex-direction: column;
    gap: var(--ws-space-2);
  }

  .ws-evidence-sub {
    white-space: normal;
  }

  .ws-evidence-badges {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }
}
</style>
