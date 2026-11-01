import type { ScheduleSlot } from '../types/schedule.ts'

export function isExamSchedule(schedule: Pick<ScheduleSlot, 'eventType'>): boolean {
  return schedule.eventType.toLowerCase() === 'exam'
}

export function getExamDateLabel(
  schedule: Pick<ScheduleSlot, 'eventType' | 'eventDate'>
): string | null {
  if (!isExamSchedule(schedule)) return null
  return schedule.eventDate || 'date to be announced'
}

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

const THAI_SHORT_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const THAI_SHORT_DAY_LABELS: Record<string, string> = {
  MON: 'จ.',
  MONDAY: 'จ.',
  TUE: 'อ.',
  TUESDAY: 'อ.',
  WED: 'พ.',
  WEDNESDAY: 'พ.',
  THU: 'พฤ.',
  THURSDAY: 'พฤ.',
  FRI: 'ศ.',
  FRIDAY: 'ศ.',
  SAT: 'ส.',
  SATURDAY: 'ส.',
  SUN: 'อา.',
  SUNDAY: 'อา.',
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getThaiShortDayLabel(dayOfWeek: string): string {
  const day = dayOfWeek.toUpperCase()
  return THAI_SHORT_DAY_LABELS[day] ?? dayOfWeek
}

export function formatExamDateTime(
  schedule: Pick<ScheduleSlot, 'eventDate' | 'dayOfWeek' | 'startTime' | 'endTime'>
): string {
  const timeRange = `${schedule.startTime}–${schedule.endTime}`
  const dateMatch = schedule.eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!dateMatch) {
    const dayLabel = getThaiShortDayLabel(schedule.dayOfWeek)
    return `${dayLabel === schedule.dayOfWeek ? 'วันสอบยังไม่ประกาศ' : dayLabel} ${timeRange}`
  }

  const [, year, month, date] = dateMatch
  const dateObject = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)))
  const day = THAI_SHORT_DAYS[dateObject.getUTCDay()]
  const monthLabel = THAI_SHORT_MONTHS[Number(month) - 1]

  return `${day} ${Number(date)} ${monthLabel} ${Number(year) + 543} ${timeRange}`
}

const THAI_FULL_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]

const THAI_FULL_DAYS: Record<string, string> = {
  MON: 'วันจันทร์',
  MONDAY: 'วันจันทร์',
  TUE: 'วันอังคาร',
  TUESDAY: 'วันอังคาร',
  WED: 'วันพุธ',
  WEDNESDAY: 'วันพุธ',
  THU: 'วันพฤหัสบดี',
  THURSDAY: 'วันพฤหัสบดี',
  FRI: 'วันศุกร์',
  FRIDAY: 'วันศุกร์',
  SAT: 'วันเสาร์',
  SATURDAY: 'วันเสาร์',
  SUN: 'วันอาทิตย์',
  SUNDAY: 'วันอาทิตย์',
}

/** Formats a full Thai date string, e.g. "วันศุกร์ที่ 8 พฤษภาคม 2569" */
export function formatThaiDateHeader(eventDate: string | undefined, dayOfWeek: string): string {
  if (!eventDate) return 'ยังไม่ประกาศวันสอบ'
  const match = eventDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return `วันสอบ: ${eventDate}`
  const [, year, month, date] = match
  const dayName = THAI_FULL_DAYS[dayOfWeek.toUpperCase()] ?? ''
  const monthName = THAI_FULL_MONTHS[Number(month) - 1] ?? ''
  const thaiYear = Number(year) + 543
  return `${dayName ? `${dayName}ที่ ` : ''}${Number(date)} ${monthName} ${thaiYear}`
}

/** Extracts seats badge (e.g. "Seats 1-7") from event name if present */
export function extractSeatsInfo(eventName: string): string | null {
  const match = eventName.match(/\((Seats?\s*[^)]+)\)/i)
  return match ? match[1] : null
}
