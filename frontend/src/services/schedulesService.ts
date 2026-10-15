import type { RawScheduleRecord, ScheduleSlot, SchedulesDataResponse } from '../types/schedule'

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeSchedule(raw: RawScheduleRecord): ScheduleSlot {
  return {
    roomCode: normalizeText(raw.room_code),
    eventCode: normalizeText(raw.event_code),
    eventName: normalizeText(raw.event_name),
    dayOfWeek: normalizeText(raw.day_of_week),
    startTime: normalizeText(raw.start_time),
    endTime: normalizeText(raw.end_time),
    eventType: normalizeText(raw.event_type),
    eventDate: normalizeText(raw.event_date),
  }
}

/**
 * Base URL of the deployed API Gateway stage, from VITE_API_BASE_URL.
 *
 * `import.meta.env` is optional-chained because unit tests for this module run under
 * plain `node --test`, where Vite never injects it.
 */
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const SCHEDULES_ENDPOINT = `${API_BASE_URL}/api/schedules`

export async function getSchedules(): Promise<ScheduleSlot[]> {
  const response = await fetch(SCHEDULES_ENDPOINT, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Failed to fetch schedules: ${response.status} ${response.statusText}`)
  }

  const data: SchedulesDataResponse = await response.json()

  if (!data || !Array.isArray(data.records)) {
    throw new Error('Invalid schedules data format: expected "records" array')
  }

  return data.records.map(normalizeSchedule)
}
