import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatExamDateTime,
  formatLocalDate,
  getExamDateLabel,
  isExamSchedule,
} from '../scheduleDisplay.ts'

describe('scheduleDisplay', () => {
  it('identifies exams without case sensitivity', () => {
    assert.equal(isExamSchedule({ eventType: 'EXAM' }), true)
    assert.equal(isExamSchedule({ eventType: 'class' }), false)
  })

  it('formats exam dates and the unannounced-date fallback', () => {
    assert.equal(
      getExamDateLabel({ eventType: 'exam', eventDate: '2026-05-18' }),
      '2026-05-18'
    )
    assert.equal(getExamDateLabel({ eventType: 'exam', eventDate: '' }), 'date to be announced')
    assert.equal(getExamDateLabel({ eventType: 'class', eventDate: '' }), null)
  })

  it('formats exam date and time using Thai day/month labels and Buddhist year', () => {
    assert.equal(
      formatExamDateTime({
        eventDate: '2026-05-18',
        dayOfWeek: 'MON',
        startTime: '13:00',
        endTime: '16:00',
      }),
      'จ. 18 พ.ค. 2569 13:00–16:00'
    )
  })

  it('uses the scheduled weekday when an exam date is not announced', () => {
    assert.equal(
      formatExamDateTime({
        eventDate: '',
        dayOfWeek: 'TUE',
        startTime: '09:00',
        endTime: '12:00',
      }),
      'อ. 09:00–12:00'
    )
  })

  it('formats an explicitly supplied date in local YYYY-MM-DD form', () => {
    assert.equal(formatLocalDate(new Date(2026, 4, 18, 12)), '2026-05-18')
  })
})
