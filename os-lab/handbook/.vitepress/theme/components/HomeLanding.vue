<script setup lang="ts">
import {
  ArrowRight,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Code2,
  FileText,
  Play,
  Route,
  Terminal,
} from 'lucide-vue-next'

const labs = [
  { id: '01', name: '启动', detail: 'SBI 输出' },
  { id: '02', name: 'Trap', detail: '任务调度' },
  { id: '03', name: '虚存', detail: '页表映射' },
  { id: '04', name: '进程', detail: 'fork / exec' },
  { id: '05', name: '文件', detail: '管道与锁' },
  { id: '06', name: '磁盘', detail: 'VirtIO FS' },
  { id: '07', name: 'IPC', detail: '信号处理' },
  { id: '08', name: '线程', detail: '同步与死锁' },
]

const workflow = [
  {
    icon: BookOpen,
    step: '01',
    title: '读懂任务',
    text: '在左侧手册确认目标、前置知识和必须出现的验证证据。',
  },
  {
    icon: Code2,
    step: '02',
    title: '修改代码',
    text: '在右侧工作区定位任务文件，完成实现并保存。',
  },
  {
    icon: Terminal,
    step: '03',
    title: '运行验证',
    text: '执行当前 Lab 的可信命令，对照断言、Problems 与 Trace。',
  },
  {
    icon: FileText,
    step: '04',
    title: '解释证据',
    text: '把判断、运行证据与复盘写入报告，再进入下一层。',
  },
]

const capabilities = [
  {
    icon: Route,
    label: '一套内核，八次进化',
    text: '不在多个孤立项目间切换。同一套 kernel 随 feature 逐层长出完整能力。',
    link: '/guide/start',
    linkText: '查看课程地图',
  },
  {
    icon: Bot,
    label: '带着证据问导师',
    text: '选中手册、代码、输出或 Trace 后提问。导师帮助定位，不代写完整答案。',
    link: '/guide/beginner#用证据向-ai-导师提问',
    linkText: '了解提问方式',
  },
  {
    icon: ChartNoAxesCombined,
    label: '过程也会被看见',
    text: '系统记录你的预测、试错、可信验证与复盘，不只看最后一次运行结果。',
    link: '/guide/beginner#完成实验报告',
    linkText: '了解完成标准',
  },
]
</script>

<template>
  <div class="os-home">
    <section class="os-hero" aria-labelledby="os-home-title">
      <div class="os-hero-grid" aria-hidden="true"></div>
      <div class="os-boot-log" aria-hidden="true">
        <span>[SBI] hart 0 online</span>
        <span>[kernel] trap vector ready</span>
        <span>[task] switch 0 -&gt; 1</span>
        <span>[verify] assertions passed</span>
      </div>

      <div class="os-home-shell os-hero-content">
        <div class="os-hero-kicker os-reveal">
          <span class="os-status-dot" aria-hidden="true"></span>
          Rust · RISC-V 64 · QEMU
        </div>
        <h1 id="os-home-title" class="os-brand os-reveal os-delay-1">os-lab</h1>
        <p class="os-hero-statement os-reveal os-delay-2">
          把操作系统，<span>一层一层跑出来。</span>
        </p>
        <p class="os-hero-copy os-reveal os-delay-3">
          从第一行裸机输出，到能处理虚存、文件、进程与线程的内核。
          手册、代码、验证、Trace 和 AI 导师都在同一个实验工作台里。
        </p>

        <div class="os-hero-actions os-reveal os-delay-4">
          <a class="os-button os-button-primary" href="/guide/ai-tutor">
            <Play :size="18" fill="currentColor" aria-hidden="true" />
            开始当前实验
            <ArrowRight :size="18" aria-hidden="true" />
          </a>
          <a class="os-button os-button-secondary" href="/guide/beginner">
            第一次使用？先看这里
          </a>
        </div>

        <div class="os-proof os-reveal os-delay-4" aria-label="平台特性">
          <span><Check :size="15" aria-hidden="true" /> 8 个渐进式 Lab</span>
          <span><Check :size="15" aria-hidden="true" /> 真实 QEMU 验证</span>
          <span><Check :size="15" aria-hidden="true" /> 证据驱动辅导</span>
        </div>
      </div>

      <div class="os-kernel-track-wrap os-reveal os-delay-3">
        <div class="os-home-shell">
          <div class="os-track-heading">
            <span>YOUR KERNEL / LAB 01—08</span>
            <span>从启动到并发</span>
          </div>
          <ol class="os-kernel-track" aria-label="Lab1 到 Lab8 的学习顺序">
            <li v-for="(lab, index) in labs" :key="lab.id" :style="{ '--track-index': index }">
              <a :href="`/learn/lab${index + 1}`">
                <span class="os-track-node">{{ lab.id }}</span>
                <strong>{{ lab.name }}</strong>
                <small>{{ lab.detail }}</small>
              </a>
            </li>
          </ol>
        </div>
      </div>

      <a class="os-scroll-cue" href="#how-it-works" aria-label="继续查看实验流程">
        一次实验怎样完成
        <ChevronDown :size="16" aria-hidden="true" />
      </a>
    </section>

    <section id="how-it-works" class="os-process" aria-labelledby="os-process-title">
      <div class="os-home-shell">
        <div class="os-section-heading">
          <p>ONE LAB, ONE CLOSED LOOP</p>
          <h2 id="os-process-title">一次 Lab，不只是把代码跑通</h2>
          <span>每一步都留下可以检查、解释和复现的反馈。</span>
        </div>

        <ol class="os-workflow">
          <li v-for="item in workflow" :key="item.step">
            <div class="os-workflow-top">
              <span>{{ item.step }}</span>
              <component :is="item.icon" :size="22" :stroke-width="1.7" aria-hidden="true" />
            </div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="os-capabilities" aria-labelledby="os-capabilities-title">
      <div class="os-home-shell os-capabilities-layout">
        <div class="os-capabilities-intro">
          <p>BUILT FOR LEARNING BY DOING</p>
          <h2 id="os-capabilities-title">需要的参考、反馈和帮助，都在正确的位置</h2>
          <a href="/materials">打开学习材料 <ArrowRight :size="17" aria-hidden="true" /></a>
        </div>

        <div class="os-capability-list">
          <article v-for="item in capabilities" :key="item.label">
            <component :is="item.icon" :size="23" :stroke-width="1.7" aria-hidden="true" />
            <div>
              <h3>{{ item.label }}</h3>
              <p>{{ item.text }}</p>
              <a :href="item.link">{{ item.linkText }} <ArrowRight :size="15" aria-hidden="true" /></a>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="os-final-cta" aria-labelledby="os-final-title">
      <div class="os-home-shell">
        <div>
          <p>READY WHEN YOU ARE</p>
          <h2 id="os-final-title">先从 Lab1，让内核说出第一句话。</h2>
        </div>
        <a class="os-button os-button-light" href="/learn/lab1">
          进入 Lab1 工作台
          <ArrowRight :size="18" aria-hidden="true" />
        </a>
      </div>
    </section>
  </div>
</template>
