import type { DayOfWeek, EventType, ScheduleSlot } from '../types/schedule'

export interface CandidateScheduleSlot {
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  eventType?: EventType
  eventDate?: string | null
  excludeSlotId?: string | null
}

/**
 * Builds the canonical composite sort key (`DAY#START#EVENT_CODE`) used by DynamoDB
 * and the `/api/schedules` endpoints.
 */
export function buildScheduleSlotId(slot: Pick<ScheduleSlot, 'dayOfWeek' | 'startTime' | 'eventCode'>): string {
  return `${slot.dayOfWeek}#${slot.startTime}#${slot.eventCode}`
}

/**
 * Checks whether two `HH:mm` time intervals overlap (`startA < endB && endA > startB`).
 * Adjacent intervals (e.g. `09:00–10:30` and `10:30–12:00`) do NOT overlap.
 */
export function timeIntervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  if (!startA || !endA || !startB || !endB) return false
  if (endA <= startA || endB <= startB) return false
  return startA < endB && endA > startB
}

/**
 * Checks whether an existing `ScheduleSlot` conflicts with a candidate schedule slot.
 * - Must share the same `dayOfWeek`.
 * - If both slots carry specific `eventDate` values (e.g. two dated exams/events),
 *   they only conflict when `eventDate` matches.
 * - Time intervals must overlap (`startA < endB && endA > startB`).
 */
export function schedulesOverlap(
  existing: ScheduleSlot,
  candidate: CandidateScheduleSlot,
): boolean {
  if (
    candidate.excludeSlotId &&
    buildScheduleSlotId(existing) === candidate.excludeSlotId
  ) {
    return false
  }
  if (existing.dayOfWeek !== candidate.dayOfWeek) return false

  const existingDate = existing.eventDate ?? null
  const candidateDate = candidate.eventDate ?? null
  if (existingDate && candidateDate && existingDate !== candidateDate) {
    return false
  }

  return timeIntervalsOverlap(
    existing.startTime,
    existing.endTime,
    candidate.startTime,
    candidate.endTime,
  )
}

/**
 * Returns all `ScheduleSlot` items in `roomCode` that overlap with `candidate`.
 */
export function findRoomConflicts(
  schedules: ScheduleSlot[],
  roomCode: string,
  candidate: CandidateScheduleSlot,
): ScheduleSlot[] {
  return schedules.filter(
    (slot) => slot.roomCode === roomCode && schedulesOverlap(slot, candidate),
  )
}

/**
 * Computes a map of `roomCode -> conflicting ScheduleSlot[]` across all rooms
 * for the given candidate time window.
 */
export function getRoomAvailabilityMap(
  schedules: ScheduleSlot[],
  candidate: CandidateScheduleSlot,
): Map<string, ScheduleSlot[]> {
  const map = new Map<string, ScheduleSlot[]>()
  for (const slot of schedules) {
    if (schedulesOverlap(slot, candidate)) {
      const existing = map.get(slot.roomCode)
      if (existing) {
        existing.push(slot)
      } else {
        map.set(slot.roomCode, [slot])
      }
    }
  }
  return map
}
