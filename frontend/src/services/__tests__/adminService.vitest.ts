/**
 * adminService unit tests — vitest
 *
 * Seam: the public HTTP-contract surface of each exported function.
 * Each test verifies the correct method/URL/headers/body are sent and
 * that the function returns/throws correctly based on the HTTP response.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  updateRoom,
  deleteRoom,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../adminService'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response),
  )
}

function lastFetch(): { url: string; init: RequestInit } {
  const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
  const [url, init] = calls[calls.length - 1]
  return { url: url as string, init: init as RequestInit }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// updateRoom
// ---------------------------------------------------------------------------

describe('updateRoom', () => {
  it('sends PUT to /api/locations/{id} with name and capacity fields', async () => {
    mockFetch(200, { message: 'ok' })
    await updateRoom('LC3-F1-R101', { name_th: 'ห้องเรียน 101', capacity: 40 })

    const { url, init } = lastFetch()
    expect(url).toContain('/api/locations/LC3-F1-R101')
    expect(init.method).toBe('PUT')
    const parsed = JSON.parse(init.body as string)
    expect(parsed.name_th).toBe('ห้องเรียน 101')
    expect(parsed.capacity).toBe(40)
  })

  it('sends PUT without capacity when not provided', async () => {
    mockFetch(200, { message: 'ok' })
    await updateRoom('LC3-F1-R102', { name_th: 'ห้องสมุด' })

    const { init } = lastFetch()
    const parsed = JSON.parse(init.body as string)
    expect(parsed).not.toHaveProperty('capacity')
  })

  it('includes Authorization header when token is available in session', async () => {
    localStorage.setItem(
      'perimeter_auth_session',
      JSON.stringify({
        idToken: 'mock-jwt-token',
        expiresAt: Date.now() + 100000,
        user: { email: 'staff@torch.dev', groups: ['staff'] },
      }),
    )
    mockFetch(200, { message: 'ok' })
    await updateRoom('LC3-F1-R101', { name_th: 'ห้อง 101' })

    const { init } = lastFetch()
    expect((init.headers as Record<string, string>)['Authorization']).toBe('mock-jwt-token')
  })

  it('throws friendly message when response is 401', async () => {
    mockFetch(401, { message: 'Unauthorized' })
    await expect(updateRoom('x', { name_th: 'test' })).rejects.toThrow(/Unauthorized/)
  })

  it('throws friendly message when response is 403', async () => {
    mockFetch(403, { error: 'Forbidden: Insufficient privileges.' })
    await expect(updateRoom('x', { name_th: 'test' })).rejects.toThrow(/Forbidden/)
  })

  it('throws when response is not ok', async () => {
    mockFetch(400, { error: 'No fields provided for update' })
    await expect(updateRoom('x', { name_th: '' })).rejects.toThrow('No fields provided for update')
  })
})

// ---------------------------------------------------------------------------
// deleteRoom
// ---------------------------------------------------------------------------

describe('deleteRoom', () => {
  it('sends DELETE to /api/locations/{id}', async () => {
    mockFetch(200, { message: 'Room deleted successfully' })
    await deleteRoom('LC3-F1-R101')

    const { url, init } = lastFetch()
    expect(url).toContain('/api/locations/LC3-F1-R101')
    expect(init.method).toBe('DELETE')
  })

  it('throws when response is not ok', async () => {
    mockFetch(500, { error: 'Internal server error' })
    await expect(deleteRoom('bad-id')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// createSchedule
// ---------------------------------------------------------------------------

describe('createSchedule', () => {
  it('sends POST to /api/schedules with all required fields', async () => {
    mockFetch(200, { message: 'Schedule created successfully', schedule_slot: 'MON#09:00#CS333' })
    const result = await createSchedule({
      room_code: 'LC3-301',
      day_of_week: 'MON',
      start_time: '09:00',
      event_code: 'CS333',
      event_name: 'Computer Networks',
      event_type: 'lecture',
    })

    const { url, init } = lastFetch()
    expect(url).toContain('/api/schedules')
    expect(init.method).toBe('POST')
    const parsed = JSON.parse(init.body as string)
    expect(parsed.room_code).toBe('LC3-301')
    expect(parsed.day_of_week).toBe('MON')
    expect(result.schedule_slot).toBe('MON#09:00#CS333')
  })

  it('sends event_date for exam rows', async () => {
    mockFetch(200, { message: 'Schedule created successfully', schedule_slot: 'MON#13:00#BAS350' })
    await createSchedule({
      room_code: 'LC3-103',
      day_of_week: 'MON',
      start_time: '13:00',
      event_code: 'BAS350',
      event_type: 'exam',
      event_date: '2026-05-18',
    })

    const parsed = JSON.parse(lastFetch().init.body as string)
    expect(parsed.event_date).toBe('2026-05-18')
  })

  it('throws the API date error message so the form can show it', async () => {
    mockFetch(400, { error: 'Invalid event_date: use a real calendar date in YYYY-MM-DD format' })
    await expect(
      createSchedule({
        room_code: 'x', day_of_week: 'MON', start_time: '09:00', event_code: 'X', event_type: 'exam', event_date: '2026-02-30',
      }),
    ).rejects.toThrow('Invalid event_date')
  })

  it('throws when response is not ok', async () => {
    mockFetch(400, { error: 'Missing required fields' })
    await expect(
      createSchedule({ room_code: 'x', day_of_week: 'MON', start_time: '09:00', event_code: 'X' }),
    ).rejects.toThrow('Missing required fields')
  })
})

// ---------------------------------------------------------------------------
// updateSchedule
// ---------------------------------------------------------------------------

describe('updateSchedule', () => {
  it('sends PUT to /api/schedules/{room_code}/{schedule_slot}', async () => {
    mockFetch(200, { message: 'ok' })
    await updateSchedule('LC3-301', 'MON#09:00#CS333', { end_time: '12:00' })

    const { url, init } = lastFetch()
    // schedule_slot contains '#' which must be URL-encoded
    expect(url).toContain('/api/schedules/LC3-301/MON%2309%3A00%23CS333')
    expect(init.method).toBe('PUT')
  })

  it('sends event_date, and null to clear it', async () => {
    mockFetch(200, { message: 'ok' })
    await updateSchedule('LC3-103', 'MON#13:00#BAS350', { event_date: '2026-05-18' })
    expect(JSON.parse(lastFetch().init.body as string).event_date).toBe('2026-05-18')

    await updateSchedule('LC3-103', 'MON#13:00#BAS350', { event_date: null })
    const parsed = JSON.parse(lastFetch().init.body as string)
    expect('event_date' in parsed).toBe(true)
    expect(parsed.event_date).toBeNull()
  })

  it('throws when response is not ok', async () => {
    mockFetch(400, { error: 'No updatable fields' })
    await expect(updateSchedule('x', 'y', {})).rejects.toThrow()
  })

  it('moves a row: path keeps the current room, body names the target room', async () => {
    mockFetch(200, { message: 'Schedule moved successfully' })
    await updateSchedule('LC3-104', 'MON#09:00#CS333', { room_code: 'LC3-105', location_id: 'LC3-F1-R105' })

    const { url, init } = lastFetch()
    expect(url).toContain('/api/schedules/LC3-104/MON%2309%3A00%23CS333')
    expect(JSON.parse(init.body as string)).toEqual({ room_code: 'LC3-105', location_id: 'LC3-F1-R105' })
  })

  it('shows the API conflict message on 409', async () => {
    mockFetch(409, { error: 'มีรายการเวลา/รหัสเดียวกันในห้องนั้นแล้ว' })
    await expect(updateSchedule('LC3-104', 'MON#09:00#CS333', { room_code: 'LC3-105' })).rejects.toThrow(
      'มีรายการเวลา/รหัสเดียวกันในห้องนั้นแล้ว',
    )
  })

  it('falls back to a Thai conflict message on 409 without a body', async () => {
    mockFetch(409, {})
    await expect(updateSchedule('x', 'y', {})).rejects.toThrow('มีรายการเวลา/รหัสเดียวกันในห้องนั้นแล้ว')
  })

  it('translates "Target room not found" (400) into a readable message', async () => {
    mockFetch(400, { error: 'Target room not found' })
    await expect(updateSchedule('x', 'y', { room_code: 'LC3-999' })).rejects.toThrow('ไม่พบห้องปลายทาง')
  })

  it('keeps other 400 messages from the API, e.g. the exam date rule', async () => {
    mockFetch(400, { error: 'event_date is required for exam rows (YYYY-MM-DD)' })
    await expect(updateSchedule('x', 'y', {})).rejects.toThrow(/event_date is required/)
  })
})

// ---------------------------------------------------------------------------
// deleteSchedule
// ---------------------------------------------------------------------------

describe('deleteSchedule', () => {
  it('sends DELETE to /api/schedules/{room_code}/{schedule_slot}', async () => {
    mockFetch(200, { message: 'Schedule deleted successfully' })
    await deleteSchedule('LC3-301', 'MON#09:00#CS333')

    const { url, init } = lastFetch()
    expect(url).toContain('/api/schedules/LC3-301/MON%2309%3A00%23CS333')
    expect(init.method).toBe('DELETE')
  })

  it('throws when response is not ok', async () => {
    mockFetch(500, { error: 'DynamoDB error' })
    await expect(deleteSchedule('x', 'y')).rejects.toThrow()
  })
})
