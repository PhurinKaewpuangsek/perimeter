import type { ScheduleSlot } from '../types/schedule'
import { addDays, formatLocalDate, isExamSchedule } from './scheduleDisplay'

const DAY_INDEX: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }

export interface Reminder<T extends ScheduleSlot = ScheduleSlot> {
  slot: T
  /** YYYY-MM-DD of the next time it happens. */
  date: string
  /** It is happening right now. */
  ongoing: boolean
}

function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/**
 * The next time each entry happens, soonest first. A dated entry (an exam or an activity)
 * happens on its date; anything else repeats every week on its day. Entries that are over,
 * and exams whose date is not announced, are left out.
 */
export function getUpcomingReminders<T extends ScheduleSlot>(slots: T[], now: Date, limit = 3): Reminder<T>[] {
  const today = formatLocalDate(now)
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const reminders: Reminder<T>[] = []

  for (const slot of slots) {
    const start = toMinutes(slot.startTime)
    const end = toMinutes(slot.endTime)
    if (start === null || end === null) continue

    let date: string
    if (slot.eventDate) {
      date = slot.eventDate
    } else if (isExamSchedule(slot)) {
      continue
    } else {
      const day = DAY_INDEX[slot.dayOfWeek.toUpperCase().slice(0, 3)]
      if (day === undefined) continue
      let daysAhead = (day - now.getDay() + 7) % 7
      if (daysAhead === 0 && end <= nowMinute) daysAhead = 7
      date = addDays(today, daysAhead)
    }

    if (date < today || (date === today && end <= nowMinute)) continue
    reminders.push({ slot, date, ongoing: date === today && start <= nowMinute })
  }

  return reminders
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.startTime.localeCompare(b.slot.startTime))
    .slice(0, limit)
}
