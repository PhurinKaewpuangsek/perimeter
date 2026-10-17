import type { ScheduleSlot } from '../types/schedule.ts'

/** Days of the timetable in display order (Monday first). */
export const TIMETABLE_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

export type TimetableDay = (typeof TIMETABLE_DAYS)[number]

const DAY_ALIASES: Record<string, TimetableDay> = {
  MON: 'MON',
  MONDAY: 'MON',
  TUE: 'TUE',
  TUESDAY: 'TUE',
  WED: 'WED',
  WEDNESDAY: 'WED',
  THU: 'THU',
  THURSDAY: 'THU',
  FRI: 'FRI',
  FRIDAY: 'FRI',
  SAT: 'SAT',
  SATURDAY: 'SAT',
  SUN: 'SUN',
  SUNDAY: 'SUN',
}

/** One schedule entry placed on the grid. */
export interface PlacedSlot {
  slot: ScheduleSlot
  day: TimetableDay
  startMinute: number
  endMinute: number
  /** Sub-column this entry sits in when it overlaps others (0-based). */
  lane: number
  /** Number of sub-columns its overlap group needs; 1 when nothing overlaps. */
  laneCount: number
  /** Minute where free space below this block ends (next entry in its lane or next overlap group), or null. */
  nextStartInLane: number | null
}

export interface TimetableLayout {
  days: Record<TimetableDay, PlacedSlot[]>
  /** First minute shown on the grid, rounded down to the hour. */
  startMinute: number
  /** Last minute shown on the grid, rounded up to the hour. */
  endMinute: number
  /** Entries that cannot be placed (unknown day or malformed time), so the UI can still list them. */
  skipped: ScheduleSlot[]
}

/** Converts "HH:MM" to minutes after midnight, or null when the value is not a valid time. */
export function parseTimeToMinutes(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null
  return hours * 60 + minutes
}

/** Maps MON / Monday / monday to a timetable day, or null when unknown. */
export function normalizeDay(value: string | undefined): TimetableDay | null {
  return DAY_ALIASES[(value ?? '').trim().toUpperCase()] ?? null
}

/** Formats minutes after midnight as "HH:MM". */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Assigns lanes so overlapping entries sit side by side. Entries that only touch
 * (one ends at 12:00, the next starts at 12:00) do not overlap and share a lane.
 */
function assignLanes(entries: Omit<PlacedSlot, 'lane' | 'laneCount' | 'nextStartInLane'>[]): PlacedSlot[] {
  const sorted = [...entries].sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      a.endMinute - b.endMinute ||
      a.slot.eventCode.localeCompare(b.slot.eventCode)
  )

  const placed: PlacedSlot[] = []
  const groupStarts: number[] = []
  const groupOf = new Map<PlacedSlot, number>()
  let group: PlacedSlot[] = []
  let groupEnd = -1
  let laneEnds: number[] = []

  /** Ends the current overlap group: every entry in it gets the group's lane count. */
  const closeGroup = () => {
    const laneCount = Math.max(1, laneEnds.length)
    for (const item of group) {
      item.laneCount = laneCount
      groupOf.set(item, groupStarts.length)
    }
    groupStarts.push(group[0].startMinute)
    placed.push(...group)
    group = []
    laneEnds = []
  }

  for (const entry of sorted) {
    if (group.length > 0 && entry.startMinute >= groupEnd) closeGroup()

    let lane = laneEnds.findIndex((end) => end <= entry.startMinute)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(entry.endMinute)
    } else {
      laneEnds[lane] = entry.endMinute
    }

    group.push({ ...entry, lane, laneCount: 1, nextStartInLane: null })
    groupEnd = group.length === 1 ? entry.endMinute : Math.max(groupEnd, entry.endMinute)
  }
  if (group.length > 0) closeGroup()

  // Where the space below each block ends: the next entry in the same lane of its group,
  // or the start of the next overlap group (whose blocks may span the whole column).
  for (const [index, item] of placed.entries()) {
    const groupIndex = groupOf.get(item)!
    const nextInLane = placed
      .slice(index + 1)
      .find((other) => groupOf.get(other) === groupIndex && other.lane === item.lane)
    const nextGroupStart = groupStarts[groupIndex + 1] ?? null
    const candidates = [nextInLane?.startMinute, nextGroupStart].filter(
      (value): value is number => typeof value === 'number'
    )
    item.nextStartInLane = candidates.length > 0 ? Math.min(...candidates) : null
  }

  return placed
}

/**
 * Pixel height of an entry's block. Short entries are stretched to `minPx` so they stay
 * tappable, but never past the start of the next entry in the same lane or the grid end.
 */
export function blockHeight(
  item: Pick<PlacedSlot, 'startMinute' | 'endMinute' | 'nextStartInLane'>,
  pxPerMinute: number,
  gridEndMinute: number,
  { minPx = 16, gapPx = 2 }: { minPx?: number; gapPx?: number } = {}
): number {
  const natural = (item.endMinute - item.startMinute) * pxPerMinute - gapPx
  const limitMinute = Math.min(item.nextStartInLane ?? gridEndMinute, gridEndMinute)
  const available = (limitMinute - item.startMinute) * pxPerMinute - gapPx
  return Math.max(0, Math.min(Math.max(natural, minPx), available))
}

/** Places schedule entries on a Monday-to-Sunday grid. */
export function buildTimetableLayout(slots: ScheduleSlot[]): TimetableLayout {
  const byDay = Object.fromEntries(
    TIMETABLE_DAYS.map((day) => [day, [] as Omit<PlacedSlot, 'lane' | 'laneCount' | 'nextStartInLane'>[]])
  ) as Record<TimetableDay, Omit<PlacedSlot, 'lane' | 'laneCount' | 'nextStartInLane'>[]>
  const skipped: ScheduleSlot[] = []

  let earliest = Infinity
  let latest = -Infinity

  for (const slot of slots) {
    const day = normalizeDay(slot.dayOfWeek)
    const startMinute = parseTimeToMinutes(slot.startTime)
    const endMinute = parseTimeToMinutes(slot.endTime)

    if (!day || startMinute === null || endMinute === null || endMinute <= startMinute) {
      skipped.push(slot)
      continue
    }

    byDay[day].push({ slot, day, startMinute, endMinute })
    earliest = Math.min(earliest, startMinute)
    latest = Math.max(latest, endMinute)
  }

  const days = Object.fromEntries(
    TIMETABLE_DAYS.map((day) => [day, assignLanes(byDay[day])])
  ) as Record<TimetableDay, PlacedSlot[]>

  const hasEntries = earliest !== Infinity
  return {
    days,
    startMinute: hasEntries ? Math.floor(earliest / 60) * 60 : 0,
    endMinute: hasEntries ? Math.ceil(latest / 60) * 60 : 0,
    skipped,
  }
}
