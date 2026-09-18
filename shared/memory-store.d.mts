import type { MemoryReviewEvent, MemoryReviewState } from '../src/types/memory'
export const MEMORY_STATE_TYPE: string
export function validateMemoryReview(input: unknown): string | null
export function listMemoryStates(db: unknown, memberId?: string): Promise<MemoryReviewState[]>
export function persistMemoryReview(db: unknown, memberId: string, input: MemoryReviewEvent, now?: Date): Promise<{ state: MemoryReviewState; duplicate: boolean }>
