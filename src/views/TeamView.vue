<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import type { Member } from '../types'
import { calculateBacklog, calculateLead, completedTaskIds, firstIncompleteTask } from '../utils/progress'
import { loadTeamMemory } from '../services/team-memory'
import type { TeamMemorySnapshot } from '../types/team-memory'

const store = useAppStore()
const copyingMemberId = ref('')
const inviteStatus = ref('')
const inviteText = ref('')
const inviteMemberName = ref('')
const inviteDialogOpen = ref(false)
const inviteCopyStatus = ref('')
const inviteTextarea = ref<HTMLTextAreaElement | null>(null)
const memorySnapshot = ref<TeamMemorySnapshot | null>(null)
const memoryLoading = ref(false)
const memoryError = ref('')
const memoryByMember = computed(() => new Map(memorySnapshot.value?.summaries.map((item) => [item.memberId, item]) || []))
let memoryController: AbortController | undefined
let memoryGeneration = 0
let refreshTimer: ReturnType<typeof setInterval> | undefined
let unmounted = false
let memoryOwnerToken: string | null = null

function memoryTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function cancelMemoryRefresh() {
  memoryGeneration += 1
  memoryController?.abort()
  memoryController = undefined
  memoryLoading.value = false
}

async function refreshMemory() {
  if (unmounted || memoryLoading.value || !store.member?.id || document.visibilityState === 'hidden') return
  if (localStorage.getItem('ruankao.session-token') !== memoryOwnerToken) {
    memorySnapshot.value = null
    memoryError.value = '登录状态已变化，请重新进入团队页。'
    return
  }
  if (!navigator.onLine) {
    memoryError.value = '当前离线，恢复网络后自动更新；下方如有数据，是上次已同步的快照。'
    return
  }
  const owner = store.member.id
  const generation = ++memoryGeneration
  const controller = new AbortController()
  memoryController = controller
  memoryLoading.value = true
  memoryError.value = ''
  try {
    const snapshot = await loadTeamMemory(controller.signal)
    if (unmounted || generation !== memoryGeneration || owner !== store.member?.id) return
    memorySnapshot.value = snapshot
  } catch (error) {
    if (unmounted || generation !== memoryGeneration || controller.signal.aborted) return
    if (localStorage.getItem('ruankao.session-token') !== memoryOwnerToken) {
      memorySnapshot.value = null
      memoryError.value = '登录状态已变化，请重新进入团队页。'
    } else if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      memorySnapshot.value = null
      memoryError.value = '登录已过期，请重新登录后查看团队背书进度。'
    } else {
      memoryError.value = error instanceof TypeError ? '网络异常，未能更新团队背书进度。' : error instanceof Error ? error.message : '团队背书进度获取失败。'
    }
  } finally {
    if (generation === memoryGeneration) {
      memoryLoading.value = false
      memoryController = undefined
    }
  }
}

function resetMemoryOwner() {
  cancelMemoryRefresh()
  memorySnapshot.value = null
  memoryError.value = ''
  memoryOwnerToken = localStorage.getItem('ruankao.session-token')
  void refreshMemory()
}

function refreshOnVisible() {
  if (document.visibilityState === 'visible') void refreshMemory()
  else cancelMemoryRefresh()
}

function handleOffline() {
  cancelMemoryRefresh()
  memoryError.value = '当前离线，恢复网络后自动更新；下方如有数据，是上次已同步的快照。'
}

function handleSessionStorage(event: StorageEvent) {
  if (event.key !== 'ruankao.session-token' && event.key !== null) return
  cancelMemoryRefresh()
  memorySnapshot.value = null
  memoryError.value = '登录状态已变化，请重新进入团队页。'
}

watch(() => store.member?.id, resetMemoryOwner, { immediate: true })
onMounted(() => {
  refreshTimer = setInterval(() => { void refreshMemory() }, 30000)
  document.addEventListener('visibilitychange', refreshOnVisible)
  window.addEventListener('online', refreshMemory)
  window.addEventListener('offline', handleOffline)
  window.addEventListener('storage', handleSessionStorage)
})
onBeforeUnmount(() => {
  unmounted = true
  cancelMemoryRefresh()
  clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', refreshOnVisible)
  window.removeEventListener('online', refreshMemory)
  window.removeEventListener('offline', handleOffline)
  window.removeEventListener('storage', handleSessionStorage)
})
const rows = computed(() => (store.snapshot?.members || []).map((member) => {
  const tasks = store.snapshot?.tasks || []
  const done = completedTaskIds(store.snapshot?.completions || [], member.id)
  const attempts = (store.snapshot?.attempts || []).filter((item) => item.memberId === member.id).sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt))
  const checkins = new Set((store.snapshot?.checkins || []).filter((item) => item.memberId === member.id).map((item) => item.date))
  return {
    member, done: done.size, backlog: calculateBacklog(tasks, done, store.today), lead: calculateLead(tasks, done, store.today),
    current: firstIncompleteTask(tasks, done), checkinDays: checkins.size, latest: attempts[0], memory: memoryByMember.value.get(member.id)
  }
}).sort((a, b) => b.done - a.done))

