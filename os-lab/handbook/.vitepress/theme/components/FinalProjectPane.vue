<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import {
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  ListChecks,
  LockKeyhole,
  Rocket,
  ScrollText,
  SquareTerminal,
} from 'lucide-vue-next'
import { finalProjectKindLabel, type FinalProjectAccess } from '../tutor-model'

const props = defineProps<{
  endpoint: string
  project: FinalProjectAccess | null
}>()

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const defaultLinkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options)
}

const projectReady = computed(() => props.project?.unlocked === true)
const title = computed(() => props.project?.title?.trim() || '期末探索任务')
const kindLabel = computed(() => props.project?.kindLabel || finalProjectKindLabel(props.project?.kind))
const descriptionHtml = computed(() => markdown.render(props.project?.description || ''))
const mechanisms = computed(() => (props.project?.mechanisms || []).map((item) => item.trim()).filter(Boolean))
const rubric = computed(() => (props.project?.rubric || []).map((item) => item.trim()).filter(Boolean))
const verificationCommand = computed(() => props.project?.verificationCommand?.trim() || '')
const updatedAt = computed(() => formatDate(props.project?.updatedAt))
const lockReason = computed(() =>
  props.project?.reason || '完成 Lab1-8 后，老师发布的期末探索任务会显示在这里。',
)

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="ws-final-pane" aria-label="期末探索任务">
    <div v-if="!projectReady" class="ws-final-state" role="status">
      <LockKeyhole :size="26" aria-hidden="true" />
      <strong>期末探索任务尚未解锁</strong>
      <span>{{ lockReason }}</span>
    </div>

    <div v-else class="ws-final-scroll">
      <article class="ws-final-brief">
        <header class="ws-final-hero">
          <span class="ws-final-kicker"><Rocket :size="14" aria-hidden="true" />Lab9 探索节点</span>
          <h1>{{ title }}</h1>
          <p>
            <FlaskConical :size="15" aria-hidden="true" />
            {{ kindLabel }}
          </p>
          <small v-if="updatedAt">更新于 {{ updatedAt }}</small>
        </header>

        <section class="ws-final-section">
          <h2><ScrollText :size="16" aria-hidden="true" />任务书</h2>
          <div v-if="descriptionHtml" class="ws-final-doc vp-doc" v-html="descriptionHtml" />
          <p v-else class="ws-final-muted">老师还没有填写任务说明。</p>
        </section>

        <section v-if="mechanisms.length" class="ws-final-section">
          <h2><Gauge :size="16" aria-hidden="true" />必须用到的系统机制</h2>
          <ul class="ws-final-chips">
            <li v-for="item in mechanisms" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section v-if="verificationCommand" class="ws-final-section">
          <h2><SquareTerminal :size="16" aria-hidden="true" />验证命令</h2>
          <pre class="ws-final-command"><code>{{ verificationCommand }}</code></pre>
        </section>

        <section v-if="rubric.length" class="ws-final-section">
          <h2><ClipboardCheck :size="16" aria-hidden="true" />评分维度</h2>
          <ol class="ws-final-rubric">
            <li v-for="item in rubric" :key="item">
              <CheckCircle2 :size="15" aria-hidden="true" />
              <span>{{ item }}</span>
            </li>
          </ol>
        </section>

        <footer class="ws-final-footer">
          <ListChecks :size="15" aria-hidden="true" />
          <span>围绕右侧 Lab8 工作区完成代码、运行验证，并在报告中留下证据与反思。</span>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
.ws-final-pane {
  display: grid;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-final-scroll {
  min-width: 0;
  min-height: 0;
  padding: var(--ws-space-6) var(--ws-space-6) var(--ws-space-8);
  overflow-y: auto;
}

.ws-final-brief {
  display: grid;
  gap: var(--ws-space-5);
  max-width: var(--ws-reading-measure);
  margin: 0 auto;
}

.ws-final-hero {
  display: grid;
  gap: var(--ws-space-2);
  padding-bottom: var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
}

.ws-final-kicker,
.ws-final-hero p,
.ws-final-section h2,
.ws-final-footer,
.ws-final-rubric li {
  display: flex;
  align-items: center;
}

.ws-final-kicker {
  gap: var(--ws-space-1);
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  letter-spacing: 0;
}

.ws-final-hero h1 {
  margin: 0;
  color: var(--ws-ink);
  font-size: 26px;
  line-height: var(--ws-leading-tight);
}

.ws-final-hero p {
  gap: var(--ws-space-2);
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.ws-final-hero small {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-final-section {
  display: grid;
  gap: var(--ws-space-3);
  min-width: 0;
}

.ws-final-section h2 {
  gap: var(--ws-space-2);
  margin: 0;
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
  line-height: var(--ws-leading-tight);
}

.ws-final-doc {
  min-width: 0;
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.ws-final-doc :deep(h1) {
  margin: var(--ws-space-2) 0 var(--ws-space-3);
  font-size: var(--ws-text-xl);
}

.ws-final-doc :deep(h2) {
  margin: var(--ws-space-5) 0 var(--ws-space-2);
  font-size: var(--ws-text-lg);
}

.ws-final-doc :deep(h3) {
  margin: var(--ws-space-4) 0 var(--ws-space-2);
  font-size: var(--ws-text-base);
}

.ws-final-doc :deep(p),
.ws-final-doc :deep(ul),
.ws-final-doc :deep(ol),
.ws-final-doc :deep(blockquote) {
  margin: 0.55em 0;
}

.ws-final-doc :deep(pre),
.ws-final-command {
  max-width: 100%;
  margin: 0;
  padding: var(--ws-space-3);
  overflow-x: auto;
  color: var(--ws-code-ink, var(--ws-ink));
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-code-bg, var(--ws-surface-alt));
  font-size: var(--ws-text-xs);
  line-height: 1.55;
}

.ws-final-doc :deep(code),
.ws-final-command code {
  font-family: var(--vp-font-family-mono);
}

.ws-final-doc :deep(a) {
  color: var(--ws-accent);
  text-decoration: none;
}

.ws-final-doc :deep(a:hover) {
  text-decoration: underline;
}

.ws-final-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ws-final-chips li {
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-accent);
  border: 1px solid var(--ws-accent-soft);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  overflow-wrap: anywhere;
}

.ws-final-rubric {
  display: grid;
  gap: var(--ws-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ws-final-rubric li {
  gap: var(--ws-space-2);
  min-width: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.ws-final-rubric svg {
  flex: 0 0 auto;
  color: var(--ws-success, #16a34a);
}

.ws-final-footer {
  gap: var(--ws-space-2);
  padding: var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-sm);
  line-height: 1.6;
}

.ws-final-footer svg {
  flex: 0 0 auto;
  color: var(--ws-accent);
}

.ws-final-muted {
  margin: 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-sm);
}

.ws-final-state {
  display: grid;
  min-height: 320px;
  align-content: center;
  justify-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-6);
  color: var(--ws-ink-muted);
  text-align: center;
}

.ws-final-state > svg {
  color: var(--ws-warn);
}

.ws-final-state strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
}

.ws-final-state span {
  max-width: 420px;
  font-size: var(--ws-text-sm);
  line-height: 1.6;
}

@media (max-width: 900px) {
  .ws-final-scroll {
    padding: var(--ws-space-4) var(--ws-space-4) var(--ws-space-6);
  }

  .ws-final-hero h1 {
    font-size: 22px;
  }
}
</style>
