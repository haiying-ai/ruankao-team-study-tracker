export interface TeamMemoryModuleSummary {
  total: number
  reviewed: number
  stable: number
}

export interface TeamMemorySummary extends TeamMemoryModuleSummary {
  memberId: string
  due: number
  needsWork: number
  reviews: number
  lastReviewedAt: string | null
  process: TeamMemoryModuleSummary
  processMap: TeamMemoryModuleSummary
}

export interface TeamMemorySnapshot {
  generatedAt: string
  summaries: TeamMemorySummary[]
}
