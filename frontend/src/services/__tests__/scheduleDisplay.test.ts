import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getExamDateLabel, isExamSchedule } from '../scheduleDisplay.ts'

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
})
