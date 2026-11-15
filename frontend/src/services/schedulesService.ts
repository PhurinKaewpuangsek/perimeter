import type { RawScheduleRecord, ScheduleSlot, SchedulesDataResponse } from '../types/schedule.ts'
import { fetchWithRetry } from './apiClient.ts'

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

export const SCHEDULES_CACHE_TTL_MS = 60 * 1000

export interface GetSchedulesOptions {
  roomCode?: string
  bypassCache?: boolean
}

export async function getSchedules({ roomCode, bypassCache }: GetSchedulesOptions = {}): Promise<ScheduleSlot[]> {
  const url = new URL(SCHEDULES_ENDPOINT || '/api/schedules', globalThis.location?.origin ?? 'http://localhost')
  if (roomCode?.trim()) {
    url.searchParams.set('room_code', roomCode.trim())
  }
  if (bypassCache) {
    url.searchParams.set('fresh', '1')
  }
  const endpoint = API_BASE_URL ? url.toString() : `${url.pathname}${url.search}`
  const init: RequestInit = bypassCache ? { cache: 'no-store' } : {}
  const response = await fetchWithRetry(endpoint, init)

  if (!response.ok) {
    throw new Error(`Failed to fetch schedules: ${response.status} ${response.statusText}`)
  }

  const data: SchedulesDataResponse = await response.json()

  if (!data || !Array.isArray(data.records)) {
    throw new Error('Invalid schedules data format: expected "records" array')
  }

  return data.records.map(normalizeSchedule)
}