function createPin() {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return String(100000 + (random[0] % 900000))
}

function selectInviteText() {
  const area = inviteTextarea.value
  if (!area) return
  area.focus()
  area.select()
  area.setSelectionRange(0, area.value.length)
}

async function copyPreparedInvite() {
  if (!inviteText.value) return
  try {
    await navigator.clipboard.writeText(inviteText.value)
    inviteCopyStatus.value = '复制成功，可以直接粘贴到微信。'
  } catch (error) {
    selectInviteText()
    const reason = error instanceof Error ? error.name : 'ClipboardError'
    inviteCopyStatus.value = `浏览器未授权剪贴板（${reason}），文案已全选，请按 Ctrl+C。`
  }
}

async function copyInvite(member: Member) {
  if (!store.isAdmin || copyingMemberId.value) return
  let teamCode = store.verifiedTeamCode
  if (!teamCode) {
    teamCode = window.prompt('为生成完整邀请文案，请再次输入团队口令：')?.trim() || ''
    if (!teamCode) return
    try { await store.verifyTeam(teamCode) } catch { inviteStatus.value = '团队口令验证失败，未生成邀请。'; return }
  }
  const confirmed = window.confirm([
    `将为“${member.displayName}”生成新的个人 PIN，原 PIN 会立即失效。`,
    '',
    '确认后会复制完整邀请文案，包含：',
    '• 学习网站链接',
    '• 团队口令',
    '• 成员身份',
    '• 新的个人 PIN',
    '• 登录使用步骤',
    '',
    '是否继续？'
  ].join('\n'))
  if (!confirmed) return
  copyingMemberId.value = member.id
  inviteStatus.value = ''
  try {
    const pin = createPin()
    await store.saveMember({ id: member.id, displayName: member.displayName, role: member.role, active: member.active, pin }, false)
    const siteUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    const message = [
      '【软考中项学习小组邀请】',
      '',
      `学习网站：${siteUrl}`,
      `团队口令：${teamCode}`,
      `你的登录身份：${member.displayName}`,
      `你的个人 PIN：${pin}`,
      '',
      '使用方法：',
      '1. 在微信中打开学习网站；',
      '2. 输入团队口令并验证；',
      `3. 选择“${member.displayName}”；`,
      '4. 输入上面的个人 PIN 登录；',
      '5. 每天完成任务后及时打卡，未完成任务会自动顺延。',
      '',
      '个人 PIN 仅供本人使用，请勿发到群聊。'
    ].join('\n')
    inviteText.value = message
    inviteMemberName.value = member.displayName
    inviteDialogOpen.value = true
    inviteCopyStatus.value = ''
    inviteStatus.value = `“${member.displayName}”的新 PIN 已保存；分享文案已生成，可随时重新打开。`
  } catch (error) {
    inviteStatus.value = error instanceof Error ? error.message : '生成邀请失败，请稍后重试。'
  } finally {
    copyingMemberId.value = ''
  }
}
</script>

