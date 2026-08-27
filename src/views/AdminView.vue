<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import type { MemberAdminInput, PlanTask, TaskType } from '../types'

const store = useAppStore()
const search = ref('')
const selectedId = ref('')
const message = ref('')
const saving = ref(false)
const pinVisible = ref(false)
const memberForm = reactive<MemberAdminInput>({ displayName: '', role: 'member', active: true, pin: '' })
const tasks = computed(() => (store.snapshot?.tasks || []).filter((task) => `${task.title}${task.detail}${task.series || ''}`.toLowerCase().includes(search.value.toLowerCase())).slice(0, 80))
const selected = computed(() => store.snapshot?.tasks.find((task) => task.id === selectedId.value))
const taskForm = reactive<PlanTask>({ id: '', sequence: 1, weekIndex: 0, plannedDate: '2026-08-27', stage: '自定义', type: 'video', datePolicy: 'rolling', title: '', detail: '', estimatedMinutes: 30, required: true })

watch(selected, (task) => { if (task) Object.assign(taskForm, JSON.parse(JSON.stringify(task))) })
function newTask() {
  selectedId.value = ''
  Object.assign(taskForm, { id: `custom-${crypto.randomUUID().slice(0, 8)}`, sequence: (store.snapshot?.tasks.length || 0) + 1, weekIndex: 0, plannedDate: '2026-08-27', stage: '自定义', type: 'video' as TaskType, datePolicy: 'rolling', title: '', detail: '', estimatedMinutes: 30, questionCount: undefined, resourceUrl: '', required: true })
}
async function saveTask() { saving.value = true; try { await store.saveTask({ ...taskForm }); message.value = '任务已保存'; selectedId.value = taskForm.id } finally { saving.value = false } }
async function removeTask() { if (!taskForm.id || !confirm(`确定删除“${taskForm.title}”吗？`)) return; await store.deleteTask(taskForm.id); newTask(); message.value = '任务已删除' }
function generateMemberPin() {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  memberForm.pin = String(100000 + (random[0] % 900000))
  pinVisible.value = true
  message.value = '已随机生成6位PIN，保存成员后生效'
}
async function saveMember() { saving.value = true; try { await store.saveMember({ ...memberForm }); Object.assign(memberForm, { id: undefined, displayName: '', role: 'member', active: true, pin: '' }); pinVisible.value = false; message.value = '成员已保存，PIN不会在团队页展示' } finally { saving.value = false } }
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return
  try { const payload = JSON.parse(await file.text()); const list = Array.isArray(payload) ? payload : payload.tasks || payload.data?.tasks; if (!Array.isArray(list)) throw new Error('未找到任务数组'); await store.importPlan(list); message.value = `已导入 ${list.length} 项任务` } catch (error) { message.value = error instanceof Error ? error.message : '导入失败' }
}
async function testNotice() { const result = await store.testNotification(); message.value = result.message }

newTask()
</script>

<template>
  <div v-if="!store.isAdmin" class="empty-state"><strong>无权访问</strong><p>计划管理仅管理员可见。</p></div>
  <div v-else class="page-stack admin-page">
    <section class="page-intro"><span class="eyebrow">ADMIN CONSOLE</span><h2>计划管理</h2><p>修改标题、日期、耗时、题量、直播节点与资料链接，不需要重新部署。</p></section>
    <div class="admin-toolbar"><input v-model="search" type="search" placeholder="搜索任务，最多显示80项" /><button class="primary-button small" @click="newTask">＋ 新增任务</button><label class="secondary-button file-button">导入计划 JSON<input type="file" accept="application/json" @change="importFile" /></label><button class="secondary-button" @click="testNotice">测试通知</button></div>
    <p v-if="message" class="success-message">{{ message }}</p>
    <section class="admin-grid">
      <div class="task-picker"><button v-for="task in tasks" :key="task.id" :class="{ active: selectedId === task.id }" @click="selectedId = task.id"><span>W{{ task.weekIndex }} · {{ task.plannedDate }}</span><strong>{{ task.title }}</strong></button></div>
      <form class="panel-card admin-form" @submit.prevent="saveTask">
        <div class="two-columns"><label>任务ID<input v-model="taskForm.id" required /></label><label>顺序<input v-model.number="taskForm.sequence" type="number" min="1" required /></label></div>
        <label>标题<input v-model="taskForm.title" required /></label><label>说明<textarea v-model="taskForm.detail" rows="3" required></textarea></label>
        <div class="two-columns"><label>计划日期<input v-model="taskForm.plannedDate" type="date" required /></label><label>周次 W0–W8<input v-model.number="taskForm.weekIndex" type="number" min="0" max="8" required /></label></div>
        <div class="two-columns"><label>类型<select v-model="taskForm.type"><option v-for="type in ['video','quiz','case','paper','mock','live','error','catchup','exam']" :key="type">{{ type }}</option></select></label><label>排期策略<select v-model="taskForm.datePolicy"><option value="rolling">滚动</option><option value="fixed">固定</option></select></label></div>
        <div class="two-columns"><label>折算分钟<input v-model.number="taskForm.estimatedMinutes" type="number" min="0" /></label><label>题量<input v-model.number="taskForm.questionCount" type="number" min="0" /></label></div>
        <label>资料链接<input v-model="taskForm.resourceUrl" type="url" placeholder="https://" /></label>
        <label class="checkbox-label"><input v-model="taskForm.required" type="checkbox" />必做任务</label>
        <div class="button-row"><button class="primary-button" :disabled="saving">保存任务</button><button class="secondary-button danger-text" type="button" @click="removeTask">删除</button></div>
      </form>
    </section>
    <section class="panel-card member-admin"><div><span class="eyebrow">MEMBERS</span><h2>新增成员 / 重置PIN</h2><p class="muted">填写已有成员ID可更新；不填写PIN则保留原PIN。</p></div><form @submit.prevent="saveMember"><label>成员ID（更新时填）<input v-model="memberForm.id" /></label><label>显示名<input v-model="memberForm.displayName" required /></label><label>角色<select v-model="memberForm.role"><option value="member">成员</option><option value="admin">管理员</option></select></label><label>新PIN<div class="pin-input-row"><input v-model="memberForm.pin" :type="pinVisible ? 'text' : 'password'" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" /><button class="secondary-button" type="button" @click="generateMemberPin">随机生成</button><button v-if="memberForm.pin" class="secondary-button pin-toggle" type="button" @click="pinVisible = !pinVisible">{{ pinVisible ? '隐藏' : '显示' }}</button></div></label><label class="checkbox-label"><input v-model="memberForm.active" type="checkbox" />启用</label><button class="primary-button" :disabled="saving">保存成员</button></form></section>
  </div>
</template>
