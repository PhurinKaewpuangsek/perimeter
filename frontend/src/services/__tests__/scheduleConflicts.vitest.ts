import { describe, it, expect } from 'vitest'
import {
  buildScheduleSlotId,
  timeIntervalsOverlap,
  schedulesOverlap,
  findRoomConflicts,
  getRoomAvailabilityMap,
} from '../scheduleConflicts'
import type { ScheduleSlot } from '../../types/schedule'

const sampleSchedules: ScheduleSlot[] = [
  {
    roomCode: 'LC3-101',
    dayOfWeek: 'MON',
    startTime: '09:00',
    endTime: '12:00',
    eventCode: 'CS101',
    eventName: 'Intro to CS',
    eventType: 'lecture',
  },
  {
    roomCode: 'LC3-101',
    dayOfWeek: 'MON',
    startTime: '13:00',
    endTime: '16:00',
    eventCode: 'BAS350',
    eventName: 'Exam BAS350',
    eventType: 'exam',
    eventDate: '2026-05-18',
  },
  {
    roomCode: 'LC3-201',
    dayOfWeek: 'MON',
    startTime: '10:30',
    endTime: '12:30',
    eventCode: 'CS201',
    eventName: 'Data Structures',
    eventType: 'lab',
  },
]

describe('scheduleConflicts service', () => {
  it('builds canonical schedule_slot key', () => {
    expect(buildScheduleSlotId(sampleSchedules[0])).toBe('MON#09:00#CS101')
  })

  it('detects overlapping time intervals and allows adjacent non-overlapping intervals', () => {
    expect(timeIntervalsOverlap('09:00', '12:00', '10:00', '11:00')).toBe(true)
    expect(timeIntervalsOverlap('09:00', '10:30', '10:30', '12:00')).toBe(false)
    expect(timeIntervalsOverlap('12:00', '09:00', '10:00', '11:00')).toBe(false)
  })

  it('excludes the slot being edited via excludeSlotId', () => {
    const conflicts = findRoomConflicts(sampleSchedules, 'LC3-101', {
      dayOfWeek: 'MON',
      startTime: '09:30',
      endTime: '11:30',
      excludeSlotId: 'MON#09:00#CS101',
    })
    expect(conflicts).toHaveLength(0)
  })

  it('distinguishes dated exams on different calendar dates while flagging same-date conflicts', () => {
    const diffDateConflicts = findRoomConflicts(sampleSchedules, 'LC3-101', {
      dayOfWeek: 'MON',
      startTime: '13:30',
      endTime: '15:30',
      eventType: 'exam',
      eventDate: '2026-05-25',
    })
    expect(diffDateConflicts).toHaveLength(0)

    const sameDateConflicts = findRoomConflicts(sampleSchedules, 'LC3-101', {
      dayOfWeek: 'MON',
      startTime: '13:30',
      endTime: '15:30',
      eventType: 'exam',
      eventDate: '2026-05-18',
    })
    expect(sameDateConflicts).toHaveLength(1)
    expect(sameDateConflicts[0].eventCode).toBe('BAS350')
  })

  it('builds an availability map across all rooms for a candidate time window', () => {
    const map = getRoomAvailabilityMap(sampleSchedules, {
      dayOfWeek: 'MON',
      startTime: '10:00',
      endTime: '11:00',
    })
    expect(map.get('LC3-101')?.map((s) => s.eventCode)).toEqual(['CS101'])
    expect(map.get('LC3-201')?.map((s) => s.eventCode)).toEqual(['CS201'])
    expect(schedulesOverlap(sampleSchedules[0], { dayOfWeek: 'TUE', startTime: '09:00', endTime: '12:00' })).toBe(false)
  })
})
