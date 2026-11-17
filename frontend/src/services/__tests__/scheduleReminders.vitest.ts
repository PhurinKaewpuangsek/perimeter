import { describe, expect, it } from 'vitest'
import type { ScheduleSlot } from '../../types/schedule'
import { getUpcomingReminders } from '../scheduleReminders'

const slot = (overrides: Partial<ScheduleSlot>): ScheduleSlot => ({
  roomCode: 'LC3-121',
  eventCode: 'CS101',
  eventName: 'Intro',
  dayOfWeek: 'WED',
  startTime: '09:00',
  endTime: '10:30',
  eventType: 'class',
  ...overrides,
})

// Wednesday 18 November 2026.
const at = (time: string) => new Date(`2026-11-18T${time}:00`)

describe('getUpcomingReminders', () => {
  it('puts a weekly class still running today first, as ongoing', () => {
    expect(getUpcomingReminders([slot({})], at('09:30'))).toEqual([
      { slot: slot({}), date: '2026-11-18', ongoing: true },
    ])
  })

  it('moves a weekly class that ended today to next week', () => {
    expect(getUpcomingReminders([slot({})], at('11:00'))[0].date).toBe('2026-11-25')
  })

  it('skips finished dated entries and exams without a date', () => {
    const reminders = getUpcomingReminders(
      [
        slot({ eventCode: 'PAST', eventType: 'exam', eventDate: '2026-11-17' }),
        slot({ eventCode: 'TBA', eventType: 'exam' }),
        slot({ eventCode: 'DONE', eventType: 'other', eventDate: '2026-11-18', endTime: '08:00', startTime: '07:00' }),
        slot({ eventCode: 'NEXT', eventType: 'exam', eventDate: '2026-11-30' }),
      ],
      at('09:00'),
    )
    expect(reminders.map((r) => r.slot.eventCode)).toEqual(['NEXT'])
  })

  it('returns at most the limit, soonest first', () => {
    const reminders = getUpcomingReminders(
      [slot({ eventCode: 'FRI', dayOfWeek: 'FRI' }), slot({ eventCode: 'THU', dayOfWeek: 'THU' })],
      at('12:00'),
      1,
    )
    expect(reminders.map((r) => r.slot.eventCode)).toEqual(['THU'])
  })
})
