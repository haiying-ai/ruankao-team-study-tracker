<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import type { Member } from '../types'
import { calculateBacklog, calculateLead, completedTaskIds, firstIncompleteTask } from '../utils/progress'

const store = useAppStore()
const copyingMemberId = ref('')
const inviteStatus = ref('')
const inviteText = ref('')
const inviteMemberName = ref('')
const inviteDialogOpen = ref(false)
const inviteCopyStatus = ref('')
const inviteTextarea = ref<HTMLTextAreaElement | null>(null)
const rows = computed(() => (store.snapshot?.members || []).map((member) => {
  const tasks = store.snapshot?.tasks || []
  const done = completedTaskIds(store.snapshot?.completions || [], member.id)
  const attempts = (store.snapshot?.attempts || []).filter((item) => item.memberId === member.id).sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt))
  const checkins = new Set((store.snapshot?.checkins || []).filter((item) => item.memberId === member.id).map((item) => item.date))
  return {
    member, done: done.size, backlog: calculateBacklog(tasks, done, store.today), lead: calculateLead(tasks, done, store.today),
    current: firstIncompleteTask(tasks, done), checkinDays: checkins.size, latest: attempts[0]
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
