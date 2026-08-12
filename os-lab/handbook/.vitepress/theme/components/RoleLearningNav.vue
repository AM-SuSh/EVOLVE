<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, withBase } from 'vitepress'
import { loadAuth } from '../tutor-model'

defineProps<{ screenMenu?: boolean }>()

const route = useRoute()
const isTeacher = ref(false)
const closeScreen = inject<() => void>('close-screen', () => undefined)
const target = withBase('/guide/ai-tutor')

const label = computed(() => (isTeacher.value ? '教师工作台' : '引导式学习'))
const active = computed(() => {
  const path = route.path.replace(/\.html$/, '')
  return path === target || path.startsWith(withBase('/learn/'))
})

function refreshRole() {
  isTeacher.value = loadAuth()?.role === 'teacher'
}

onMounted(() => {
  refreshRole()
  window.addEventListener('storage', refreshRole)
})

onBeforeUnmount(() => window.removeEventListener('storage', refreshRole))
</script>

<template>
  <a
    class="role-learning-nav"
    :class="{ active, 'screen-menu': screenMenu }"
    :href="target"
    :aria-current="active ? 'page' : undefined"
    @click="closeScreen"
  >
    {{ label }}
  </a>
</template>

<style scoped>
.role-learning-nav {
  display: flex;
  align-items: center;
  padding: 0 12px;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 500;
  line-height: var(--vp-nav-height);
  text-decoration: none;
  transition: color 0.25s;
}

.role-learning-nav:hover,
.role-learning-nav.active {
  color: var(--vp-c-brand-1);
}

.role-learning-nav.screen-menu {
  display: block;
  padding: 12px 0 11px;
  border-bottom: 1px solid var(--vp-c-divider);
  line-height: 24px;
}
</style>
