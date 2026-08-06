<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArchiveRestore, BookOpen, Check, ChevronRight, Database, FileText, Loader2,
  RefreshCw, Save, Search, ShieldCheck, Trash2, Upload, XCircle,
} from 'lucide-vue-next'
import { authHeaders, loadAuth } from '../tutor-model'

const endpoint = String(import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787').replace(/\/$/, '')
const labs = ['global', ...Array.from({ length: 8 }, (_, index) => `lab${index + 1}`)]
const mobilePanels: Array<'tree' | 'list' | 'detail'> = ['tree', 'list', 'detail']
const auth = loadAuth()

interface SourceVersion {
  id: string
  versionNumber: number
  status: string
  originalFilename: string
  licenseStatus: string
  answerRiskReviewed: boolean
  scopeSuggestions: Array<{ labId: string; confidence: number; reason: string }>
  teacherScopes: string[]
  reviewNote: string
  createdAt: string
}
interface SourceItem {
  id: string
  title: string
  originKind: string
  defaultClass: string
  status: string
  currentVersionId: string | null
  versionNumber: number
  activeChunks: number
  versions?: SourceVersion[]
}
interface ChunkItem {
  id: string
  sourceId: string
  sourceTitle: string
  versionId: string
  ordinal: number
  text: string
  sectionPath: string[]
  contentClass: string
  answerRisk: string
  indexable: boolean
  active: boolean
  charCount: number
  tokenEstimate: number
  labScopes: string[]
}

const sources = ref<SourceItem[]>([])
const labCounts = ref<Record<string, number>>({})
const vectorCount = ref(0)
const vectorModels = ref<Array<{ model: string; dimensions: number; chunks: number }>>([])
const chunks = ref<ChunkItem[]>([])
const selectedLab = ref('')
const selectedSourceId = ref('')
const selectedSource = ref<SourceItem | null>(null)
const selectedVersionId = ref('')
const selectedChunk = ref<ChunkItem | null>(null)
const query = ref('')
const showMetadata = ref(false)
const loading = ref(true)
const busy = ref(false)
const notice = ref('')
const loadError = ref('')
const uploadOpen = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const replaceSourceId = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const mobilePanel = ref<'tree' | 'list' | 'detail'>('tree')

const reviewScopes = ref<string[]>([])
const reviewClass = ref('student-safe')
const licenseStatus = ref('authorized')
const answerRiskReviewed = ref(false)
const reviewNote = ref('')
const chunkScopes = ref<string[]>([])
const chunkClass = ref('student-safe')
const chunkRisk = ref('low')
const chunkIndexable = ref(true)
const chunkActive = ref(true)

const currentVersion = computed(() => selectedSource.value?.versions?.find((item) => item.id === selectedVersionId.value) || null)
const pendingCount = computed(() => sources.value.filter((source) => source.status === 'pending-review').length)

async function api(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${endpoint}${pathname}`, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 404 && pathname.startsWith('/teacher/knowledge')) {
      throw new Error('当前 Tutor Server 尚未加载知识库接口，请重启 npm run tutor 后重试。')
    }
    throw new Error(payload?.error || `服务返回 ${response.status}`)
  }
  return payload
}

function labelLab(labId: string) {
  return labId === 'global' ? '公共知识' : labId.replace('lab', 'Lab ')
}

function statusLabel(status: string) {
  return ({ 'pending-review': '待审核', published: '已发布', superseded: '旧版本', disabled: '已停用', failed: '失败' } as Record<string, string>)[status] || status
}

async function loadTree() {
  const payload = await api('/teacher/knowledge/tree')
  sources.value = payload.tree?.sources || []
  labCounts.value = Object.fromEntries((payload.tree?.labs || []).map((item: { labId: string; chunks: number }) => [item.labId, item.chunks]))
  vectorCount.value = Number(payload.stats?.embeddings || 0)
  vectorModels.value = payload.stats?.embeddingModels || []
}

async function loadChunks() {
  const params = new URLSearchParams({
    includeInactive: selectedVersionId.value ? 'true' : 'false',
    retrievableOnly: showMetadata.value ? 'false' : 'true',
    limit: '200',
  })
  if (selectedLab.value) params.set('labId', selectedLab.value)
  if (selectedSourceId.value) params.set('sourceId', selectedSourceId.value)
  if (selectedVersionId.value) params.set('versionId', selectedVersionId.value)
  if (query.value.trim()) params.set('q', query.value.trim())
  const payload = await api(`/teacher/knowledge/chunks?${params}`)
  chunks.value = payload.chunks || []
  if (!chunks.value.some((item) => item.id === selectedChunk.value?.id)) {
    const first = chunks.value[0] || null
    selectedChunk.value = first
    if (first) syncChunkEditor(first)
  }
}

async function loadSource(sourceId: string) {
  selectedSourceId.value = sourceId
  const payload = await api(`/teacher/knowledge/source?id=${encodeURIComponent(sourceId)}`)
  selectedSource.value = payload.source
  selectedVersionId.value = payload.source.versions?.[0]?.id || ''
  syncReview()
  await loadChunks()
  mobilePanel.value = 'list'
}

function clearSource() {
  selectedSourceId.value = ''
  selectedSource.value = null
  selectedVersionId.value = ''
  selectedChunk.value = null
  mobilePanel.value = 'list'
  void loadChunksVisible()
}

function syncReview() {
  const version = currentVersion.value
  if (!version) return
  reviewScopes.value = version.teacherScopes?.length
    ? [...version.teacherScopes]
    : version.scopeSuggestions?.map((item) => item.labId) || []
  reviewClass.value = selectedSource.value?.defaultClass === 'teacher-only' ? 'student-safe' : selectedSource.value?.defaultClass || 'student-safe'
  licenseStatus.value = version.licenseStatus === 'unreviewed' ? 'authorized' : version.licenseStatus
  answerRiskReviewed.value = version.answerRiskReviewed
  reviewNote.value = version.reviewNote || ''
}

function selectChunk(chunk: ChunkItem) {
  selectedChunk.value = chunk
  syncChunkEditor(chunk)
  mobilePanel.value = 'detail'
}

function syncChunkEditor(chunk: ChunkItem) {
  chunkScopes.value = [...chunk.labScopes]
  chunkClass.value = chunk.contentClass
  chunkRisk.value = chunk.answerRisk
  chunkIndexable.value = chunk.indexable
  chunkActive.value = chunk.active
}

async function loadChunksVisible() {
  try {
    await loadChunks()
    loadError.value = ''
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '读取知识内容失败'
    notice.value = loadError.value
    chunks.value = []
    selectedChunk.value = null
  }
}

async function refresh(message = '') {
  loading.value = true
  notice.value = ''
  loadError.value = ''
  try {
    await loadTree()
    if (selectedSourceId.value) await loadSource(selectedSourceId.value)
    await loadChunks()
    if (message) notice.value = message
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载知识库失败'
    notice.value = loadError.value
  } finally {
    loading.value = false
  }
}

async function uploadKnowledge() {
  if (!uploadFile.value || busy.value) return
  busy.value = true
  notice.value = '正在规范化并分块，较大的 PDF 可能需要一些时间…'
  try {
    const file = uploadFile.value
    const payload = await api('/teacher/knowledge/sources', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Knowledge-Filename': encodeURIComponent(file.name),
        'X-Knowledge-Title': encodeURIComponent(uploadTitle.value.trim() || file.name.replace(/\.[^.]+$/, '')),
        ...(replaceSourceId.value ? { 'X-Knowledge-Source-Id': replaceSourceId.value } : {}),
      },
      body: file,
    })
    uploadOpen.value = false
    uploadFile.value = null
    uploadTitle.value = ''
    replaceSourceId.value = ''
    selectedSourceId.value = payload.upload.sourceId
    await refresh('已生成待审核版本；确认范围、权限和风险后才能发布。')
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '上传处理失败'
  } finally {
    busy.value = false
  }
}

function onFilePick(event: Event) {
  uploadFile.value = (event.target as HTMLInputElement).files?.[0] || null
}

async function reviewVersion() {
  if (!selectedSource.value || !currentVersion.value || busy.value) return
  busy.value = true
  try {
    await api('/teacher/knowledge/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: selectedSource.value.id, versionId: currentVersion.value.id,
        labScopes: reviewScopes.value, contentClass: reviewClass.value,
        licenseStatus: licenseStatus.value, answerRiskReviewed: answerRiskReviewed.value,
        note: reviewNote.value,
      }),
    })
    await refresh('审核设置已保存，内容仍未进入导师检索。')
  } catch (error) { notice.value = error instanceof Error ? error.message : '保存审核失败' }
  finally { busy.value = false }
}

async function versionAction(action: 'publish' | 'rollback') {
  if (!selectedSource.value || !currentVersion.value || busy.value) return
  const text = action === 'publish' ? '发布后学生导师即可检索该版本，确定发布？' : '确定将该旧版本恢复为当前版本？'
  if (!window.confirm(text)) return
  busy.value = true
  try {
    await api(`/teacher/knowledge/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: selectedSource.value.id, versionId: currentVersion.value.id }),
    })
    await refresh(action === 'publish' ? '版本已发布并写入检索索引。' : '已回滚并重建当前检索索引。')
  } catch (error) { notice.value = error instanceof Error ? error.message : '版本操作失败' }
  finally { busy.value = false }
}

