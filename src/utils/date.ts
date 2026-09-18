const DAY_MS = 86_400_000

export const toDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)!.value
  const year = value('year')
  const month = value('month')
  const day = value('day')
  return `${year}-${month}-${day}`
}

export const parseDateKey = (key: string) => new Date(`${key}T00:00:00+08:00`)

export const daysBetween = (from: string, to: string) =>
  Math.ceil((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS)

export const addDays = (key: string, days: number) => {
  return toDateKey(new Date(parseDateKey(key).getTime() + days * DAY_MS))
}

export const formatDate = (key: string, withYear = false) => {
  const date = parseDateKey(key)
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    ...(withYear ? { year: 'numeric' } : {}),
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  }).format(date)
}

export const isSunday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay() === 0

// W0 is the preparation period; W1 starts on the following Monday.
export const currentPlanWeek = (today: string, start = '2026-08-27', lastWeek = 8) => {
  const weekday = new Date(`${start}T00:00:00Z`).getUTCDay()
  const firstMonday = addDays(start, (8 - weekday) % 7 || 7)
  const elapsed = daysBetween(firstMonday, today)
  return Math.max(0, Math.min(lastWeek, Math.floor(elapsed / 7) + 1))
}

export const dateRange = (start: string, end: string) => {
  const result: string[] = []
  let cursor = start
  while (cursor <= end) {
    result.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return result
}
