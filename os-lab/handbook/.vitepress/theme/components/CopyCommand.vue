<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  command: string
  label?: string
}>()

const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.command)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    /* fallback for non-secure context */
    const ta = document.createElement('textarea')
    ta.value = props.command
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}
</script>

<template>
  <div class="copy-command">
    <button type="button" class="copy-btn" :class="{ copied }" @click="copy">
      {{ copied ? '已复制' : (label ?? '复制') }}
    </button>
    <pre><code>{{ command }}</code></pre>
  </div>
</template>
