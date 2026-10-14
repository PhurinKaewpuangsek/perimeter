/**
 * adminService — write-API wrappers for the admin CRUD endpoints (#81).
 *
 * All functions throw on non-2xx responses so callers can handle errors uniformly.
 * `import.meta.env` is optional-chained so this module can be imported in plain
 * Node test environments (node:test / vitest) without Vite injecting globals.
 */

import { getIdToken } from './authService'

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

function getAuthHeader(): Record<string, string> {
  const token = getIdToken()
  return token ? { Authorization: token } : {}
}

function getWriteHeaders(): Record<string, string> {
  return {
    ...getAuthHeader(),
    'Content-Type': 'application/json',
  }
}

async function handleFetchError(res: Response, fallbackPrefix: string): Promise<never> {
  const err = await res.json().catch(() => ({}))
  if (res.status === 401) {
    throw new Error('Unauthorized: Please log in to perform this action.')
  }
  if (res.status === 403) {
    throw new Error((err as { error?: string }).error ?? 'Forbidden: Insufficient privileges.')
  }
  throw new Error((err as { error?: string; message?: string }).error ?? `${fallbackPrefix} failed (${res.status})`)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateRoomPayload {
  /** Display name stored as name_th in DynamoDB */
  name_th: string
  capacity?: number
}

export interface CreateSchedulePayload {
  room_code: string
  day_of_week: string
  start_time: string
  event_code: string
  end_time?: string
  event_name?: string
  event_type?: string
}

export interface UpdateSchedulePayload {
  day_of_week?: string
  start_time?: string
  event_code?: string
  end_time?: string
  event_name?: string
  event_type?: string
}

export interface CreateScheduleResult {
  message: string
  schedule_slot: string
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/**
 * PUT /api/locations/{location_id}
 * Editable fields: name_th, capacity. (name and nameThai are sync-written by
 * the existing update-location handler.)
 */
export async function updateRoom(
  locationId: string,
  payload: UpdateRoomPayload,
): Promise<void> {
  const url = `${API_BASE_URL}/api/locations/${encodeURIComponent(locationId)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: getWriteHeaders(),
    body: JSON.stringify({
      name: payload.name_th,
      name_th: payload.name_th,
      nameThai: payload.name_th,
      ...(payload.capacity !== undefined ? { capacity: payload.capacity } : {}),
    }),
  })
  if (!res.ok) {
    await handleFetchError(res, 'PUT /api/locations')
  }
}

/**
 * DELETE /api/locations/{location_id}
 */
export async function deleteRoom(locationId: string): Promise<void> {
  const url = `${API_BASE_URL}/api/locations/${encodeURIComponent(locationId)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  if (!res.ok) {
    await handleFetchError(res, 'DELETE /api/locations')
  }
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/**
 * POST /api/schedules
 * The Lambda auto-generates schedule_slot as {day_of_week}#{start_time}#{event_code}.
 */
export async function createSchedule(
  payload: CreateSchedulePayload,
): Promise<CreateScheduleResult> {
  const url = `${API_BASE_URL}/api/schedules`
  const res = await fetch(url, {
    method: 'POST',
    headers: getWriteHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await handleFetchError(res, 'POST /api/schedules')
  }
  return res.json() as Promise<CreateScheduleResult>
}

/**
 * PUT /api/schedules/{room_code}/{schedule_slot}
 * Updatable fields: end_time, event_name, event_type.
 * room_code and schedule_slot must be URL-encoded because schedule_slot
 * contains '#' characters.
 */
export async function updateSchedule(
  roomCode: string,
  scheduleSlot: string,
  payload: UpdateSchedulePayload,
): Promise<void> {
  const url = `${API_BASE_URL}/api/schedules/${encodeURIComponent(roomCode)}/${encodeURIComponent(scheduleSlot)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: getWriteHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await handleFetchError(res, 'PUT /api/schedules')
  }
}

/**
 * DELETE /api/schedules/{room_code}/{schedule_slot}
 */
export async function deleteSchedule(
  roomCode: string,
  scheduleSlot: string,
): Promise<void> {
  const url = `${API_BASE_URL}/api/schedules/${encodeURIComponent(roomCode)}/${encodeURIComponent(scheduleSlot)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  if (!res.ok) {
    await handleFetchError(res, 'DELETE /api/schedules')
  }
}