<template>
  <div class="page-stack">
    <section class="page-intro"><span class="eyebrow">TEAM BOARD</span><h2>一起前进，个人 PIN 独立保管</h2><p>排名只用于看清位置和互相提醒；管理员可为成员生成新 PIN 并复制完整邀请文案。</p></section>
    <section class="team-memory-toolbar" aria-label="团队背书同步">
      <div><h3>一起背书 · 看见彼此的进展</h3><p>显示云端已同步进度，页面可见时每 30 秒更新。离线背诵记录联网同步后计入。</p><p>稳定掌握 = 不同天连续答对至少 3 次；背书为个人自评，不代表客观考试成绩。</p></div>
      <button class="secondary-button" type="button" :disabled="memoryLoading" @click="refreshMemory">{{ memoryLoading ? '刷新中…' : '刷新背书进度' }}</button>
      <p v-if="memorySnapshot" class="memory-update-time">{{ memoryError ? '保留上次数据' : '最近同步' }}：{{ memoryTime(memorySnapshot.generatedAt) }}（北京时间）</p>
      <p v-else-if="memoryLoading" class="memory-update-time" role="status">正在获取团队背书进度…</p>
      <p v-if="memoryError" class="memory-error" role="status">{{ memoryError }}</p>
    </section>
    <p v-if="inviteStatus" class="success-message invite-status">{{ inviteStatus }}<button v-if="inviteText" type="button" @click="inviteDialogOpen = true">重新打开邀请</button></p>
    <section class="team-list">
      <article v-for="(row, index) in rows" :key="row.member.id" class="team-card" :class="{ me: row.member.id === store.member?.id }">
        <span class="rank">{{ index + 1 }}</span><span class="avatar large">{{ row.member.displayName.slice(0, 1) }}</span>
        <div class="team-main"><div><h3>{{ row.member.displayName }} <small v-if="row.member.id === store.member?.id">我</small></h3><p>{{ row.current ? `当前 W${row.current.weekIndex} · ${row.current.title}` : '已完成全部任务' }}</p></div>
          <div class="team-stats"><span><strong>{{ row.done }}</strong>完成</span><span><strong>{{ row.checkinDays }}</strong>打卡</span><span v-if="row.latest"><strong>{{ row.latest.selectionScore ?? '-' }}/{{ row.latest.caseScore ?? '-' }}</strong>最近成绩</span></div>
        </div>
        <div class="team-actions">
          <span v-if="row.backlog" class="status-badge" :class="row.backlog >= 7 ? 'red' : row.backlog >= 3 ? 'yellow' : 'neutral'">欠账 {{ row.backlog }}</span>
          <span v-else-if="row.lead" class="status-badge green">领先 {{ row.lead }}</span><span v-else class="status-badge green">正常</span>
          <button v-if="store.isAdmin" class="invite-button" type="button" :disabled="Boolean(copyingMemberId)" @click="copyInvite(row.member)">{{ copyingMemberId === row.member.id ? '生成中…' : '生成分享文案' }}</button>
        </div>
        <section v-if="row.memory" class="team-memory-progress" :aria-label="`${row.member.displayName}的背书进度`">
          <div class="memory-overview"><span>已背 <strong>{{ row.memory.reviewed }}/{{ row.memory.total }}</strong> 题</span><span>稳定掌握 <strong>{{ row.memory.stable }}</strong></span><span>待复习 <strong>{{ row.memory.due }}</strong></span><span>需巩固 <strong>{{ row.memory.needsWork }}</strong></span></div>
          <div class="memory-priority"><span>49 个管理过程 <strong>{{ row.memory.process.reviewed }}/{{ row.memory.process.total }}</strong> · 稳定 {{ row.memory.process.stable }}</span><span>横纵背图 <strong>{{ row.memory.processMap.reviewed }}/{{ row.memory.processMap.total }}</strong> · 稳定 {{ row.memory.processMap.stable }}</span></div>
          <p>累计自评 {{ row.memory.reviews }} 次 · {{ row.memory.lastReviewedAt ? `最近背诵 ${memoryTime(row.memory.lastReviewedAt)}` : '尚未开始背诵' }}</p>
        </section>
        <p v-else class="team-memory-unavailable">{{ memoryLoading ? '正在加载背书进度…' : '暂未获取到背书进度' }}</p>
      </article>
    </section>
    <Teleport to="body">
      <div v-if="inviteDialogOpen" class="modal-backdrop" @click.self="inviteDialogOpen = false">
        <section class="modal-card invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title">
          <div class="section-heading"><div><span class="eyebrow">INVITATION</span><h2 id="invite-dialog-title">{{ inviteMemberName }}的邀请文案</h2></div><button class="icon-button" type="button" aria-label="关闭" @click="inviteDialogOpen = false">×</button></div>
          <p class="muted">新 PIN 已经生效。下面直接展示完整文案，请手动复制并单独发送给该成员。</p>
          <textarea ref="inviteTextarea" class="invite-textarea" :value="inviteText" rows="15" readonly @focus="selectInviteText" @click="selectInviteText"></textarea>
          <p v-if="inviteCopyStatus" class="invite-copy-status">{{ inviteCopyStatus }}</p>
          <div class="button-row"><button class="primary-button" type="button" @click="copyPreparedInvite">复制到剪贴板</button><button class="secondary-button" type="button" @click="selectInviteText">全选文案</button><button class="secondary-button" type="button" @click="inviteDialogOpen = false">关闭</button></div>
          <p class="form-hint">PC端点击“全选文案”后按 Ctrl+C，再粘贴到微信。关闭后可通过团队页顶部的“重新打开邀请”再次查看。</p>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.team-memory-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px; border: 1px solid var(--line); border-radius: 19px; background: #fff; padding: 18px; }
.team-memory-toolbar > div { flex: 1 1 320px; }
.team-memory-toolbar h3 { margin: 0 0 8px; font-size: 16px; }
.team-memory-toolbar p { margin: 5px 0 0; color: #627870; font-size: 12px; line-height: 1.6; }
.team-memory-toolbar .memory-update-time, .team-memory-toolbar .memory-error { flex-basis: 100%; }
.team-memory-toolbar .memory-error { color: #a53c2e; }
.team-memory-progress, .team-memory-unavailable { grid-column: 3 / -1; border-top: 1px solid #e3eae6; padding-top: 12px; min-width: 0; }
.memory-overview, .memory-priority { display: flex; flex-wrap: wrap; gap: 8px 18px; color: #50675f; font-size: 12px; }
.memory-overview strong { color: var(--ink); font-size: 16px; }
.memory-priority { margin-top: 10px; }
.memory-priority span { padding: 7px 9px; background: #edf5ef; border-radius: 8px; line-height: 1.6; }
.team-memory-progress p, .team-memory-unavailable { color: #70847b; font-size: 11px; line-height: 1.6; margin: 8px 0 0; }
@media (max-width: 600px) {
  .team-memory-progress, .team-memory-unavailable { grid-column: 1 / -1; }
  .memory-overview { gap: 9px 15px; }
  .memory-priority { display: grid; }
}
</style>
