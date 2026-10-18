import { SEMESTER_START, SEMESTER_END, TIMEZONE } from '../config/semester'
import type { PinnedSchedule } from '../types/pin'

export interface CalendarExportOptions {
  semesterStart?: string
  semesterEnd?: string
  timezone?: string
}

export interface IcsExportResult {
  ics: string
  skippedUnannouncedExams: PinnedSchedule[]
}

const DAY_OF_WEEK_MAP: Record<string, number> = {
  SUN: 0,
  SUNDAY: 0,
  MON: 1,
  MONDAY: 1,
  TUE: 2,
  TUESDAY: 2,
  WED: 3,
  WEDNESDAY: 3,
  THU: 4,
  THURSDAY: 4,
  FRI: 5,
  FRIDAY: 5,
  SAT: 6,
  SATURDAY: 6,
}

function findFirstOccurrenceDate(startDateStr: string, dayOfWeekStr: string): string {
  const targetDay = DAY_OF_WEEK_MAP[dayOfWeekStr.toUpperCase().trim()]
  const [year, month, day] = startDateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  if (targetDay !== undefined) {
    const currentDay = d.getUTCDay()
    const diff = (targetDay - currentDay + 7) % 7
    d.setUTCDate(d.getUTCDate() + diff)
  }
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '000000'
  const normalized = timeStr.replace('.', ':').trim()
  const parts = normalized.split(':')
  const hours = parts[0].padStart(2, '0')
  const minutes = (parts[1] || '00').padStart(2, '0')
  return `${hours}${minutes}00`
}

function formatUntilDate(endDateStr: string): string {
  const clean = endDateStr.replace(/-/g, '').trim()
  return `${clean}T235959Z`
}

export function formatEventMetadata(item: PinnedSchedule, isExam: boolean): { title: string; details: string } {
  const title = `${item.eventCode}${item.eventName ? ` - ${item.eventName}` : ''} (${item.roomCode})`
  const details = `วิชา: ${item.eventCode} ${item.eventName || ''}\nห้อง: ${item.roomCode}\nประเภท: ${isExam ? 'การสอบ' : 'การเรียนการสอน'}`
  return { title, details }
}

/** Stable per-pin identifier shared by the .ics UID and the Google Calendar iCalUID. */
export function getEventUid(item: PinnedSchedule): string {
  return `${item.pinKey || `${item.roomCode}#${item.scheduleSlot}`}@perimeter`
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Generates an RFC 5545 compliant .ics calendar file content for the given pinned schedule items.
 */
export function generateIcsContent(
  items: PinnedSchedule[],
  options: CalendarExportOptions = {},
): IcsExportResult {
  const semesterStart = options.semesterStart || SEMESTER_START
  const semesterEnd = options.semesterEnd || SEMESTER_END
  const timezone = options.timezone || TIMEZONE

  const skippedUnannouncedExams: PinnedSchedule[] = []
  const vEvents: string[] = []

  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  items.forEach((item) => {
    const isExam = item.eventType?.toLowerCase() === 'exam'

    if (isExam && !item.eventDate) {
      // Do not invent a date for unannounced exams
      skippedUnannouncedExams.push(item)
      return
    }

    let datePart: string
    let rruleLine = ''

    if (isExam && item.eventDate) {
      datePart = item.eventDate.replace(/-/g, '').trim()
    } else {
      datePart = findFirstOccurrenceDate(semesterStart, item.dayOfWeek)
      const untilUtc = formatUntilDate(semesterEnd)
      rruleLine = `RRULE:FREQ=WEEKLY;UNTIL=${untilUtc}\r\n`
    }

    const startTime = formatTime(item.startTime)
    const endTime = formatTime(item.endTime)
    const uid = getEventUid(item)
    const { title: summary, details: description } = formatEventMetadata(item, isExam)
    const location = `ห้อง ${item.roomCode}`

    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${timezone}:${datePart}T${startTime}`,
      `DTEND;TZID=${timezone}:${datePart}T${endTime}`,
      rruleLine ? rruleLine.trim() : null,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `LOCATION:${escapeIcsText(location)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].filter(Boolean)

    vEvents.push(eventLines.join('\r\n'))
  })

  const timezoneComponents: string[] = []
  if (timezone === 'Asia/Bangkok') {
    timezoneComponents.push(
      [
        'BEGIN:VTIMEZONE',
        'TZID:Asia/Bangkok',
        'BEGIN:STANDARD',
        'DTSTART:19700101T000000',
        'TZOFFSETFROM:+0700',
        'TZOFFSETTO:+0700',
        'TZNAME:ICT',
        'END:STANDARD',
        'END:VTIMEZONE',
      ].join('\r\n')
    )
  }

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Perimeter//Smart Faculty Navigator//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...timezoneComponents,
  ].join('\r\n')

  const footer = 'END:VCALENDAR'

  const ics = [header, ...vEvents, footer].join('\r\n') + '\r\n'

  return { ics, skippedUnannouncedExams }
}

