import type { ScheduleSlot } from '../types/schedule'
import { TIMETABLE_DAYS, normalizeDay, type TimetableDay } from './timetableLayout'
import {
  addDays,
  formatThaiShortDate,
  getSlotDisplayLabel,
  isActivitySchedule,
  isExamSchedule,
} from './scheduleDisplay'

/** Day codes in JavaScript Date.getDay() order. */
const JS_DAYS: TimetableDay[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function toDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Weekday code of a YYYY-MM-DD date. */
export function getDayCode(date: string): TimetableDay {
  return JS_DAYS[toDate(date).getDay()]
}

/** Monday (YYYY-MM-DD) of the week that holds `date`. */
export function getWeekStart(date: string): string {
  return addDays(date, -((toDate(date).getDay() + 6) % 7))
}

export interface WeekDay {
  day: TimetableDay
  /** YYYY-MM-DD */
  date: string
}

/** Monday to Sunday of the week starting `weekStart`, with their dates. */
export function getWeekDays(weekStart: string): WeekDay[] {
  return TIMETABLE_DAYS.map((day, index) => ({ day, date: addDays(weekStart, index) }))
}

/**
 * Everything that uses the room in the week starting `weekStart`. Weekly entries (classes, and
 * activities without a date) appear every week; dated ones (exams, activities) only in the week
 * of their date, on that date's weekday. Exams whose date is not announced are left out.
 */
export function getSlotsForWeek(slots: ScheduleSlot[], weekStart: string): ScheduleSlot[] {
  const weekEnd = addDays(weekStart, 6)
  return slots.flatMap((slot) => {
    if (!slot.eventDate) return isExamSchedule(slot) ? [] : [slot]
    if (slot.eventDate < weekStart || slot.eventDate > weekEnd) return []
    const day = getDayCode(slot.eventDate)
    // Keep the same object when its weekday already agrees, so pins still match it.
    return [normalizeDay(slot.dayOfWeek) === day ? slot : { ...slot, dayOfWeek: day }]
  })
}

/** "16–22 พ.ย. 2569", "30 พ.ย. – 6 ธ.ค. 2569" or "29 ธ.ค. 2569 – 4 ม.ค. 2570". */
export function formatWeekRange(weekStart: string): string {
  const weekEnd = addDays(weekStart, 6)
  const end = formatThaiShortDate(weekEnd, true)
  if (weekStart.slice(0, 4) !== weekEnd.slice(0, 4)) return `${formatThaiShortDate(weekStart, true)} – ${end}`
  if (weekStart.slice(5, 7) !== weekEnd.slice(5, 7)) return `${formatThaiShortDate(weekStart)} – ${end}`
  return `${Number(weekStart.slice(8))}–${end}`
}

export type UsageKind = 'class' | 'exam' | 'activity'

export function getUsageKind(slot: Pick<ScheduleSlot, 'eventType'>): UsageKind {
  if (isExamSchedule(slot)) return 'exam'
  return isActivitySchedule(slot) ? 'activity' : 'class'
}

export const USAGE_KIND_LABELS: Record<UsageKind, string> = {
  class: 'เรียน',
  exam: 'สอบ',
  activity: 'กิจกรรม',
}

/**
 * Text on a small block. Exams say "สอบ" in words, since an exam shares its course's colour
 * and colour alone must not carry the difference.
 */
export function getBlockLabel(slot: Pick<ScheduleSlot, 'eventType' | 'eventCode' | 'eventName'>): string {
  return isExamSchedule(slot) ? `สอบ ${slot.eventCode}` : getSlotDisplayLabel(slot)
}
