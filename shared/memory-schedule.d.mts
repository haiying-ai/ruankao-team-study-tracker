import type { MemoryCard, MemoryReviewState } from '../src/types/memory'
export const REVIEW_INTERVALS: readonly number[]
export function chinaDay(value?: Date | string | number): string
export function scheduleReview(previous: MemoryReviewState | undefined | null, input: { memberId: string; cardId: string; correct: boolean }, now?: Date | string | number): MemoryReviewState
export function compareMemoryPriority(a: Pick<MemoryCard, 'id'>, b: Pick<MemoryCard, 'id'>, states: Record<string, MemoryReviewState>): number
