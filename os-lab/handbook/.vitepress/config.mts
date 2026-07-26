import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const handbookRoot = fileURLToPath(new URL('..', import.meta.url))

export default withMermaid(defineConfig({
  title: 'os-lab 学习手册',
  description: 'Rust + RISC-V 操作系统教学实验 · 单内核渐进式学习路径',
  lang: 'zh-CN',
  srcDir: '.',
  outDir: resolve(handbookRoot, '.vitepress/dist'),
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: [/^\/project\//, /^\/downloads\//, /\.md$/],
  head: [['meta', { name: 'theme-color', content: '#126a73' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: '引导式学习', link: '/guide/ai-tutor' },
      { text: '实验总览', link: '/labs/overview' },
      { text: '学习进度', link: '/guide/progress' },
      { text: '快速验证', link: '/guide/verify' },
      { text: '环境配置', link: '/setup/environment' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '5 分钟上手', link: '/guide/quick-start' },
            { text: '引导式学习', link: '/guide/ai-tutor' },
            { text: '学习进度', link: '/guide/progress' },
            { text: '验证命令', link: '/guide/verify' },
            { text: '环境安装', link: '/setup/environment' },
            { text: '完整验证文档', link: '/setup/verify-full' },
          ],
        },
        {
          text: '进入学习工作台',
          items: [
            { text: 'Lab1 启动底座', link: '/learn/lab1' },
            { text: 'Lab2 执行与切换', link: '/learn/lab2' },
            { text: 'Lab3 地址空间', link: '/learn/lab3' },
            { text: 'Lab4 进程能力', link: '/learn/lab4' },
            { text: 'Lab5 文件与并发', link: '/learn/lab5' },
          ],
        },
      ],
      '/labs/': [
        {
          text: '实验指导',
          items: [
            { text: '总览与知识地图', link: '/labs/overview' },
            { text: 'Lab1 裸机启动', link: '/labs/lab1-bare-metal' },
            { text: 'Lab2 中断与多任务', link: '/labs/lab2-trap-and-task' },
            { text: 'Lab3 内存与虚存', link: '/labs/lab3-memory' },
            { text: 'Lab4 进程管理', link: '/labs/lab4-process' },
            { text: 'Lab5 文件系统与并发', link: '/labs/lab5-fs-and-sync' },
          ],
        },
        {
          text: '引导式学习',
          items: [
            { text: '在工作台中学习', link: '/guide/ai-tutor' },
          ],
        },
      ],
      '/exercises/': [
        {
          text: '文字习题',
          items: [
            { text: '习题说明', link: '/exercises/README' },
            { text: 'Lab1 习题', link: '/exercises/lab1-exercises' },
            { text: 'Lab2 习题', link: '/exercises/lab2-exercises' },
            { text: 'Lab3 习题', link: '/exercises/lab3-exercises' },
            { text: 'Lab4 习题', link: '/exercises/lab4-exercises' },
            { text: 'Lab5 习题', link: '/exercises/lab5-exercises' },
          ],
        },
      ],
      '/answers/': [
        {
          text: '参考答案',
          items: [
            { text: 'Lab1 答案', link: '/answers/lab1-answers' },
            { text: 'Lab2 答案', link: '/answers/lab2-answers' },
            { text: 'Lab3 答案', link: '/answers/lab3-answers' },
            { text: 'Lab4 答案', link: '/answers/lab4-answers' },
            { text: 'Lab5 答案', link: '/answers/lab5-answers' },
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
    search: {
      provider: 'local',
      // /learn/* 只是 /labs/* 正文的工作台外壳，索引两次会让搜索结果重复。
      options: { exclude: (relativePath) => relativePath.startsWith('learn/') },
    },
  },
  vite: {
    resolve: {
      alias: {
        '@data': resolve(handbookRoot, 'data'),
      },
    },
  },
}))
