<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-vue-next'
import { authHeaders, loadAuth, saveAuth, type AuthSession } from '../tutor-model'
import { requestWorkspaceLlmSettings } from '../workspace-nav'

/**
 * 站点顶栏右上角：显示当前登录用户；点击展开账号菜单。
 */
const props = defineProps<{ workspaceSettings?: boolean }>()

const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

const auth = ref<AuthSession | null>(null)
const open = ref(false)
const busy = ref(false)
const root = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref({ top: '0px', right: '0px' })

const label = computed(() => {
  if (!auth.value) return ''
  const role = auth.value.role === 'teacher' ? '教师' : '学生'
  return `${auth.value.username}（${role}）`
})
const showWorkspaceSettings = computed(() => props.workspaceSettings && auth.value?.role !== 'teacher')

function refresh() {
  auth.value = loadAuth()
}

function openWorkspaceSettings() {
  open.value = false
  requestWorkspaceLlmSettings()
}

function toggleMenu() {
  open.value = !open.value
  if (open.value) nextTick(updateMenuPosition)
}

function updateMenuPosition() {
  const trigger = root.value?.querySelector<HTMLElement>('.un-trigger')
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  menuStyle.value = {
    top: `${Math.round(rect.bottom + 8)}px`,
    right: `${Math.max(8, Math.round(window.innerWidth - rect.right))}px`,
  }
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
  const target = event.target as Node
  if (!root.value.contains(target) && !menuRef.value?.contains(target)) open.value = false
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  refresh()
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('storage', refresh)
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('storage', refresh)
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
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
      @click.stop="toggleMenu"
    >
      <UserRound :size="15" aria-hidden="true" />
      <span class="un-name">{{ auth.username }}</span>
      <ChevronDown :size="14" class="un-chevron" :class="{ open }" aria-hidden="true" />
    </button>
    <Teleport to="body">
    <div v-if="open" ref="menuRef" class="un-menu" role="menu" :style="menuStyle" @click.stop>
      <p class="un-meta">{{ label }}</p>
      <button v-if="showWorkspaceSettings" type="button" role="menuitem" class="un-item" @click="openWorkspaceSettings">
        <Settings :size="14" aria-hidden="true" />
        模型设置
      </button>
      <button type="button" role="menuitem" class="un-item" :disabled="busy" @click="logout">
        <LogOut :size="14" aria-hidden="true" />
        {{ busy ? '退出中…' : '退出登录' }}
      </button>
      </div>
    </Teleport>
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
  position: fixed;
  z-index: var(--ws-z-dialog);
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