async function disableSource() {
  if (!selectedSource.value || busy.value || !window.confirm('停用后该知识源会立即退出导师检索，确定继续？')) return
  busy.value = true
  try {
    await api('/teacher/knowledge/disable', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: selectedSource.value.id, note: '教师从知识库工作台停用' }),
    })
    await refresh('知识源已停用。')
  } catch (error) { notice.value = error instanceof Error ? error.message : '停用失败' }
  finally { busy.value = false }
}

async function saveChunk() {
  if (!selectedChunk.value || busy.value) return
  busy.value = true
  try {
    const payload = await api('/teacher/knowledge/chunk', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chunkId: selectedChunk.value.id, labScopes: chunkScopes.value,
        contentClass: chunkClass.value, answerRisk: chunkRisk.value,
        indexable: chunkIndexable.value, active: chunkActive.value,
        note: '教师在知识库工作台调整',
      }),
    })
    selectChunk(payload.chunk)
    await loadTree()
    await loadChunks()
    notice.value = '知识块设置已保存并同步索引。'
  } catch (error) { notice.value = error instanceof Error ? error.message : '保存知识块失败' }
  finally { busy.value = false }
}

async function removeChunk() {
  const chunk = selectedChunk.value
  if (!chunk || busy.value || !window.confirm('移除后该知识块会立即退出导师检索。审计记录和原始版本仍会保留，确定继续？')) return
  busy.value = true
  try {
    await api(`/teacher/knowledge/chunk?id=${encodeURIComponent(chunk.id)}`, { method: 'DELETE' })
    selectedChunk.value = null
    await loadTree()
    await loadChunks()
    notice.value = showMetadata.value ? '知识块已移除；当前开启了元数据显示，因此仍可看到灰色审计记录。' : '知识块已移除并退出导师检索。'
  } catch (error) { notice.value = error instanceof Error ? error.message : '移除知识块失败' }
  finally { busy.value = false }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch([query, selectedLab, selectedVersionId, showMetadata], () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void loadChunksVisible() }, 220)
})
watch(currentVersion, syncReview)

