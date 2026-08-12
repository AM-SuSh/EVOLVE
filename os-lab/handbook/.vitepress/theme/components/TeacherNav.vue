<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { BookOpenCheck, ClipboardCheck, FlaskConical, LayoutDashboard } from 'lucide-vue-next'
import { loadAuth } from '../tutor-model'

/** 教师登录后，挂入 VitePress 官方顶栏的管理入口。 */
const isTeacher = ref(false)

onMounted(() => {
  isTeacher.value = loadAuth()?.role === 'teacher'
})
</script>

<template>
  <nav v-if="isTeacher" class="tn" aria-label="教师管理">
    <a :href="withBase('/guide/ai-tutor')"><LayoutDashboard :size="15" aria-hidden="true" />教师工作台</a>
    <a :href="withBase('/teacher-review')"><ClipboardCheck :size="15" aria-hidden="true" />实验验收</a>
    <a :href="withBase('/teacher/final-project')"><FlaskConical :size="15" aria-hidden="true" />期末任务</a>
    <a :href="withBase('/teacher/knowledge')"><BookOpenCheck :size="15" aria-hidden="true" />知识库</a>
  </nav>
</template>

<style scoped>
.tn {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--vp-c-divider);
}

.tn a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  color: var(--vp-c-text-2);
  border-radius: 6px;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.tn a:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
</style>
