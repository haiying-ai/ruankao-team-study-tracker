<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import cardData from '../data/memory-cards.json'
import type { MemoryCard, MemoryReviewState } from '../types/memory'
import { loadMemory, reviewMemory, syncMemory } from '../services/memory'
import { memoryQueue } from '../utils/memory'
import type { MemoryMode } from '../utils/memory'
import { toDateKey } from '../utils/date'

const store = useAppStore()
const router = useRouter()
const cards = cardData as MemoryCard[]
const states = ref<MemoryReviewState[]>([])
const category = ref('all')
const mode = ref<MemoryMode>('daily')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const offline = ref(false)
const pending = ref(0)
const revealed = ref(false)
const started = ref(false)
const round = ref<MemoryCard[]>([])
const position = ref(0)
const right = ref(0)
const wrongIds = ref<string[]>([])
const eventId = ref('')
const notice = ref('')
const roundAnchor = ref<HTMLElement | null>(null)
const today = ref(toDateKey())
let generation = 0
let disposed = false
let syncing = false
const categories = [
  { id: 'all', label: '全部知识' }, { id: 'concept', label: '核心概念' },
  { id: 'formula', label: '公式计算' }, { id: 'process', label: '49个过程' },
  { id: 'process-map', label: '49过程背图' },
  { id: 'tool', label: '工具方法' }
]
const filtered = computed(() => cards.filter((card) => category.value === 'all' || card.category === category.value))
const stateMap = computed(() => new Map(states.value.map((state) => [state.cardId, state])))
const newCount = computed(() => filtered.value.filter((card) => !stateMap.value.has(card.id)).length)
const dueCount = computed(() => filtered.value.filter((card) => {
  const state = stateMap.value.get(card.id)
  return state && state.nextReviewAt <= today.value
}).length)
const stableCount = computed(() => filtered.value.filter((card) => (stateMap.value.get(card.id)?.streak || 0) >= 3).length)
const nextRound = computed(() => memoryQueue(filtered.value, states.value, today.value, mode.value))
const card = computed(() => round.value[position.value])
const finished = computed(() => started.value && position.value >= round.value.length)
const progress = computed(() => round.value.length ? position.value / round.value.length * 100 : 0)

