<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { daysBetween, formatDate } from '../utils/date'

const store = useAppStore()
const router = useRouter()
const countdown = computed(() => Math.max(0, daysBetween(store.today, store.snapshot?.config.examDate || '2026-10-24')))
</script>

<template>
  <div v-if="store.snapshot" class="page-stack">
    <section class="hero-card calm-hero">
      <div>
        <span class="eyebrow">{{ formatDate(store.today, true) }} · 考前安心模式</span>
        <h2>离考试还有 <em>{{ countdown }}</em> 天</h2>
        <p>现在不追赶、不比较。把心放稳，把状态照顾好。</p>
      </div>
      <span class="calm-hero-mark" aria-hidden="true">✦</span>
    </section>

    <section class="calm-guide panel-card">
      <span class="eyebrow">NOW IS ENOUGH</span>
      <h2>今天，照顾好自己就很好</h2>
      <div class="calm-guide-list">
        <p><b>轻轻复习</b><span>想复习时，挑几张背书卡即可；不用强迫自己完成更多。</span></p>
        <p><b>好好休息</b><span>按时吃饭、早点睡觉，让大脑留出从容思考的空间。</span></p>
        <p><b>安心赴考</b><span>提前准备证件和文具，按自己的节奏走进考场。</span></p>
      </div>
      <button type="button" class="primary-button" @click="router.push('/memory')">想复习几张，去背书</button>
    </section>

    <section class="calm-reminder">
      <span aria-hidden="true">☁</span>
      <p>会的题稳稳拿下，不确定的题慢慢读懂。你只需要做当下这一题。</p>
    </section>
  </div>
  <div v-else class="loading-state">正在进入安心备考模式…</div>
</template>
