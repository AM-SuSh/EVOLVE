<script setup lang="ts">
import { computed } from 'vue'
import {
  describeTutorEvidenceHave,
  describeTutorEvidenceNext,
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

const hintLabel = computed(() => {
  const level = props.tutorState?.hintLevel
  if (!Number.isInteger(level) || Number(level) < 0) return ''
  return `L${level}`
})

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
      </div>
      <div class="ws-evidence-col ws-evidence-col--grow">
        <span class="ws-evidence-label">下一步所需</span>
        <p class="ws-evidence-value next">{{ nextText }}</p>
      </div>
    </div>
    <span v-if="hintLabel" class="ws-evidence-hint" :title="`当前提示层级 ${hintLabel}`">{{ hintLabel }}</span>
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

.ws-evidence-hint {
  flex: 0 0 auto;
  align-self: center;
  min-width: 1.75rem;
  padding: 2px 6px;
  border: 1px solid var(--ws-line);
  border-radius: 4px;
  color: var(--ws-ink-muted);
  background: var(--ws-surface);
  font-family: var(--ws-font-mono, ui-monospace, monospace);
  font-size: 11px;
  text-align: center;
}

@media (max-width: 720px) {
  .ws-evidence-cols {
    flex-direction: column;
    gap: var(--ws-space-2);
  }

  .ws-evidence-sub {
    white-space: normal;
  }
}
</style>
