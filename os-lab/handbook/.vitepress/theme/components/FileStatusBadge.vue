<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
import { computed } from 'vue'
import { FILE_STATUS_META, type FileStatusKind } from '../file-status'

const props = defineProps<{ kind: FileStatusKind }>()

const meta = computed(() => FILE_STATUS_META[props.kind])
</script>

<template>
  <span
    class="ws-file-badge"
    :class="`ws-file-badge--${kind}`"
    :title="meta.label"
    :aria-label="meta.label"
  >
    <Lock v-if="kind === 'generated'" :size="10" aria-hidden="true" />
    <template v-else>{{ meta.badge }}</template>
  </span>
</template>

<style scoped>
.ws-file-badge {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: var(--ws-radius-sm);
  font-size: 10px;
  font-weight: var(--ws-weight-bold);
  line-height: 1;
}

.ws-file-badge--added {
  color: var(--ws-file-added-fg);
  background: var(--ws-file-added-bg);
}

.ws-file-badge--modified {
  color: var(--ws-file-modified-fg);
  background: var(--ws-file-modified-bg);
}

.ws-file-badge--todo {
  color: var(--ws-file-todo-fg);
  background: var(--ws-file-todo-bg);
}

.ws-file-badge--generated {
  color: var(--ws-file-generated-fg);
  background: var(--ws-file-generated-bg);
}

.ws-file-badge--conflict {
  color: var(--ws-file-conflict-fg);
  background: var(--ws-file-conflict-bg);
}
</style>
