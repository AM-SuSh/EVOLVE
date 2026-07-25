import { defineConfig } from 'vitepress'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const handbookRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  title: 'os-lab 学习手册',
  description: 'Rust + RISC-V 操作系统教学实验 · 单内核渐进式学习路径',
  lang: 'zh-CN',
  srcDir: '.',
  outDir: resolve(handbookRoot, '.vitepress/dist'),
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: [/^\/project\//, /\.md$/],
  markdown: {
    mermaid: true,
  },
  head: [['meta', { name: 'theme-color', content: '#1565c0' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: '开始学习', link: '/guide/start' },
      { text: '学习进度', link: '/guide/progress' },
      { text: '实验总览', link: '/labs/overview' },
      { text: '快速验证', link: '/guide/verify' },
      { text: '环境配置', link: '/setup/environment' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '认识 os-lab', link: '/guide/start' },
            { text: '学习进度', link: '/guide/progress' },
            { text: '验证命令', link: '/guide/verify' },
            { text: '环境安装', link: '/setup/environment' },
            { text: '完整验证文档', link: '/setup/verify-full' },
          ],
        },
      ],
      '/labs/': [
        {
          text: '实验指导',
          items: [
            { text: '材料说明', link: '/labs/README' },
            { text: '总览与知识地图', link: '/labs/overview' },
            { text: 'Lab1 裸机启动', link: '/labs/lab1-bare-metal' },
            { text: 'Lab2 中断与多任务', link: '/labs/lab2-trap-and-task' },
            { text: 'Lab3 内存与虚存', link: '/labs/lab3-memory' },
            { text: 'Lab4 进程管理', link: '/labs/lab4-process' },
            { text: 'Lab5 文件系统与并发', link: '/labs/lab5-fs-and-sync' },
            { text: 'Lab6 磁盘文件系统', link: '/labs/lab6-disk-fs' },
            { text: 'Lab7 IPC 与信号', link: '/labs/lab7-ipc-signal' },
            { text: 'Lab8 线程与同步', link: '/labs/lab8-thread-sync' },
          ],
        },
      ],
      '/exercises/': [
        {
          text: '文字习题（Lab6–8）',
          items: [
            { text: '习题说明', link: '/exercises/README' },
            { text: 'Lab6 习题', link: '/exercises/lab6-exercises' },
            { text: 'Lab7 习题', link: '/exercises/lab7-exercises' },
            { text: 'Lab8 习题', link: '/exercises/lab8-exercises' },
          ],
        },
      ],
      '/answers/': [
        {
          text: '参考答案',
          items: [
            { text: '答案说明', link: '/answers/README' },
            { text: 'Lab1 答案', link: '/answers/lab1-answers' },
            { text: 'Lab2 答案', link: '/answers/lab2-answers' },
            { text: 'Lab3 答案', link: '/answers/lab3-answers' },
            { text: 'Lab4 答案', link: '/answers/lab4-answers' },
            { text: 'Lab5 答案', link: '/answers/lab5-answers' },
            { text: 'Lab6 答案', link: '/answers/lab6-answers' },
            { text: 'Lab7 答案', link: '/answers/lab7-answers' },
            { text: 'Lab8 答案', link: '/answers/lab8-answers' },
          ],
        },
      ],
      '/setup/': [
        {
          text: '环境与验证',
          items: [
            { text: '环境安装', link: '/setup/environment' },
            { text: '完整验证文档', link: '/setup/verify-full' },
          ],
        },
      ],
      '/project/': [
        {
          text: '项目文档',
          items: [
            { text: '设计总结报告', link: '/project/design-report' },
            { text: '架构说明', link: '/project/architecture' },
            { text: '三方对比', link: '/project/comparison' },
            { text: '对比数据', link: '/project/comparison-data' },
            { text: 'AI 协作记录', link: '/project/ai-collaboration' },
          ],
        },
      ],
    },
    socialLinks: [],
    footer: {
      message: 'os-lab 自研操作系统教学实验环境',
      copyright: 'BSD-3-Clause',
    },
    outline: { level: [2, 3] },
    search: { provider: 'local' },
  },
  vite: {
    resolve: {
      alias: {
        '@data': resolve(handbookRoot, 'data'),
      },
    },
  },
})
