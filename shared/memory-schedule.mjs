export const REVIEW_INTERVALS = Object.freeze([1, 3, 7, 14, 30])

export function chinaDay(value = new Date()) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid review date')
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function addDays(day, days) {
  const date = new Date(`${day}T00:00:00+08:00`)
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  return chinaDay(date)
}

/** Only the trusted server clock is passed here for persisted remote reviews. */
export function scheduleReview(previous, { memberId, cardId, correct }, now = new Date()) {
  if (typeof correct !== 'boolean') throw new Error('correct must be a boolean')
  if (!memberId || !cardId) throw new Error('Missing review identity')
  if (previous && (previous.memberId !== memberId || previous.cardId !== cardId)) throw new Error('Review identity mismatch')
  const today = chinaDay(now)
  const alreadyCorrectToday = previous?.streak > 0 && chinaDay(previous.lastReviewedAt) === today
  // Repeated self-tests on one day do not simulate several days of retention.
  const streak = correct ? (alreadyCorrectToday ? previous.streak : (previous?.streak || 0) + 1) : 0
  const intervalDays = correct ? REVIEW_INTERVALS[Math.min(streak - 1, REVIEW_INTERVALS.length - 1)] : 1
  return {
    cardId, memberId, streak,
    lapses: (previous?.lapses || 0) + (correct ? 0 : 1),
    reviews: (previous?.reviews || 0) + 1,
    lastReviewedAt: new Date(now).toISOString(),
    nextReviewAt: addDays(today, intervalDays),
    intervalDays,
    lastCorrect: correct
  }
}

/** Due mistakes first, then overdue/learned cards, then new cards. */
export function compareMemoryPriority(a, b, states) {
  const left = states[a.id]
  const right = states[b.id]
  const tier = (state) => !state ? 2 : state.lastCorrect === false ? 0 : 1
  return tier(left) - tier(right)
    || (left?.nextReviewAt || '9999').localeCompare(right?.nextReviewAt || '9999')
    || (right?.lapses || 0) - (left?.lapses || 0)
    || a.id.localeCompare(b.id)
}
