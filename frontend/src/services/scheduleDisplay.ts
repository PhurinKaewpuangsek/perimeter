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
