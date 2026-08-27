export type MemberRole = 'admin' | 'member'
export type TaskType = 'video' | 'quiz' | 'case' | 'paper' | 'mock' | 'live' | 'error' | 'catchup' | 'exam'
export type DatePolicy = 'rolling' | 'fixed'
export type CompletionStatus = 'done' | 'partial'
export type AttemptMode = 'continuous' | 'split'

export interface Member {
  id: string
  displayName: string
  role: MemberRole
  active: boolean
  streak: number
}

export interface PlanTask {
  id: string
  sequence: number
  weekIndex: number
  plannedDate: string
  stage: string
  type: TaskType
  datePolicy: DatePolicy
  series?: string
  chapter?: string
  title: string
  detail: string
  originalMinutes?: number
  estimatedMinutes: number
  questionCount?: number
  paperKey?: string
  resourceUrl?: string
  required: boolean
  flexibleDuration?: boolean
}

export interface Completion {
  memberId: string
  taskId: string
  status: CompletionStatus
  completedAt: string
  completedQuestions?: number
  actualMinutes?: number
  note?: string
}

export interface Checkin {
  id: string
  memberId: string
  date: string
  minutes: number
  note?: string
}

export interface ExamAttempt {
  id: string
  memberId: string
  taskId: string
  paperKey: string
  mode: AttemptMode
  selectionScore?: number
  caseScore?: number
  durationMinutes?: number
  attemptedAt: string
  errorTags: string[]
}

export interface ErrorTag {
  id: string
  label: string
  count: number
}

export interface AppConfig {
  examDate: string
  planStartDate: string
  dailyMinutes: number
  flexMinutes: number
  playbackRate: number
  appName: string
  notificationTime: string
  environmentExpiresAt?: string
}

export interface TeamMemberProgress {
  member: Member
  completedCount: number
  backlogCount: number
  leadCount: number
  currentTask?: PlanTask
  checkinDays: number
  latestSelectionScore?: number
  latestCaseScore?: number
}

export interface AppSnapshot {
  currentMember: Member
  members: Member[]
  tasks: PlanTask[]
  completions: Completion[]
  checkins: Checkin[]
  attempts: ExamAttempt[]
  config: AppConfig
  pendingSyncCount: number
}

export interface LoginPayload {
  teamCode: string
  memberId: string
  pin: string
}

export interface TeamVerification {
  teamToken: string
  expiresAt: string
  members: Member[]
}

export interface TaskProgressInput {
  taskId: string
  done: boolean
  completedQuestions?: number
  actualMinutes?: number
  note?: string
}

export interface MemberAdminInput {
  id?: string
  displayName: string
  role: MemberRole
  pin?: string
  active: boolean
}
