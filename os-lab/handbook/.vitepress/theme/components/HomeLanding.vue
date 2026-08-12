<script setup lang="ts">
import { ArrowRight, Check, Play } from 'lucide-vue-next'
</script>

<template>
  <div class="os-home">
    <section class="os-hero" aria-labelledby="os-home-title">
      <div class="os-hero-grid" aria-hidden="true"></div>

      <div class="os-home-shell os-hero-content">
        <div class="os-hero-kicker os-reveal">
          <span class="os-status-dot" aria-hidden="true"></span>
          Rust · RISC-V 64 · QEMU
        </div>
        <h1 id="os-home-title" class="os-brand os-reveal os-delay-1">
          <span class="os-brand-mark">EVOLVE</span>
          <span class="os-brand-expand">
            <span class="os-brand-expand-line">Evolving Virtual OS Learning</span>
            <span class="os-brand-expand-line">&amp; Verification Environment</span>
          </span>
        </h1>

        <div class="os-hero-actions os-reveal os-delay-2">
          <a class="os-button os-button-primary" href="/guide/ai-tutor">
            <Play :size="18" fill="currentColor" aria-hidden="true" />
            开始当前实验
            <ArrowRight :size="18" aria-hidden="true" />
          </a>
          <a class="os-button os-button-secondary" href="/guide/start">
            第一次使用？先看这里
          </a>
        </div>

        <div class="os-proof os-reveal os-delay-2" aria-label="平台特性">
          <span><Check :size="15" aria-hidden="true" /> 8 个渐进式 Lab</span>
          <span><Check :size="15" aria-hidden="true" /> 真实 QEMU 验证</span>
          <span><Check :size="15" aria-hidden="true" /> 证据驱动辅导</span>
        </div>
      </div>

      <div class="os-terminal-scene" aria-hidden="true">
        <div class="os-terminal-glow"></div>
        <div class="os-terminal">
          <div class="os-terminal-bar">
            <span class="os-terminal-dot"></span>
            <span class="os-terminal-dot"></span>
            <span class="os-terminal-dot"></span>
            <span class="os-terminal-title">EVOLVE kernel — qemu-system-riscv64</span>
          </div>
          <div class="os-terminal-body">
            <div class="os-terminal-line">
              <span class="os-terminal-typed" style="--chars: 21; --type-width: 21ch; --type-delay: 460ms; --type-duration: 260ms">
                <span class="os-terminal-prompt">[SBI]</span>&nbsp;&nbsp;hart 0 online
              </span>
            </div>
            <div class="os-terminal-line">
              <span class="os-terminal-typed" style="--chars: 28; --type-width: 28ch; --type-delay: 760ms; --type-duration: 320ms">
                <span class="os-terminal-prompt">[kernel]</span>&nbsp;&nbsp;trap vector ready
              </span>
            </div>
            <div class="os-terminal-line">
              <span class="os-terminal-typed" style="--chars: 23; --type-width: 23ch; --type-delay: 1120ms; --type-duration: 280ms">
                <span class="os-terminal-prompt">[task]</span>&nbsp;&nbsp;switch 0 &rarr; 1
              </span>
            </div>
            <div class="os-terminal-line">
              <span class="os-terminal-typed" style="--chars: 28; --type-width: 28ch; --type-delay: 1440ms; --type-duration: 340ms">
                <span class="os-terminal-prompt">[verify]</span>&nbsp;&nbsp;assertions passed
              </span>
            </div>
            <div class="os-terminal-line os-terminal-command">
              <span class="os-terminal-typed" style="--chars: 2; --type-width: 2ch; --type-delay: 1820ms; --type-duration: 80ms">
                <span class="os-terminal-prompt">$</span>&nbsp;
              </span>
              <span class="os-terminal-cursor"></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
