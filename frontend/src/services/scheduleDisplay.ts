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

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatExamDateTime(
  schedule: Pick<ScheduleSlot, 'eventDate' | 'dayOfWeek' | 'startTime' | 'endTime'>
): string {
  const timeRange = `${schedule.startTime}–${schedule.endTime}`
  const dateMatch = schedule.eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!dateMatch) {
    const day = schedule.dayOfWeek.toUpperCase()
    const dayLabels: Record<string, string> = {
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
    return `${dayLabels[day] ?? 'วันสอบยังไม่ประกาศ'} ${timeRange}`
  }

  const [, year, month, date] = dateMatch
  const dateObject = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)))
  const day = THAI_SHORT_DAYS[dateObject.getUTCDay()]
  const monthLabel = THAI_SHORT_MONTHS[Number(month) - 1]

  return `${day} ${Number(date)} ${monthLabel} ${Number(year) + 543} ${timeRange}`
}
