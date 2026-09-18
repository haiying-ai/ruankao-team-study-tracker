export type MemoryCategory = 'concept' | 'formula' | 'process' | 'process-map' | 'tool'
export type MemoryMode = 'daily' | 'all'

export interface MemoryCard {
  id: string
  category: MemoryCategory
  prompt: string
  answer: string
  explanation?: string
  tags: string[]
  sources: { document: string; page: number }[]
}

export interface MemoryReviewState {
  cardId: string
  memberId: string
  streak: number
  lapses: number
  reviews: number
  lastReviewedAt: string
  /** Shanghai calendar date, not a UTC timestamp. */
  nextReviewAt: string
  intervalDays: number
  lastCorrect: boolean
}

export interface MemoryReviewInput {
  cardId: string
  correct: boolean
  mode: MemoryMode
  eventId?: string
}

export interface MemoryReviewEvent extends MemoryReviewInput {
  eventId: string
  reviewedAt: string
}

export interface MemorySnapshot {
  states: MemoryReviewState[]
  pendingSyncCount: number
  offline: boolean
}

export interface MemoryReviewResult {
  state: MemoryReviewState
  pendingSyncCount: number
  offline: boolean
}