onMounted(() => {
  if (auth?.role !== 'teacher') notice.value = '此页面需要教师账号。'
  void refresh()
})
</script>

<template>
  <main class="km">
    <header class="km-topbar">
      <div class="km-title"><Database :size="20" aria-hidden="true" /><strong>知识库工作台</strong><span>{{ sources.length }} 个来源 · {{ pendingCount }} 个待审核 · {{ vectorCount }} 个向量</span></div>
      <div class="km-actions">
        <label class="km-search"><Search :size="15" aria-hidden="true" /><input v-model="query" type="search" placeholder="检索章节、概念或正文" /></label>
        <label class="metadata-toggle" title="显示未进入导师检索的配置、旧版本和高风险内容"><input v-model="showMetadata" type="checkbox" />显示元数据</label>
        <button class="icon-button" type="button" title="刷新知识库" :disabled="loading" @click="refresh()"><RefreshCw :size="16" /></button>
        <button class="primary-button" type="button" @click="uploadOpen = true"><Upload :size="16" />上传知识</button>
      </div>
    </header>

    <nav class="km-mobile-tabs" aria-label="知识库面板">
      <button v-for="panel in mobilePanels" :key="panel" :class="{ active: mobilePanel === panel }" @click="mobilePanel = panel">
        {{ panel === 'tree' ? '知识树' : panel === 'list' ? '内容' : '详情' }}
      </button>
    </nav>

    <p v-if="notice" class="km-notice">{{ notice }}</p>
    <div v-if="loading" class="km-loading"><Loader2 class="spin" :size="18" />正在读取知识库…</div>

    <div v-if="loadError" class="km-service-error" role="alert">
      <Database :size="26" aria-hidden="true" />
      <div><strong>知识内容暂时不可用</strong><p>{{ loadError }}</p></div>
      <button type="button" @click="refresh()"><RefreshCw :size="15" />重新连接</button>
    </div>

    <div v-else class="km-grid">
      <aside class="km-tree" :class="{ 'mobile-hidden': mobilePanel !== 'tree' }">
        <section>
          <h2>知识范围</h2>
          <button :class="{ selected: !selectedLab }" @click="selectedLab = ''; mobilePanel = 'list'">
            <BookOpen :size="15" /><span>全部范围</span><small>{{ Object.values(labCounts).reduce((a, b) => a + b, 0) }}</small>
          </button>
          <button v-for="lab in labs" :key="lab" :class="{ selected: selectedLab === lab }" @click="selectedLab = lab; mobilePanel = 'list'">
            <ChevronRight :size="14" /><span>{{ labelLab(lab) }}</span><small>{{ labCounts[lab] || 0 }}</small>
          </button>
        </section>
        <section>
          <h2>知识来源</h2>
          <button :class="{ selected: !selectedSourceId }" @click="clearSource">
            <Database :size="15" /><span><b>全部来源</b><em>平台与教师资料</em></span><small>{{ sources.length }}</small>
          </button>
          <button v-for="source in sources" :key="source.id" :class="{ selected: selectedSourceId === source.id }" @click="loadSource(source.id)">
            <FileText :size="15" /><span><b>{{ source.title }}</b><em>{{ statusLabel(source.status) }} · v{{ source.versionNumber || 0 }}</em></span><small>{{ source.activeChunks }}</small>
          </button>
        </section>
      </aside>

      <section class="km-list" :class="{ 'mobile-hidden': mobilePanel !== 'list' }">
        <header><div><h2>知识内容</h2><p>{{ selectedLab ? labelLab(selectedLab) : '全部范围' }} · {{ chunks.length }} 个 Chunk</p></div></header>
        <div v-if="selectedSource?.versions?.length" class="version-strip">
          <label>版本<select v-model="selectedVersionId"><option v-for="version in selectedSource.versions" :key="version.id" :value="version.id">v{{ version.versionNumber }} · {{ statusLabel(version.status) }}</option></select></label>
        </div>
        <button v-for="chunk in chunks" :key="chunk.id" class="chunk-row" :class="{ selected: selectedChunk?.id === chunk.id, muted: !chunk.active }" @click="selectChunk(chunk)">
          <span class="chunk-index">{{ String(chunk.ordinal + 1).padStart(3, '0') }}</span>
          <span class="chunk-summary"><strong>{{ chunk.sectionPath.join(' / ') || '未标章节' }}</strong><span>{{ chunk.text.slice(0, 110) }}</span><small>{{ chunk.labScopes.map(labelLab).join('、') }} · {{ chunk.contentClass }} · {{ chunk.tokenEstimate }} tokens</small></span>
        </button>
        <div v-if="!chunks.length" class="empty">当前筛选没有知识块。上传材料或更换范围后再查看。</div>
      </section>

      <aside class="km-detail" :class="{ 'mobile-hidden': mobilePanel !== 'detail' }">
        <section v-if="selectedSource && currentVersion" class="review-panel">
          <header><div><h2>版本审核</h2><p>{{ selectedSource.title }} · v{{ currentVersion.versionNumber }}</p></div><span :data-status="currentVersion.status">{{ statusLabel(currentVersion.status) }}</span></header>
          <div v-if="currentVersion.scopeSuggestions?.length" class="suggestions">
            <strong>自动归属建议</strong>
            <p v-for="item in currentVersion.scopeSuggestions" :key="item.labId">{{ labelLab(item.labId) }} · {{ Math.round(item.confidence * 100) }}%<small>{{ item.reason }}</small></p>
          </div>
          <fieldset><legend>发布范围</legend><label v-for="lab in labs" :key="lab"><input v-model="reviewScopes" type="checkbox" :value="lab" />{{ labelLab(lab) }}</label></fieldset>
          <div class="form-grid">
            <label>内容权限<select v-model="reviewClass"><option value="student-safe">student-safe</option><option value="guided-hint">guided-hint</option><option value="teacher-only">teacher-only</option></select></label>
            <label>许可证<select v-model="licenseStatus"><option value="authorized">已获授权</option><option value="public-license">公开许可</option><option value="platform-owned">平台自有</option></select></label>
          </div>
          <label class="check-line"><input v-model="answerRiskReviewed" type="checkbox" />已人工检查答案泄漏风险</label>
          <label>审核说明<textarea v-model="reviewNote" rows="2" placeholder="记录范围判断或风险处理"></textarea></label>
          <div class="button-row">
            <button type="button" :disabled="busy" @click="reviewVersion"><ShieldCheck :size="15" />保存审核</button>
            <button v-if="currentVersion.status === 'pending-review'" class="primary-button" type="button" :disabled="busy" @click="versionAction('publish')"><Check :size="15" />发布</button>
            <button v-if="currentVersion.status === 'superseded' || currentVersion.status === 'disabled'" type="button" :disabled="busy" @click="versionAction('rollback')"><ArchiveRestore :size="15" />回滚到此版本</button>
            <button class="danger-button" type="button" :disabled="busy || selectedSource.status === 'disabled'" @click="disableSource"><XCircle :size="15" />停用来源</button>
          </div>
          <p v-if="vectorModels.length" class="replace-note">向量索引：{{ vectorModels.map((item) => `${item.model} · ${item.chunks} chunks`).join('；') }}</p>
        </section>

        <section v-if="selectedChunk" class="chunk-detail">
          <header><div><h2>Chunk {{ selectedChunk.ordinal + 1 }}</h2><p>{{ selectedChunk.sectionPath.join(' → ') || '未标章节' }}</p></div><code>{{ selectedChunk.id.slice(-20) }}</code></header>
          <div class="chunk-text">{{ selectedChunk.text }}</div>
          <fieldset><legend>Chunk 范围</legend><label v-for="lab in labs" :key="lab"><input v-model="chunkScopes" type="checkbox" :value="lab" />{{ labelLab(lab) }}</label></fieldset>
          <div class="form-grid">
            <label>内容权限<select v-model="chunkClass"><option value="student-safe">student-safe</option><option value="guided-hint">guided-hint</option><option value="teacher-only">teacher-only</option><option value="system-metadata">system-metadata</option></select></label>
            <label>答案风险<select v-model="chunkRisk"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="blocked">blocked</option></select></label>
          </div>
          <div class="check-pair"><label><input v-model="chunkIndexable" type="checkbox" />允许索引</label><label><input v-model="chunkActive" type="checkbox" />当前启用</label></div>
          <div class="button-row">
            <button class="save-button" type="button" :disabled="busy" @click="saveChunk"><Save :size="15" />保存 Chunk 设置</button>
            <button class="danger-button" type="button" :disabled="busy || !selectedChunk.active" @click="removeChunk"><Trash2 :size="15" />移除知识块</button>
          </div>
          <p class="replace-note">正文修改通过上传新版本完成，以保留原始材料、分块结果和审计链。</p>
        </section>
        <div v-else class="empty">从中栏选择一个知识块查看正文与权限。</div>
      </aside>
    </div>

    <div v-if="uploadOpen" class="modal-backdrop" @click.self="uploadOpen = false">
      <form class="upload-dialog" @submit.prevent="uploadKnowledge">
        <header><div><h2>上传课程知识</h2><p>文件会先进入待审核区，不会直接提供给学生导师。</p></div><button class="icon-button" type="button" title="关闭" @click="uploadOpen = false"><XCircle :size="18" /></button></header>
        <label>显示名称<input v-model="uploadTitle" type="text" maxlength="160" placeholder="默认使用文件名" /></label>
        <label>替换已有来源（可选）<select v-model="replaceSourceId"><option value="">创建新来源</option><option v-for="source in sources.filter(item => item.originKind === 'teacher-upload')" :key="source.id" :value="source.id">{{ source.title }}</option></select></label>
        <button class="file-picker" type="button" @click="fileInput?.click()"><Upload :size="18" /><span>{{ uploadFile?.name || '选择 PDF / EPUB / MD / TXT / DOCX' }}</span></button>
        <input ref="fileInput" hidden type="file" accept=".pdf,.epub,.md,.markdown,.txt,.docx" @change="onFilePick" />
        <footer><button type="button" @click="uploadOpen = false">取消</button><button class="primary-button" type="submit" :disabled="!uploadFile || busy"><Loader2 v-if="busy" class="spin" :size="15" /><Upload v-else :size="15" />上传并自动分块</button></footer>
      </form>
    </div>
  </main>
