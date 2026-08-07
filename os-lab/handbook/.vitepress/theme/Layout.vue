<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import VPNav from 'vitepress/dist/client/theme-default/components/VPNav.vue'
import { useData } from 'vitepress'
import AuthGate from './components/AuthGate.vue'
import LabWorkspace from './components/LabWorkspace.vue'
import TeacherNav from './components/TeacherNav.vue'
import UserNav from './components/UserNav.vue'
import WorkspaceNav from './components/WorkspaceNav.vue'
import type { TutorLabId } from './tutor-model'

/**
 * /learn/labN 走自有工作台外壳，其余页面走默认文档主题。
 *
 * 自定义页面直接复用官方 VPNav，正文仍由 VitePress 构建期通过 @include
 * 并入壳页，再以 <Content /> 原样传给工作台。工作区高度扣除官方导航栏，
 * shiki 高亮、mermaid、锚点全部沿用官方管线。
 */
const DefaultLayout = DefaultTheme.Layout
const { frontmatter } = useData()
</script>

<template>
  <!-- 站点入口登录门：进入即登录（学生注册带班级；教师用 admin）。 -->
  <AuthGate />
  <VPNav v-if="frontmatter.workspace || frontmatter.launch || frontmatter.teacherReview || frontmatter.knowledgeManager">
    <template #nav-bar-content-after>
      <TeacherNav />
      <WorkspaceNav v-if="frontmatter.workspace" />
      <UserNav :workspace-settings="Boolean(frontmatter.workspace)" />
    </template>
  </VPNav>
  <LabWorkspace
    v-if="frontmatter.workspace"
    :key="frontmatter.labId as string"
    :lab-id="frontmatter.labId as TutorLabId"
  >
    <Content />
  </LabWorkspace>
  <main v-else-if="frontmatter.launch" class="launch-layout">
    <Content />
  </main>
  <div v-else-if="frontmatter.teacherReview" class="teacher-review-layout">
    <Content />
  </div>
  <div v-else-if="frontmatter.knowledgeManager" class="knowledge-manager-layout">
    <Content />
  </div>
  <DefaultLayout v-else>
    <!-- 教师管理入口 + 当前用户（点击可退出）。 -->
    <template #nav-bar-content-after>
      <TeacherNav />
      <UserNav />
    </template>
  </DefaultLayout>
</template>

<style scoped>
.teacher-review-layout {
  position: relative;
  top: var(--vp-nav-height);
  height: calc(100dvh - var(--vp-nav-height));
  min-height: 0;
  overflow: hidden;
}

.knowledge-manager-layout {
  position: relative;
  top: var(--vp-nav-height);
  height: calc(100dvh - var(--vp-nav-height));
  min-height: 0;
  overflow: hidden;
}

.launch-layout {
  position: relative;
  top: var(--vp-nav-height);
  min-height: calc(100dvh - var(--vp-nav-height));
  padding: clamp(20px, 4vw, 48px);
  overflow-y: auto;
  background: var(--ws-surface);
}

@media (max-width: 959px) {
  .teacher-review-layout,
  .knowledge-manager-layout,
  .launch-layout {
    top: 0;
  }
}
</style>
