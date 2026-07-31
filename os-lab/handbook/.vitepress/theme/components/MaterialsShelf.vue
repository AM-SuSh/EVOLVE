<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { BookOpen, ExternalLink, Loader2, Trash2, Upload } from 'lucide-vue-next'
import { authHeaders, loadAuth } from '../tutor-model'

/**
 * 顶栏「学习材料」入口：列出内置 OSTEP + 教师上传材料；
 * 学生自选打开；教师可在同页上传 / 删除（不能删内置）。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

interface MaterialItem {
  id: string
  title: string
  filename: string
  mime: string
  size: number | null
  kind: 'builtin' | 'upload'
  createdAt: string | null
  url: string | null
}

const materials = ref<MaterialItem[]>([])
const loading = ref(true)
const busy = ref(false)
const note = ref('')
const titleDraft = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const auth = loadAuth()
const isTeacher = computed(() => auth?.role === 'teacher')

function formatSize(size: number | null) {
  if (size == null || !Number.isFinite(size)) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function load() {
  loading.value = true
  note.value = ''
  try {
    const response = await fetch(`${endpoint}/materials`, { headers: authHeaders() })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    materials.value = Array.isArray(payload.materials) ? payload.materials : []
  } catch (err) {
    // 导师服务未起时仍给出内置 OSTEP，避免入口空白。
    materials.value = [
      {
        id: 'ostep-zh',
        title: '操作系统导论（OSTEP 中译）',
        filename: 'ostep-zh.pdf',
        mime: 'application/pdf',
        size: null,
        kind: 'builtin',
        createdAt: null,
        url: '/downloads/ostep-zh.pdf',
      },
    ]
    note.value =
      err instanceof Error
        ? `${err.message}（已显示内置学习材料；完整列表需 npm run tutor）`
        : '无法连接导师服务；已显示内置学习材料'
  } finally {
    loading.value = false
  }
}

function openMaterial(item: MaterialItem) {
  if (item.kind === 'builtin' && item.url) {
    window.open(withBase(item.url), '_blank', 'noopener,noreferrer')
    return
  }
  const token = auth?.token || ''
  if (!token) {
    note.value = '请先登录后再打开上传材料'
    return
  }
  const url = `${endpoint}/materials/file?id=${encodeURIComponent(item.id)}&token=${encodeURIComponent(token)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  busy.value = true
  note.value = ''
  try {
    const title = (titleDraft.value.trim() || file.name.replace(/\.[^.]+$/, '') || '未命名材料').slice(0, 120)
    const response = await fetch(`${endpoint}/teacher/materials`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': file.type || 'application/octet-stream',
        'X-Material-Filename': encodeURIComponent(file.name),
        'X-Material-Title': encodeURIComponent(title),
      },
      body: file,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    materials.value = Array.isArray(payload.materials) ? payload.materials : materials.value
    titleDraft.value = ''
    note.value = `已上传：${title}`
  } catch (err) {
    note.value = err instanceof Error ? err.message : '上传失败'
  } finally {
    busy.value = false
  }
}

async function removeMaterial(item: MaterialItem) {
  if (item.kind !== 'upload' || busy.value) return
  if (!window.confirm(`确定删除「${item.title}」？学生端将不再可见。`)) return
  busy.value = true
  note.value = ''
  try {
    const response = await fetch(
      `${endpoint}/teacher/materials?id=${encodeURIComponent(item.id)}`,
      { method: 'DELETE', headers: authHeaders() },
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    materials.value = Array.isArray(payload.materials) ? payload.materials : materials.value
    note.value = `已删除：${item.title}`
  } catch (err) {
    note.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="ms" aria-label="学习材料">
    <header class="ms-head">
      <div>
        <p class="ms-kicker">资源库</p>
        <h1>学习材料</h1>
        <p class="ms-lead">
          内置《操作系统导论》始终可用；教师可在此上传补充材料，学生点开后自由选择阅读。
        </p>
      </div>
    </header>

    <section v-if="isTeacher" class="ms-upload" aria-label="教师上传">
      <h2>上传材料</h2>
      <p>支持 PDF / EPUB / Markdown / TXT / Word，单文件不超过 80 MB。上传后学生在同一页即可看到。</p>
      <div class="ms-upload-row">
        <label class="ms-title">
          <span>显示名称（可选）</span>
          <input v-model="titleDraft" type="text" maxlength="120" placeholder="默认使用文件名" :disabled="busy" />
        </label>
        <button type="button" class="ms-btn primary" :disabled="busy" @click="fileInput?.click()">
          <Upload :size="15" aria-hidden="true" />
          {{ busy ? '处理中…' : '选择文件并上传' }}
        </button>
        <input
          ref="fileInput"
          type="file"
          hidden
          accept=".pdf,.epub,.md,.txt,.doc,.docx,application/pdf"
          @change="onPick"
        />
      </div>
    </section>

    <p v-if="note" class="ms-note">{{ note }}</p>

    <div v-if="loading" class="ms-loading">
      <Loader2 :size="18" class="spin" aria-hidden="true" />
      正在加载材料列表…
    </div>

    <ul v-else class="ms-list" role="list">
      <li v-for="item in materials" :key="item.id" class="ms-card">
        <div class="ms-card-main">
          <span class="ms-icon" aria-hidden="true"><BookOpen :size="18" /></span>
          <div>
            <strong>{{ item.title }}</strong>
            <small>
              <span v-if="item.kind === 'builtin'">内置</span>
              <span v-else>教师上传</span>
              <template v-if="item.filename"> · {{ item.filename }}</template>
              <template v-if="item.size != null"> · {{ formatSize(item.size) }}</template>
            </small>
          </div>
        </div>
        <div class="ms-card-actions">
          <button type="button" class="ms-btn" @click="openMaterial(item)">
            <ExternalLink :size="14" aria-hidden="true" />打开
          </button>
          <button
            v-if="isTeacher && item.kind === 'upload'"
            type="button"
            class="ms-btn danger"
            :disabled="busy"
            title="删除该材料"
            @click="removeMaterial(item)"
          >
            <Trash2 :size="14" aria-hidden="true" />删除
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ms {
  max-width: 720px;
  margin: 0 auto;
  padding: clamp(24px, 4vw, 48px) 20px 64px;
}

.ms-kicker {
  margin: 0 0 6px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.ms-head h1 {
  margin: 0 0 8px;
  font-size: clamp(1.6rem, 3vw, 2rem);
  line-height: 1.25;
}

.ms-lead {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.6;
}

.ms-upload {
  margin-top: 28px;
  padding: 16px 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.ms-upload h2 {
  margin: 0 0 6px;
  font-size: 1rem;
}

.ms-upload > p {
  margin: 0 0 14px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
}

.ms-upload-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}

.ms-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 220px;
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.ms-title input {
  padding: 8px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
}

.ms-note {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-text-1);
  font-size: 13px;
}

.ms-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 28px;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.ms-list {
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ms-card {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
}

.ms-card-main {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}

.ms-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  flex-shrink: 0;
}

.ms-card-main strong {
  display: block;
  font-size: 15px;
  line-height: 1.35;
}

.ms-card-main small {
  display: block;
  margin-top: 4px;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.ms-card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.ms-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.ms-btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.ms-btn.primary {
  border-color: transparent;
  background: var(--vp-c-brand-1);
  color: #fff;
}

.ms-btn.primary:hover:not(:disabled) {
  filter: brightness(1.05);
  color: #fff;
}

.ms-btn.danger:hover:not(:disabled) {
  border-color: var(--vp-c-danger-1, #c23);
  color: var(--vp-c-danger-1, #c23);
}

.ms-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spin {
  animation: ms-spin 0.9s linear infinite;
}

@keyframes ms-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