</template>

<style scoped>
.km { height: 100dvh; min-height: 640px; display: flex; flex-direction: column; overflow: hidden; color: var(--vp-c-text-1); background: var(--vp-c-bg); }
.km-topbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 9px 16px; border-bottom: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); }
.km-title,.km-actions,.km-search,.button-row,.check-pair { display: flex; align-items: center; gap: 9px; }
.metadata-toggle { display: flex; align-items: center; gap: 5px; white-space: nowrap; color: var(--vp-c-text-2); font-size: 12px; }
.km-title { min-width: 0; color: var(--vp-c-brand-1); }.km-title strong { color: var(--vp-c-text-1); font-size: 15px; }.km-title span { color: var(--vp-c-text-3); font-size: 12px; }
.km-actions { margin-left: auto; }.km-search { width: min(32vw, 360px); padding: 7px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-3); }
.km-search input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--vp-c-text-1); font-size: 13px; }
button, input, select, textarea { font: inherit; } button { cursor: pointer; }.icon-button,.primary-button,.danger-button,.button-row button,.save-button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); font-size: 12px; font-weight: 650; }
.icon-button { width: 34px; padding: 0; }.primary-button { border-color: #126a73; background: #126a73; color: #fff; }.danger-button { color: var(--vp-c-danger-1); }.save-button { width: 100%; margin-top: 10px; }.button-row button:disabled,button:disabled { opacity: .5; cursor: not-allowed; }
.km-notice { margin: 0; padding: 8px 16px; border-bottom: 1px solid #d6a84b; background: #fff8df; color: #604a1d; font-size: 12px; }.dark .km-notice { background: #332b18; color: #f2d98f; }
.km-loading { position: fixed; z-index: 20; top: 68px; left: 50%; display: flex; gap: 8px; align-items: center; padding: 8px 12px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); box-shadow: var(--vp-shadow-2); font-size: 12px; transform: translateX(-50%); }
.km-service-error { flex: 1; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 24px; color: var(--vp-c-text-2); }.km-service-error strong { color: var(--vp-c-text-1); }.km-service-error p { max-width: 560px; margin: 4px 0 0; font-size: 12px; }.km-service-error button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); font-size: 12px; }
.km-grid { min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(210px, 16vw) minmax(340px, 31vw) minmax(440px, 1fr); }
.km-tree,.km-list,.km-detail { min-width: 0; overflow: auto; }.km-tree,.km-list { border-right: 1px solid var(--vp-c-divider); }.km-tree { padding: 12px 8px; background: var(--vp-c-bg-soft); }
.km-tree section + section { margin-top: 18px; }.km-tree h2,.km-list h2,.km-detail h2 { margin: 0; font-size: 13px; letter-spacing: 0; }.km-tree h2 { padding: 0 8px 6px; color: var(--vp-c-text-3); font-size: 11px; text-transform: uppercase; }
.km-tree button { width: 100%; min-height: 34px; display: grid; grid-template-columns: 18px minmax(0,1fr) auto; align-items: center; gap: 5px; padding: 6px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--vp-c-text-2); text-align: left; }
.km-tree button:hover,.km-tree button.selected { background: var(--vp-c-bg); color: var(--vp-c-brand-1); }.km-tree button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.km-tree button b { display: block; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }.km-tree button em { display: block; color: var(--vp-c-text-3); font-size: 10px; font-style: normal; }.km-tree button small { color: var(--vp-c-text-3); font-variant-numeric: tabular-nums; }
.km-list > header { position: sticky; z-index: 2; top: 0; padding: 13px 14px; border-bottom: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); }.km-list header p,.km-detail header p { margin: 3px 0 0; color: var(--vp-c-text-3); font-size: 11px; }.version-strip { padding: 8px 12px; border-bottom: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft); }.version-strip label { display: flex; align-items: center; gap: 8px; color: var(--vp-c-text-3); font-size: 11px; }.version-strip select { flex: 1; }
.chunk-row { width: 100%; display: grid; grid-template-columns: 36px minmax(0,1fr); gap: 8px; padding: 11px 12px; border: 0; border-bottom: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); color: var(--vp-c-text-1); text-align: left; }.chunk-row:hover,.chunk-row.selected { background: var(--vp-c-brand-soft); }.chunk-row.muted { opacity: .55; }.chunk-index { color: var(--vp-c-text-3); font: 11px/1.4 ui-monospace, monospace; }.chunk-summary { min-width: 0; }.chunk-summary strong,.chunk-summary span,.chunk-summary small { display: block; }.chunk-summary strong { overflow: hidden; color: var(--vp-c-text-1); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.chunk-summary span { display: -webkit-box; margin-top: 4px; overflow: hidden; color: var(--vp-c-text-2); font-size: 11px; line-height: 1.45; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }.chunk-summary small { margin-top: 5px; color: var(--vp-c-text-3); font-size: 10px; }
.km-detail { padding: 14px 16px 40px; }.km-detail section + section { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--vp-c-divider); }.km-detail header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }.km-detail header > span { padding: 3px 7px; border-radius: 4px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-2); font-size: 10px; }.km-detail header > span[data-status="pending-review"] { background: #fff0bd; color: #71530b; }.km-detail code { color: var(--vp-c-text-3); font-size: 10px; }
.suggestions { margin-top: 12px; padding: 9px 10px; border-left: 3px solid #d6a84b; background: var(--vp-c-bg-soft); }.suggestions strong { font-size: 11px; }.suggestions p { margin: 5px 0 0; font-size: 11px; }.suggestions small { display: block; color: var(--vp-c-text-3); }
fieldset { display: flex; flex-wrap: wrap; gap: 5px 10px; margin: 12px 0; padding: 8px 10px 10px; border: 1px solid var(--vp-c-divider); border-radius: 5px; } legend { padding: 0 4px; color: var(--vp-c-text-3); font-size: 10px; } fieldset label,.check-line,.check-pair label { display: flex; align-items: center; gap: 4px; font-size: 11px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }.form-grid label,.review-panel > label,.upload-dialog > label { display: flex; flex-direction: column; gap: 5px; color: var(--vp-c-text-3); font-size: 10px; } select,input[type="text"],textarea { min-height: 32px; padding: 6px 8px; border: 1px solid var(--vp-c-divider); border-radius: 5px; outline: 0; background: var(--vp-c-bg); color: var(--vp-c-text-1); font-size: 12px; } textarea { resize: vertical; }.check-line { margin: 10px 0; }.button-row { flex-wrap: wrap; margin-top: 10px; }
.chunk-text { max-height: 300px; margin-top: 12px; padding: 12px; overflow: auto; border: 1px solid var(--vp-c-divider); border-radius: 5px; background: var(--vp-code-block-bg); font: 11px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }.replace-note { color: var(--vp-c-text-3); font-size: 10px; line-height: 1.5; }.empty { padding: 30px 18px; color: var(--vp-c-text-3); font-size: 12px; text-align: center; }
.modal-backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(0 0 0 / .48); }.upload-dialog { width: min(520px,100%); padding: 18px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); box-shadow: var(--vp-shadow-3); }.upload-dialog header,.upload-dialog footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }.upload-dialog h2 { margin: 0; font-size: 16px; }.upload-dialog p { margin: 3px 0 0; color: var(--vp-c-text-2); font-size: 12px; }.upload-dialog > label { margin-top: 14px; }.file-picker { width: 100%; min-height: 70px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 14px; border: 1px dashed var(--vp-c-brand-1); border-radius: 6px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }.upload-dialog footer { justify-content: flex-end; margin-top: 18px; }.upload-dialog footer > button { min-height: 34px; padding: 7px 12px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg-soft); }
.km-mobile-tabs { display: none; }.spin { animation: spin .9s linear infinite; }@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 820px) { .km { min-height: 560px; }.km-topbar { flex-wrap: wrap; }.km-title span { display: none; }.km-actions { width: 100%; }.km-search { flex: 1; width: auto; }.km-grid { display: block; }.km-tree,.km-list,.km-detail { height: 100%; border-right: 0; }.mobile-hidden { display: none; }.km-mobile-tabs { display: grid; grid-template-columns: repeat(3,1fr); border-bottom: 1px solid var(--vp-c-divider); }.km-mobile-tabs button { min-height: 38px; border: 0; background: var(--vp-c-bg-soft); color: var(--vp-c-text-2); }.km-mobile-tabs button.active { box-shadow: inset 0 -2px var(--vp-c-brand-1); color: var(--vp-c-brand-1); }.form-grid { grid-template-columns: 1fr; } }
</style>
