import type { MemoryReviewState } from '../src/types/memory'

export interface MemoryTeamSummary {
  memberId: string
  total: number
  reviewed: number
  stable: number
  due: number
  needsWork: number
  reviews: number
  lastReviewedAt: string | null
  process: { total: number; reviewed: number; stable: number }
  processMap: { total: number; reviewed: number; stable: number }
}

export interface MemoryTeamResult {
  generatedAt: string
  summaries: MemoryTeamSummary[]
}

export function buildMemoryTeamSummary(
  members: Array<{ id?: string; _id?: string; active: boolean }>,
  cards: Array<{ id: string; category: string }>,
  states: MemoryReviewState[],
  now?: Date | string
): MemoryTeamResult
