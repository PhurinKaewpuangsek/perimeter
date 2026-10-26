import type { RawRoomRecord, Room, RoomsDataResponse } from '../types/room.ts'
import { fetchWithRetry } from './apiClient.ts'

export function normalizeRoom(raw: RawRoomRecord): Room {
  const roomCode = raw.room_code ?? ''
  const derivedRoomNumber =
    raw.room_number ??
    (roomCode.includes('-') ? roomCode.substring(roomCode.indexOf('-') + 1) : roomCode)

  return {
    id: raw.location_id ?? '',
    code: roomCode,
    nameThai: raw.name_th ?? '',
    building: raw.building_code ?? '',
    floor: typeof raw.floor === 'number' ? raw.floor : Number(raw.floor) || 0,
    roomNumber: derivedRoomNumber,
    category: raw.category ?? '',
    coordinates: {
      x: typeof raw.x === 'number' ? raw.x : Number(raw.x) || 0,
      y: typeof raw.y === 'number' ? raw.y : Number(raw.y) || 0,
    },
    landmarks: Array.isArray(raw.landmarks) ? raw.landmarks : [],
    aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
    ...normalizeCapacity(raw.capacity),
  }
}

/**
 * Capacity saved through PUT /api/locations/{id}. update-location stores a number, but
 * keeps the raw value when it does not parse, so a string may come back. Only a real
 * non-negative number is kept; otherwise the key is left off, matching rooms that were
 * never given one.
 */
function normalizeCapacity(value: unknown): Pick<Room, 'capacity'> {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? { capacity: parsed } : {}
}

/**
 * Base URL of the deployed API Gateway stage, from VITE_API_BASE_URL.
 *
 * `import.meta.env` is optional-chained because the unit tests for this module run
 * under plain `node --test`, where Vite never injects it. Trailing slashes are
 * stripped so this matches how RoomDetailModal builds its own request URLs.
 */
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const ROOMS_ENDPOINT = `${API_BASE_URL}/api/locations`

export interface GetRoomsOptions {
  bypassCache?: boolean
}

export async function getRooms({ bypassCache }: GetRoomsOptions = {}): Promise<Room[]> {
  const url = new URL(ROOMS_ENDPOINT || '/api/locations', globalThis.location?.origin ?? 'http://localhost')
  if (bypassCache) {
    url.searchParams.set('fresh', '1')
  }
  const endpoint = API_BASE_URL ? url.toString() : `${url.pathname}${url.search}`
  const init: RequestInit = bypassCache ? { cache: 'no-store' } : {}
  const response = await fetchWithRetry(endpoint, init)

  if (!response.ok) {
    throw new Error(`Failed to fetch rooms: ${response.status} ${response.statusText}`)
  }

  const data: RoomsDataResponse = await response.json()

  if (!data || !Array.isArray(data.records)) {
    throw new Error('Invalid rooms data format: expected "records" array')
  }

  return data.records.map(normalizeRoom)
}
