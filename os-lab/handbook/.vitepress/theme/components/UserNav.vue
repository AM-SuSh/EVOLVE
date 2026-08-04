<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, LogOut, UserRound } from 'lucide-vue-next'
import { authHeaders, loadAuth, saveAuth, type AuthSession } from '../tutor-model'

/**
 * 站点顶栏右上角：显示当前登录用户；点击展开「退出登录」。
 * 工作台自有顶栏另有账号入口；本组件挂在 VitePress 默认导航上。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

const auth = ref<AuthSession | null>(null)
const open = ref(false)
const busy = ref(false)
const root = ref<HTMLElement | null>(null)

const label = computed(() => {
  if (!auth.value) return ''
  const role = auth.value.role === 'teacher' ? '教师' : '学生'
  return `${auth.value.username}（${role}）`
})

function refresh() {
  auth.value = loadAuth()
}

async function logout() {
  if (busy.value) return
  busy.value = true
  try {
    await fetch(`${endpoint}/auth/logout`, { method: 'POST', headers: authHeaders() })
  } catch {
    /* 服务不可用时仍清本地会话 */
  }
  saveAuth(null)
  auth.value = null
  open.value = false
  busy.value = false
  location.reload()
}

function onDocClick(event: MouseEvent) {
  if (!open.value || !root.value) return
  if (!root.value.contains(event.target as Node)) open.value = false
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  refresh()
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('storage', refresh)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('storage', refresh)
})
</script>

<template>
  <div v-if="auth" ref="root" class="un" aria-label="当前用户">
    <button
      type="button"
      class="un-trigger"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="label"
      @click.stop="open = !open"
    >
      <UserRound :size="15" aria-hidden="true" />
      <span class="un-name">{{ auth.username }}</span>
      <ChevronDown :size="14" class="un-chevron" :class="{ open }" aria-hidden="true" />
    </button>
    <div v-if="open" class="un-menu" role="menu">
      <p class="un-meta">{{ label }}</p>
      <button type="button" role="menuitem" class="un-item" :disabled="busy" @click="logout">
        <LogOut :size="14" aria-hidden="true" />
        {{ busy ? '退出中…' : '退出登录' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.un {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--vp-c-divider);
}

.un-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 160px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.un-trigger:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.un-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.un-chevron {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.un-chevron.open {
  transform: rotate(180deg);
}

.un-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 100;
  min-width: 180px;
  padding: 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.un-meta {
  margin: 0 0 6px;
  padding: 4px 8px;
  color: var(--vp-c-text-3);
  font-size: 12px;
  line-height: 1.4;
}

.un-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.un-item:hover:not(:disabled) {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.un-item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .un-name {
    max-width: 72px;
  }
}
</style>
