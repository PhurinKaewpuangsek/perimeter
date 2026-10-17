import { describe, it, expect } from 'vitest'
import {
  generateIcsContent,
  buildGoogleCalendarUrl,
} from '../calendarExport'
import type { PinnedSchedule } from '../../types/pin'

describe('calendarExport service', () => {
  const sampleClass: PinnedSchedule = {
    userId: 'user-1',
    pinKey: 'LC3-105#MON#09:30#CS333',
    roomCode: 'LC3-105',
    scheduleSlot: 'MON#09:30#CS333',
    eventCode: 'CS333',
    eventName: 'Software Engineering',
    dayOfWeek: 'MON',
    startTime: '09:30',
    endTime: '12:30',
    eventType: 'class',
  }

  const sampleAnnouncedExam: PinnedSchedule = {
    userId: 'user-1',
    pinKey: 'LC3-201#WED#13:30#CS102',
    roomCode: 'LC3-201',
    scheduleSlot: 'WED#13:30#CS102',
    eventCode: 'CS102',
    eventName: 'Intro to CS',
    dayOfWeek: 'WED',
    startTime: '13:30',
    endTime: '16:30',
    eventType: 'exam',
    eventDate: '2026-10-21',
  }

  const sampleUnannouncedExam: PinnedSchedule = {
    userId: 'user-1',
    pinKey: 'LC3-205#FRI#09:00#CS999',
    roomCode: 'LC3-205',
    scheduleSlot: 'FRI#09:00#CS999',
    eventCode: 'CS999',
    eventName: 'Special Topics Exam',
    dayOfWeek: 'FRI',
    startTime: '09:00',
    endTime: '12:00',
    eventType: 'exam',
    // Missing eventDate!
  }

  describe('generateIcsContent', () => {
    it('generates standard RFC 5545 calendar with CRLF formatting', () => {
      const { ics, skippedUnannouncedExams } = generateIcsContent([sampleClass])
      expect(ics).toContain('BEGIN:VCALENDAR')
      expect(ics).toContain('VERSION:2.0')
      expect(ics).toContain('PRODID:-//Perimeter//Smart Faculty Navigator//EN')
      expect(ics).toContain('END:VCALENDAR')
      expect(ics).toContain('\r\n')
      expect(skippedUnannouncedExams).toHaveLength(0)
    })

    it('generates weekly recurrence RRULE for recurring classes up to SEMESTER_END', () => {
      const { ics } = generateIcsContent([sampleClass], {
        semesterStart: '2026-08-10', // Monday
        semesterEnd: '2026-12-18',   // Friday
        timezone: 'Asia/Bangkok',
      })

      expect(ics).toContain('BEGIN:VEVENT')
      expect(ics).toContain('SUMMARY:CS333 - Software Engineering (LC3-105)')
      expect(ics).toContain('LOCATION:ห้อง LC3-105')
      expect(ics).toContain('DTSTART;TZID=Asia/Bangkok:20260810T093000')
      expect(ics).toContain('DTEND;TZID=Asia/Bangkok:20260810T123000')
      expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261218T235959Z')
      expect(ics).toContain('END:VEVENT')
    })

    it('calculates the first occurrence correctly when semesterStart is not the same weekday', () => {
      const wednesdayClass: PinnedSchedule = {
        ...sampleClass,
        dayOfWeek: 'WED',
        scheduleSlot: 'WED#09:30#CS333',
      }

      const { ics } = generateIcsContent([wednesdayClass], {
        semesterStart: '2026-08-10', // Monday
        semesterEnd: '2026-12-18',
        timezone: 'Asia/Bangkok',
      })

      // The first Wednesday on or after 2026-08-10 is 2026-08-12
      expect(ics).toContain('DTSTART;TZID=Asia/Bangkok:20260812T093000')
      expect(ics).toContain('DTEND;TZID=Asia/Bangkok:20260812T123000')
    })

    it('exports announced exams using their eventDate without RRULE recurrence', () => {
      const { ics } = generateIcsContent([sampleAnnouncedExam], {
        timezone: 'Asia/Bangkok',
      })

      expect(ics).toContain('BEGIN:VEVENT')
      expect(ics).toContain('DTSTART;TZID=Asia/Bangkok:20261021T133000')
      expect(ics).toContain('DTEND;TZID=Asia/Bangkok:20261021T163000')
      expect(ics).not.toContain('RRULE:')
      expect(ics).toContain('SUMMARY:CS102 - Intro to CS (LC3-201)')
    })

    it('skips unannounced exams without inventing a date and reports them to the caller', () => {
      const { ics, skippedUnannouncedExams } = generateIcsContent([
        sampleClass,
        sampleUnannouncedExam,
      ])

      // Should not contain an event for the unannounced exam
      expect(ics).toContain('CS333')
      expect(ics).not.toContain('CS999')
      expect(skippedUnannouncedExams).toHaveLength(1)
      expect(skippedUnannouncedExams[0].eventCode).toBe('CS999')
    })
  })

  describe('buildGoogleCalendarUrl', () => {
    it('builds prefilled Google Calendar template URL for weekly class with recurrence', () => {
      const url = buildGoogleCalendarUrl(sampleClass, {
        semesterStart: '2026-08-10',
        semesterEnd: '2026-12-18',
        timezone: 'Asia/Bangkok',
      })

      expect(url).not.toBeNull()
      const parsed = new URL(url!)
      expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render')
      expect(parsed.searchParams.get('action')).toBe('TEMPLATE')
      expect(parsed.searchParams.get('text')).toBe('CS333 - Software Engineering (LC3-105)')
      expect(parsed.searchParams.get('ctz')).toBe('Asia/Bangkok')
      expect(parsed.searchParams.get('dates')).toBe('20260810T093000/20260810T123000')
      expect(parsed.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;UNTIL=20261218T235959Z')
    })

    it('builds Google Calendar URL for announced exam without recurrence', () => {
      const url = buildGoogleCalendarUrl(sampleAnnouncedExam, {
        timezone: 'Asia/Bangkok',
      })

      expect(url).not.toBeNull()
      expect(url).toContain('20261021T133000%2F20261021T163000')
      expect(url).not.toContain('recur=')
    })

    it('returns null for unannounced exams to prevent inventing fake calendar dates', () => {
      const url = buildGoogleCalendarUrl(sampleUnannouncedExam)
      expect(url).toBeNull()
    })
  })
})
