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
      { text: '入门指南', link: '/guide/start' },
      { text: '引导式学习', link: '/guide/ai-tutor' },
      { text: '学习材料', link: '/materials' },
    ],
    // 学生侧栏只保留入门三页；进度勾选/验证速查/项目文档已从学生导航移除。
    sidebar: {
      '/guide/': [
        {
          text: '入门指南',
          items: [
            { text: '认识 os-lab', link: '/guide/start' },
            { text: '引导式学习', link: '/guide/ai-tutor' },
            { text: '环境安装', link: '/setup/environment' },
          ],
        },
      ],
      '/setup/': [
        {
          text: '入门指南',
          items: [
            { text: '认识 os-lab', link: '/guide/start' },
            { text: '引导式学习', link: '/guide/ai-tutor' },
            { text: '环境安装', link: '/setup/environment' },
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
          relativePath.startsWith('learn/') ||
          relativePath.startsWith('teacher') ||
          relativePath === 'materials.md',
      },
    },
  },
  vite: {
    resolve: {
      alias: {
        '@data': resolve(handbookRoot, 'data'),
      },
    },
    optimizeDeps: {
      include: ['monaco-editor', '@xterm/xterm', '@xterm/addon-fit'],
    },
    worker: {
      format: 'es',
    },
    ssr: {
      noExternal: ['@xterm/xterm', '@xterm/addon-fit'],
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
