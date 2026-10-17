import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  blockHeight,
  buildTimetableLayout,
  formatMinutes,
  normalizeDay,
  parseTimeToMinutes,
} from '../timetableLayout.ts'
import type { ScheduleSlot } from '../../types/schedule.ts'

const slot = (overrides: Partial<ScheduleSlot>): ScheduleSlot => ({
  roomCode: 'LC3-103',
  eventCode: 'CS101',
  eventName: 'CS 101',
  dayOfWeek: 'MON',
  startTime: '09:00',
  endTime: '10:30',
  eventType: 'class',
  ...overrides,
})

describe('timetableLayout', () => {
  describe('parseTimeToMinutes()', () => {
    it('reads HH:MM and H:MM', () => {
      assert.equal(parseTimeToMinutes('09:30'), 570)
      assert.equal(parseTimeToMinutes('8:00'), 480)
      assert.equal(parseTimeToMinutes(' 13:00 '), 780)
      assert.equal(parseTimeToMinutes('24:00'), 1440)
    })

    it('returns null for malformed times instead of throwing', () => {
      for (const bad of ['13.00', '9', '25:00', '12:60', '24:30', 'noon', '', undefined]) {
        assert.equal(parseTimeToMinutes(bad), null, `should reject ${String(bad)}`)
      }
    })
  })

  it('normalizes short and long day names in any case', () => {
    assert.equal(normalizeDay('mon'), 'MON')
    assert.equal(normalizeDay('Thursday'), 'THU')
    assert.equal(normalizeDay('XYZ'), null)
  })

  it('formats minutes back to HH:MM', () => {
    assert.equal(formatMinutes(480), '08:00')
    assert.equal(formatMinutes(1170), '19:30')
  })

  it('places each entry on its day with its start and end minutes', () => {
    const layout = buildTimetableLayout([
      slot({ dayOfWeek: 'TUE', startTime: '11:00', endTime: '12:30' }),
    ])
    const [placed] = layout.days.TUE
    assert.equal(placed.startMinute, 660)
    assert.equal(placed.endMinute, 750)
    assert.equal(placed.lane, 0)
    assert.equal(placed.laneCount, 1)
    assert.equal(layout.days.MON.length, 0)
  })

  it('puts overlapping entries in separate lanes so neither is hidden', () => {
    const layout = buildTimetableLayout([
      slot({ eventCode: 'AT407', startTime: '09:00', endTime: '12:00' }),
      slot({ eventCode: 'ST326', startTime: '09:00', endTime: '12:00' }),
      slot({ eventCode: 'CS140', startTime: '10:00', endTime: '11:00' }),
    ])
    const lanes = layout.days.MON.map((p) => p.lane).sort()
    assert.deepEqual(lanes, [0, 1, 2])
    assert.ok(layout.days.MON.every((p) => p.laneCount === 3))
  })

  it('treats back-to-back entries as not overlapping', () => {
    const layout = buildTimetableLayout([
      slot({ eventCode: 'A', startTime: '09:00', endTime: '12:00' }),
      slot({ eventCode: 'B', startTime: '12:00', endTime: '15:00' }),
    ])
    assert.ok(layout.days.MON.every((p) => p.lane === 0 && p.laneCount === 1))
  })

  it('reuses a freed lane and only widens the group that overlaps', () => {
    const layout = buildTimetableLayout([
      slot({ eventCode: 'A', startTime: '08:00', endTime: '10:00' }),
      slot({ eventCode: 'B', startTime: '09:00', endTime: '11:00' }),
      slot({ eventCode: 'C', startTime: '10:00', endTime: '12:00' }),
      slot({ eventCode: 'D', startTime: '13:00', endTime: '14:00' }),
    ])
    const byCode = Object.fromEntries(layout.days.MON.map((p) => [p.slot.eventCode, p]))
    assert.equal(byCode.A.lane, 0)
    assert.equal(byCode.B.lane, 1)
    assert.equal(byCode.C.lane, 0, 'C starts when A ends, so it reuses lane 0')
    assert.equal(byCode.A.laneCount, 2)
    assert.equal(byCode.D.laneCount, 1, 'D does not overlap anything')
  })

  it('fits the grid to the earliest and latest entries, rounded to whole hours', () => {
    const layout = buildTimetableLayout([
      slot({ startTime: '08:00', endTime: '09:30' }),
      slot({ dayOfWeek: 'FRI', startTime: '18:00', endTime: '19:30' }),
    ])
    assert.equal(layout.startMinute, 480)
    assert.equal(layout.endMinute, 1200)
  })

  it('handles entries at the very start and end of the day', () => {
    const layout = buildTimetableLayout([
      slot({ eventCode: 'EARLY', startTime: '00:00', endTime: '01:00' }),
      slot({ eventCode: 'LATE', startTime: '23:00', endTime: '24:00' }),
    ])
    assert.equal(layout.startMinute, 0)
    assert.equal(layout.endMinute, 1440)
    assert.equal(layout.days.MON.length, 2)
  })

  it('skips malformed times and unknown days without losing them', () => {
    const bad = [
      slot({ eventCode: 'DOT', startTime: '13.00', endTime: '15.00' }),
      slot({ eventCode: 'BACKWARDS', startTime: '12:00', endTime: '10:00' }),
      slot({ eventCode: 'NODAY', dayOfWeek: '' }),
    ]
    const layout = buildTimetableLayout([...bad, slot({ eventCode: 'OK' })])
    assert.deepEqual(
      layout.skipped.map((s) => s.eventCode),
      ['DOT', 'BACKWARDS', 'NODAY']
    )
    assert.deepEqual(
      layout.days.MON.map((p) => p.slot.eventCode),
      ['OK']
    )
  })

  it('returns an empty layout for no entries', () => {
    const layout = buildTimetableLayout([])
    assert.equal(layout.startMinute, 0)
    assert.equal(layout.endMinute, 0)
    assert.equal(layout.skipped.length, 0)
  })

  describe('blockHeight()', () => {
    it('uses the real duration when it is long enough', () => {
      assert.equal(blockHeight({ startMinute: 540, endMinute: 630, nextStartInLane: null }, 1, 1200), 88)
    })

    it('stretches a very short entry to the minimum so it stays tappable', () => {
      assert.equal(blockHeight({ startMinute: 540, endMinute: 550, nextStartInLane: null }, 0.8, 1200), 16)
    })

    it('never grows into the next entry in the same lane', () => {
      const layout = buildTimetableLayout([
        slot({ eventCode: 'SHORT', startTime: '10:00', endTime: '10:10' }),
        slot({ eventCode: 'NEXT', startTime: '10:10', endTime: '11:00' }),
      ])
      const short = layout.days.MON.find((p) => p.slot.eventCode === 'SHORT')!
      assert.equal(short.nextStartInLane, 600 + 10)
      const height = blockHeight(short, 0.8, layout.endMinute)
      assert.ok(height <= 10 * 0.8, `height ${height} must stop before NEXT starts`)
    })

    it('never grows past the end of the grid', () => {
      assert.ok(blockHeight({ startMinute: 1195, endMinute: 1200, nextStartInLane: null }, 0.8, 1200) <= 4)
    })

    it('stops a short entry from growing into the next overlap group', () => {
      const layout = buildTimetableLayout([
        slot({ eventCode: 'LONG', startTime: '09:00', endTime: '10:00' }),
        slot({ eventCode: 'SHORT', startTime: '09:50', endTime: '10:00' }),
        slot({ eventCode: 'AFTER', startTime: '10:00', endTime: '11:00' }),
      ])
      const short = layout.days.MON.find((p) => p.slot.eventCode === 'SHORT')!
      assert.equal(short.lane, 1)
      assert.equal(short.nextStartInLane, 600, 'AFTER spans the full column from 10:00')
      assert.ok(blockHeight(short, 0.8, layout.endMinute) <= 10 * 0.8)
    })

    it('records the next start only within the same lane', () => {
      const layout = buildTimetableLayout([
        slot({ eventCode: 'A', startTime: '09:00', endTime: '12:00' }),
        slot({ eventCode: 'B', startTime: '09:00', endTime: '10:00' }),
        slot({ eventCode: 'C', startTime: '10:00', endTime: '11:00' }),
      ])
      const byCode = Object.fromEntries(layout.days.MON.map((p) => [p.slot.eventCode, p]))
      assert.equal(byCode.A.nextStartInLane, null)
      assert.equal(byCode.B.nextStartInLane, 600)
      assert.equal(byCode.C.nextStartInLane, null)
    })
  })
})
