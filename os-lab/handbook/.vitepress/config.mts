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
  ignoreDeadLinks: [
    /^\/project\//,
    /^\/downloads\//,
    /\.md$/,
    // docs/lab6-8.md 指向仓库根的规划文件（progress、technical-proposal 等），不在站点内
    /\.\.\/progress$/,
    /next-phase-roadmap/,
    /technical-proposal/,
  ],
  head: [['meta', { name: 'theme-color', content: '#126a73' }]],
  themeConfig: {
    logo: '/logo.svg',
    // 引导式学习是主入口；进度勾选/验证速查从顶栏移入侧栏，避免与工作台重复。
    nav: [
      { text: '首页', link: '/' },
      { text: '引导式学习', link: '/guide/ai-tutor' },
      { text: '开始学习', link: '/guide/start' },
      { text: '环境配置', link: '/setup/environment' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '认识 os-lab', link: '/guide/start' },
            { text: '引导式学习', link: '/guide/ai-tutor' },
            { text: '学习进度', link: '/guide/progress' },
            { text: '验证命令', link: '/guide/verify' },
            { text: '环境安装', link: '/setup/environment' },
            { text: '完整验证文档', link: '/setup/verify-full' },
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
            { text: 'Lab6–8 设计说明', link: '/project/lab6-8' },
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
      // /learn/* 是正文外壳（避免搜索重复）；teacher* 为教师页不进学生搜索。
      options: {
        exclude: (relativePath) =>
          relativePath.startsWith('learn/') || relativePath.startsWith('teacher'),
      },
    },
  },
  vite: {
    resolve: {
      alias: {
        '@data': resolve(handbookRoot, 'data'),
      },
    },
    server: {
      fs: {
        // 前端直接 import os-lab/learning/rubric.mjs 与 os-lab/tutor/prompts/guardrails.yaml
        // （评分与护栏的单一事实源），dev server 需要允许访问 handbook 之外的 os-lab 目录。
        allow: [
          handbookRoot,
          resolve(handbookRoot, '..', 'learning'),
          resolve(handbookRoot, '..', 'tutor', 'prompts'),
        ],
      },
    },
  },
}))
