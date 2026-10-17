import { getIdToken } from './authService'
import type { PinnedSchedule, RawPinRecord, PinsDataResponse } from '../types/pin'

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
export const PINS_ENDPOINT = `${API_BASE_URL}/api/pins`

function normalizeText(val: unknown): string {
  return typeof val === 'string' ? val.trim() : ''
}

export function normalizePin(raw: RawPinRecord): PinnedSchedule {
  return {
    userId: normalizeText(raw.user_id ?? raw.userId),
    pinKey: normalizeText(raw.pin_key ?? raw.pinKey),
    roomCode: normalizeText(raw.room_code ?? raw.roomCode),
    scheduleSlot: normalizeText(raw.schedule_slot ?? raw.scheduleSlot),
    eventCode: normalizeText(raw.event_code ?? raw.eventCode),
    eventName: normalizeText(raw.event_name ?? raw.eventName),
    dayOfWeek: normalizeText(raw.day_of_week ?? raw.dayOfWeek),
    startTime: normalizeText(raw.start_time ?? raw.startTime),
    endTime: normalizeText(raw.end_time ?? raw.endTime),
    eventType: normalizeText(raw.event_type ?? raw.eventType) || 'class',
    eventDate: normalizeText(raw.event_date ?? raw.eventDate),
    createdAt: normalizeText(raw.created_at ?? raw.createdAt),
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = getIdToken()
  return token ? { Authorization: token } : {}
}

async function handlePinError(res: Response, fallbackPrefix: string): Promise<never> {
  const err = await res.json().catch(() => ({}))
  if (res.status === 401) {
    throw new Error('Unauthorized: Please log in to manage your schedule pins.')
  }
  if (res.status === 403) {
    throw new Error((err as { error?: string }).error ?? 'Forbidden: Access denied.')
  }
  throw new Error((err as { error?: string; message?: string }).error ?? `${fallbackPrefix} failed (${res.status})`)
}

export async function getPins(): Promise<PinnedSchedule[]> {
  const response = await fetch(PINS_ENDPOINT, {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    await handlePinError(response, 'Fetching pins')
  }

  const data: PinsDataResponse = await response.json()
  if (!data || !Array.isArray(data.records)) {
    return []
  }

  return data.records.map(normalizePin)
}

export interface CreatePinPayload {
  roomCode?: string
  room_code?: string
  scheduleSlot?: string
  schedule_slot?: string
  eventCode?: string
  event_code?: string
  eventName?: string
  event_name?: string
  dayOfWeek?: string
  day_of_week?: string
  startTime?: string
  start_time?: string
  endTime?: string
  end_time?: string
  eventType?: string
  event_type?: string
  eventDate?: string
  event_date?: string
}

export async function createPin(
  payload: CreatePinPayload,
): Promise<PinnedSchedule> {
  const room_code = payload.room_code || payload.roomCode || ''
  const schedule_slot = payload.schedule_slot || payload.scheduleSlot || ''
  const event_code = payload.eventCode || payload.event_code || ''
  const event_name = payload.eventName || payload.event_name || ''
  const day_of_week = payload.dayOfWeek || payload.day_of_week || ''
  const start_time = payload.startTime || payload.start_time || ''
  const end_time = payload.endTime || payload.end_time || ''
  const event_type = payload.eventType || payload.event_type
  const event_date = payload.eventDate || payload.event_date

  const bodyData = {
    room_code,
    schedule_slot,
    ...(event_code && { event_code }),
    ...(event_name && { event_name }),
    ...(day_of_week && { day_of_week }),
    ...(start_time && { start_time }),
    ...(end_time && { end_time }),
    ...(event_type && { event_type }),
    ...(event_date && { event_date }),
  }

  const response = await fetch(PINS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(bodyData),
  })

  if (!response.ok) {
    await handlePinError(response, 'Pinning schedule')
  }

  const data = await response.json()
  return normalizePin(data.pin || data)
}

export async function deletePin(roomCode: string, scheduleSlot: string): Promise<void> {
  const encodedRoom = encodeURIComponent(roomCode)
  const encodedSlot = encodeURIComponent(scheduleSlot)
  const url = `${PINS_ENDPOINT}/${encodedRoom}/${encodedSlot}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  })

  if (!response.ok) {
    await handlePinError(response, 'Deleting pin')
  }
}
