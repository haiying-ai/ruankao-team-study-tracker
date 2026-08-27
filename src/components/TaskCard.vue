<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import type { AttemptMode, PlanTask } from '../types'
import { formatDate } from '../utils/date'

const props = defineProps<{ task: PlanTask; compact?: boolean }>()
const store = useAppStore()
const saving = ref(false)
const showAttempt = ref(false)
const completedQuestions = ref(props.task.questionCount || 0)
const actualMinutes = ref(props.task.estimatedMinutes)
const selectionScore = ref<number | undefined>()
const caseScore = ref<number | undefined>()
const attemptMode = ref<AttemptMode>('continuous')
const errorTags = ref('')

const done = computed(() => store.doneIds.has(props.task.id))
const isExamTask = computed(() => ['paper', 'mock'].includes(props.task.type))
const typeName: Record<string, string> = {
  video: '视频', quiz: '章节题', case: '案例', paper: '真题', mock: '模考',
  live: '直播', error: '错题', catchup: '追赶', exam: '考试'
}

async function toggle() {
  if (!done.value && isExamTask.value) {
    showAttempt.value = true
    return
  }
  saving.value = true
  try {
    await store.setTaskProgress({
      taskId: props.task.id,
      done: !done.value,
      completedQuestions: !done.value ? props.task.questionCount : undefined,
      actualMinutes: !done.value ? actualMinutes.value : undefined
    })
  } finally { saving.value = false }
}

async function submitAttempt() {
  saving.value = true
  try {
    await store.addAttempt({
      taskId: props.task.id,
      paperKey: props.task.paperKey || props.task.title,
      mode: attemptMode.value,
      selectionScore: selectionScore.value,
      caseScore: caseScore.value,
      durationMinutes: actualMinutes.value,
      errorTags: errorTags.value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean)
    })
    showAttempt.value = false
  } finally { saving.value = false }
}
</script>

<template>
  <article class="task-card" :class="[`type-${task.type}`, { done, compact }]">
    <button class="task-check" :disabled="saving" :aria-label="done ? '撤销完成' : '标记完成'" @click="toggle">
      {{ done ? '✓' : '' }}
    </button>
    <div class="task-main">
      <div class="task-meta">
        <span class="type-pill">{{ typeName[task.type] }}</span>
        <span>{{ formatDate(task.plannedDate) }}</span>
        <span>{{ task.estimatedMinutes }}分钟</span>
        <span v-if="task.questionCount">{{ task.questionCount }}题</span>
        <span v-if="task.datePolicy === 'fixed'" class="fixed-pill">固定</span>
      </div>
      <h3>{{ task.title }}</h3>
      <p v-if="!compact">{{ task.detail }}</p>
      <a v-if="task.resourceUrl" :href="task.resourceUrl" target="_blank" rel="noreferrer">打开资料</a>
    </div>
  </article>

  <div v-if="showAttempt" class="modal-backdrop" @click.self="showAttempt = false">
    <form class="modal-card" @submit.prevent="submitAttempt">
      <div class="section-heading">
        <div><span class="eyebrow">成绩记录</span><h2>{{ task.title }}</h2></div>
        <button type="button" class="icon-button" @click="showAttempt = false">×</button>
      </div>
      <label>完成模式<select v-model="attemptMode"><option value="continuous">连续计时</option><option value="split">拆分完成</option></select></label>
      <div class="two-columns">
        <label>选择题得分<input v-model.number="selectionScore" type="number" min="0" max="75" placeholder="0–75" /></label>
        <label>案例题得分<input v-model.number="caseScore" type="number" min="0" max="75" placeholder="0–75" /></label>
      </div>
      <label>实际用时（分钟）<input v-model.number="actualMinutes" type="number" min="1" max="600" /></label>
      <label>错题标签<input v-model="errorTags" placeholder="网络图，挣值，49过程" /></label>
      <p class="form-hint">50分及以上为绿色备考目标，45分以下会标红。</p>
      <button class="primary-button" type="submit" :disabled="saving">保存成绩并完成任务</button>
    </form>
  </div>
</template>