function newEventId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return `review-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

async function handleError(reason: unknown) {
  if (reason instanceof Error && reason.message === 'UNAUTHORIZED') {
    error.value = '登录已过期，请重新登录；未同步记录仍保留在本设备。'
    await router.replace('/login')
    return
  }
  error.value = reason instanceof Error ? reason.message : '暂时无法保存，请重试。'
}

async function load() {
  const memberId = store.member?.id
  const run = ++generation
  started.value = false
  revealed.value = false
  round.value = []
  states.value = []
  pending.value = 0
  loading.value = true
  if (!memberId) return
  error.value = ''
  try {
    const result = await loadMemory(memberId)
    if (run !== generation || disposed) return
    states.value = result.states
    pending.value = result.pendingSyncCount
    offline.value = result.offline
  } catch (reason) {
    if (run === generation) await handleError(reason)
  } finally {
    if (run === generation) loading.value = false
  }
}

function start(items = nextRound.value) {
  today.value = toDateKey()
  round.value = [...items]
  position.value = 0
  right.value = 0
  wrongIds.value = []
  notice.value = ''
  revealed.value = false
  started.value = true
  eventId.value = newEventId()
  void nextTick(() => roundAnchor.value?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
}

function changeScope() {
  started.value = false
  revealed.value = false
  notice.value = ''
}

async function grade(correct: boolean) {
  const current = card.value
  const memberId = store.member?.id
  if (!current || !memberId || !revealed.value || saving.value) return
  saving.value = true
  error.value = ''
  const run = generation
  try {
    const result = await reviewMemory(memberId, { cardId: current.id, correct, mode: mode.value, eventId: eventId.value })
    if (run !== generation || disposed) return
    states.value = [...states.value.filter((state) => state.cardId !== current.id), result.state]
    pending.value = result.pendingSyncCount
    offline.value = result.offline
    if (correct) right.value++
    else wrongIds.value.push(current.id)
    notice.value = `${correct ? '✓ 已记住' : '✕ 需加强'} · 下次复习 ${result.state.nextReviewAt}（${result.offline ? '已保存到本机，待同步' : '已保存'}）`
    position.value++
    revealed.value = false
    eventId.value = newEventId()
    void nextTick(() => roundAnchor.value?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  } catch (reason) {
    if (run === generation) await handleError(reason)
  } finally {
    saving.value = false
  }
}

async function sync() {
  const memberId = store.member?.id
  if (!memberId || loading.value || saving.value || syncing) return
  const run = generation
  syncing = true
  error.value = ''
  try {
    const result = await syncMemory(memberId)
    if (run !== generation || disposed) return
    states.value = result.states
    pending.value = result.pendingSyncCount
    offline.value = result.offline
  } catch (reason) { if (run === generation) await handleError(reason) }
  finally { syncing = false }
}

function resume() {
  if (document.visibilityState === 'visible') {
    today.value = toDateKey()
    void sync()
  }
}
function retryWrong() {
  const ids = new Set(wrongIds.value)
  start(round.value.filter((item) => ids.has(item.id)))
}
watch(() => store.member?.id, load, { immediate: true })
watch([category, mode], changeScope)
onMounted(() => {
  window.addEventListener('online', sync)
  document.addEventListener('visibilitychange', resume)
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  window.removeEventListener('online', sync)
  document.removeEventListener('visibilitychange', resume)
})
</script>

<template>
  <div class="page-stack memory-page">
    <section class="page-intro">
      <span class="eyebrow">ACTIVE RECALL · 主动回忆</span>
      <h2>先想起来，再翻答案</h2>
      <p>概念、公式、49个管理过程与工具方法。49过程既可逐项背，也可按过程组纵向背、按知识领域横向背。</p>
    </section>

    <div v-if="offline || pending" class="memory-sync" role="status">
      {{ pending ? `${pending} 条背书记录待同步，联网后自动上传` : '当前离线：使用本机复习记录' }}
      <button type="button" :disabled="saving || loading" @click="sync">重试同步</button>
    </div>
    <div v-if="error" class="memory-error" role="alert">{{ error }} <button type="button" @click="load">重新加载</button></div>

    <details class="panel-card memory-options" :open="!started">
      <summary>{{ categories.find((item) => item.id === category)?.label }} · {{ mode === 'daily' ? '每日复习' : '全量自测' }} <span>选择模块 / 模式</span></summary>
      <div class="options-body" role="region" aria-label="背书设置">
      <div class="mode-switch">
        <button type="button" :class="{ selected: mode === 'daily' }" :aria-pressed="mode === 'daily'" :disabled="saving" @click="mode = 'daily'">每日复习 <small>错卡优先 · 间隔记忆</small></button>
        <button type="button" :class="{ selected: mode === 'all' }" :aria-pressed="mode === 'all'" :disabled="saving" @click="mode = 'all'">全量自测 <small>不看日期 · 逐张检测</small></button>
      </div>
      <div class="category-tabs" aria-label="知识范围">
        <button v-for="item in categories" :key="item.id" type="button" :class="{ selected: category === item.id }" :aria-pressed="category === item.id" :disabled="saving" @click="category = item.id">{{ item.label }} <span>{{ cards.filter((c) => item.id === 'all' || c.category === item.id).length }}</span></button>
      </div>
      <p v-if="category === 'process-map'" class="memory-hint process-map-hint">5 道纵向题：回忆每个过程组的全部过程；10 道横向题：回忆每个知识领域的全部过程。先默写清单，再核对数量、名称与归属；遗漏或错位均建议选“还没记住”。</p>
      <div class="memory-metrics">
        <div><strong>{{ dueCount }}</strong><span>到期复习</span></div>
        <div><strong>{{ newCount }}</strong><span>尚未学习</span></div>
        <div><strong>{{ stableCount }}</strong><span>连续答对 ≥3 次</span></div>
      </div>
      <p class="memory-hint">{{ mode === 'daily' ? '每轮包含全部到期卡＋最多20张新卡，错卡优先。' : `本轮覆盖所选范围全部 ${filtered.length} 张卡，不跳过已学会的内容。` }}切换模式或范围会开始新一轮，已保存的记录不受影响。</p>
      </div>
    </details>

    <div v-if="loading" class="empty-state" role="status">正在加载你的记忆记录…</div>
    <section v-else-if="!started" class="panel-card memory-start">
      <span class="eyebrow">{{ mode === 'daily' ? 'TODAY’S PRACTICE' : 'COMPLETE CHECK' }}</span>
      <h3>{{ nextRound.length ? `准备好回忆这 ${nextRound.length} 张卡了吗？` : '今天的复习已完成' }}</h3>
      <p>{{ nextRound.length ? '只看问题 → 独立回忆 → 查看答案 → 自评对错。模糊不清也建议选“还没记住”。' : '可切换「全量自测」提前复习，或明天回来巩固。' }}</p>
      <button v-if="nextRound.length" type="button" class="primary-button" :disabled="!!error" @click="start()">{{ mode === 'daily' ? '开始背书' : '开始全量自测' }} →</button>
      <button v-else type="button" class="secondary-button" @click="mode = 'all'">进入全量自测</button>
    </section>

    <template v-else>
      <div ref="roundAnchor" class="round-progress" aria-label="本轮进度">
        <span>本轮已完成 {{ position }} / {{ round.length }}</span><span>✓ {{ right }}　✕ {{ wrongIds.length }}</span>
        <div class="linear-progress"><span :style="{ width: `${progress}%` }"></span></div>
      </div>
      <p v-if="notice" class="save-notice" role="status">{{ notice }}</p>
      <section v-if="card && !finished" :key="card.id" class="panel-card recall-card">
        <div class="card-topline"><span class="eyebrow">{{ categories.find((c) => c.id === card.category)?.label }}</span><span>{{ position + 1 }} / {{ round.length }}</span></div>
        <div v-if="revealed" class="memory-tags"><span v-for="tag in card.tags" :key="tag">{{ tag }}</span></div>
        <h3>{{ card.prompt }}</h3>
        <p v-if="!revealed" class="think-hint">先试着说出答案，也可以在纸上默写。想好后再揭晓。</p>
        <button v-if="!revealed" type="button" class="primary-button reveal-button" @click="revealed = true">我想好了，查看答案</button>
        <div v-else class="answer-area">
          <span class="eyebrow">对照答案</span>
          <p class="answer-text">{{ card.answer }}</p>
          <p v-if="card.explanation" class="explanation">{{ card.explanation }}</p>
          <details class="card-sources"><summary>讲义出处 · PDF 页码</summary><ul><li v-for="source in card.sources" :key="`${source.document}:${source.page}`">{{ source.document }} · 第 {{ source.page }} 页</li></ul></details>
          <p class="memory-hint">按实际回忆结果自评；系统不自动判断你的口述答案。</p>
          <div class="grade-buttons">
            <button type="button" class="grade-wrong" :disabled="saving" @click="grade(false)"><b>✕</b> 还没记住<small>次日优先复习</small></button>
            <button type="button" class="grade-right" :disabled="saving" @click="grade(true)"><b>✓</b> 已经记住<small>逐步延长间隔</small></button>
          </div>
          <p v-if="saving" class="memory-hint" role="status">正在保存…</p>
        </div>
      </section>
      <section v-else-if="finished" class="panel-card memory-start" aria-live="polite">
        <span class="eyebrow">ROUND COMPLETE</span><h3>这一轮，完成了</h3>
        <p>共检测 {{ round.length }} 张：记住 {{ right }} 张，还需加强 {{ wrongIds.length }} 张。{{ pending ? '本机记录已保存，联网后继续同步。' : '个人复习记录已保存。' }}</p>
        <div class="finish-actions"><button v-if="wrongIds.length" type="button" class="primary-button" @click="retryWrong">再背本轮错卡</button><button type="button" class="secondary-button" @click="changeScope">返回背书首页</button></div>
      </section>
    </template>
    <p class="schedule-note">记忆间隔：答错 → 次日；连续答对 → 1 / 3 / 7 / 14 / 30 天。同一天重复答对不叠加升级。复习日期使用北京时间，与你的学习计划预览日期无关。</p>
  </div>
</template>

<style scoped>
.memory-options { display: block; }
.memory-options > summary { color: var(--green-dark); cursor: pointer; font-weight: 650; font-size: 14px; line-height: 1.8; }
.memory-options > summary span { float: right; font-size: 11px; font-weight: 400; color: #536d65; }
.options-body { display: grid; gap: 18px; padding-top: 18px; }
.mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 5px; background: #eff4f0; border-radius: 16px; }
.mode-switch button { border: 0; border-radius: 12px; background: transparent; padding: 13px 8px; color: #48645e; font-weight: 750; font-size: 15px; }
.mode-switch small { display: block; font-weight: 400; font-size: 11px; margin-top: 5px; }
.mode-switch .selected { background: var(--green-dark); color: white; }
.category-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.category-tabs button { padding: 8px 11px; border: 1px solid var(--line); background: white; border-radius: 999px; color: var(--ink); font-size: 12px; }
.category-tabs button.selected { border-color: var(--green); background: var(--mint); color: var(--green-dark); }
.category-tabs span { opacity: .7; margin-left: 3px; }
.process-map-hint { border-left: 3px solid var(--green); background: var(--mint); padding: 12px 14px; border-radius: 0 10px 10px 0; }
.memory-metrics { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; padding: 10px 0; }
.memory-metrics div + div { border-left: 1px solid var(--line); }
.memory-metrics strong { display: block; font-size: 27px; color: var(--green-dark); }
.memory-metrics span { display: block; font-size: 12px; color: #536d65; margin-top: 5px; }
.memory-hint, .schedule-note { color: #536d65; font-size: 12px; line-height: 1.8; margin: 0; }
.schedule-note { padding: 0 6px 6px; }
.memory-start { padding: 30px; }
.memory-start h3 { font-size: 24px; margin: 12px 0; }
.memory-start p { line-height: 1.8; color: #536d65; }
.memory-start button { margin-top: 10px; }
.round-progress { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; font-size: 13px; scroll-margin-top: 16px; }
.round-progress .linear-progress { flex: 0 0 100%; }
.save-notice { margin: 0; font-size: 12px; color: var(--green-dark); line-height: 1.7; }
.recall-card { padding: 30px; border-top: 4px solid var(--green); }
.card-topline { display: flex; justify-content: space-between; color: #536d65; font-size: 12px; }
.memory-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 18px; }
.memory-tags span { padding: 4px 8px; border-radius: 6px; background: #f0f5f1; color: #536d65; font-size: 11px; }
.recall-card h3 { font-size: clamp(21px, 3vw, 30px); line-height: 1.6; margin: 22px 0; overflow-wrap: anywhere; }
.think-hint { color: #6b7f75; line-height: 1.8; font-size: 14px; margin: 18px 0 26px; }
.reveal-button { width: 100%; padding: 16px; }
.answer-area { border-top: 1px dashed var(--line); padding-top: 22px; }
.answer-text { font-size: 18px; line-height: 1.95; white-space: pre-wrap; overflow-wrap: anywhere; }
.explanation { border-left: 3px solid #c3dcd0; padding: 12px 16px; background: #f4f8f4; line-height: 1.9; font-size: 14px; white-space: pre-wrap; }
.card-sources { color: #536d65; font-size: 12px; line-height: 1.8; margin: 20px 0; overflow-wrap: anywhere; }
.card-sources summary { cursor: pointer; }
.card-sources ul { padding-left: 18px; }
.grade-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
.grade-buttons button { border-radius: 14px; padding: 14px 8px; font-size: 15px; font-weight: 650; }
.grade-buttons b { font-size: 19px; }
.grade-buttons small { display: block; font-weight: 400; margin-top: 5px; font-size: 11px; }
.grade-wrong { color: #9e332e; border: 1px solid #e4b8b4; background: #fff4f0; }
.grade-right { color: white; border: 1px solid var(--green); background: var(--green); }
.memory-sync, .memory-error { border-radius: 12px; padding: 13px; font-size: 13px; line-height: 1.8; background: #fff2d6; }
.memory-error { background: #ffebe8; color: #9e332e; }
.memory-sync button, .memory-error button { border: 0; background: none; text-decoration: underline; color: inherit; }
.finish-actions { display: flex; gap: 10px; flex-wrap: wrap; }
button { cursor: pointer; }
button:disabled { opacity: .55; cursor: wait; }
button:focus-visible, summary:focus-visible { outline: 3px solid #dd9236; outline-offset: 3px; }
@media (max-width: 480px) { .memory-start, .recall-card { padding: 22px 18px; } .memory-metrics span { font-size: 11px; } }
</style>