/**
 * Builds a prefilled Google Calendar template URL for a given pinned schedule item.
 * Returns null if the item is an unannounced exam without a known eventDate.
 */
export function buildGoogleCalendarUrl(
  item: PinnedSchedule,
  options: CalendarExportOptions = {},
): string | null {
  const isExam = item.eventType?.toLowerCase() === 'exam'
  if (isExam && !item.eventDate) {
    return null
  }

  const semesterStart = options.semesterStart || SEMESTER_START
  const semesterEnd = options.semesterEnd || SEMESTER_END
  const timezone = options.timezone || TIMEZONE

  let datePart: string
  if (isExam && item.eventDate) {
    datePart = item.eventDate.replace(/-/g, '').trim()
  } else {
    datePart = findFirstOccurrenceDate(semesterStart, item.dayOfWeek)
  }

  const startTime = formatTime(item.startTime)
  const endTime = formatTime(item.endTime)
  const datesParam = `${datePart}T${startTime}/${datePart}T${endTime}`

  const { title, details } = formatEventMetadata(item, isExam)
  const location = `ห้อง ${item.roomCode}, คณะวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยธรรมศาสตร์`

  const params = new URLSearchParams()
  params.set('action', 'TEMPLATE')
  params.set('text', title)
  params.set('dates', datesParam)
  params.set('details', details)
  params.set('location', location)
  params.set('ctz', timezone)

  if (!isExam) {
    const until = formatUntilDate(semesterEnd)
    params.set('recur', `RRULE:FREQ=WEEKLY;UNTIL=${until}`)
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Private extended property stamped on every event we create, so a sync can find (and only touch) its own events. */
export const GOOGLE_EVENT_TAG = { key: 'source', value: 'torch' } as const

export interface GoogleCalendarEventBody {
  iCalUID: string
  summary: string
  description: string
  location: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  recurrence?: string[]
  extendedProperties: { private: Record<string, string> }
}

function toLocalDateTime(datePart: string, time: string): string {
  return `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
}

/**
 * Builds the Google Calendar API (events.import) body for a pinned item, mirroring the .ics output.
 * Returns null for an unannounced exam so no date is invented.
 */
export function buildGoogleCalendarEvent(
  item: PinnedSchedule,
  options: CalendarExportOptions = {},
): GoogleCalendarEventBody | null {
  const isExam = item.eventType?.toLowerCase() === 'exam'
  if (isExam && !item.eventDate) return null

  const timeZone = options.timezone || TIMEZONE
  const datePart =
    isExam && item.eventDate
      ? item.eventDate.replace(/-/g, '').trim()
      : findFirstOccurrenceDate(options.semesterStart || SEMESTER_START, item.dayOfWeek)

  const { title, details } = formatEventMetadata(item, isExam)

  return {
    iCalUID: getEventUid(item),
    summary: title,
    description: details,
    location: `ห้อง ${item.roomCode}`,
    start: { dateTime: toLocalDateTime(datePart, formatTime(item.startTime)), timeZone },
    end: { dateTime: toLocalDateTime(datePart, formatTime(item.endTime)), timeZone },
    ...(isExam
      ? {}
      : { recurrence: [`RRULE:FREQ=WEEKLY;UNTIL=${formatUntilDate(options.semesterEnd || SEMESTER_END)}`] }),
    extendedProperties: { private: { [GOOGLE_EVENT_TAG.key]: GOOGLE_EVENT_TAG.value } },
  }
}

/**
 * Initiates a browser file download of the generated .ics calendar string.
 */
export function downloadIcsFile(filename: string, icsContent: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename.endsWith('.ics') ? filename : `${filename}.ics`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
