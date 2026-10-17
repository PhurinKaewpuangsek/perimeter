import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizePin,
  getPins,
  createPin,
  deletePin,
} from '../pinsService'
import * as authService from '../authService'

describe('pinsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(authService, 'getIdToken').mockReturnValue('mock-id-token')
  })

  describe('normalizePin', () => {
    it('normalizes raw snake_case DynamoDB record into PinnedSchedule', () => {
      const normalized = normalizePin({
        user_id: 'sub-1',
        pin_key: 'LC3-105#MON#09:00#CS333',
        room_code: 'LC3-105',
        schedule_slot: 'MON#09:00#CS333',
        event_code: 'CS333',
        event_name: 'Software Engineering',
        day_of_week: 'MON',
        start_time: '09:00',
        end_time: '12:00',
        event_type: 'class',
        event_date: '2026-05-18',
        created_at: '2026-10-17T00:00:00Z',
      })

      expect(normalized).toEqual({
        userId: 'sub-1',
        pinKey: 'LC3-105#MON#09:00#CS333',
        roomCode: 'LC3-105',
        scheduleSlot: 'MON#09:00#CS333',
        eventCode: 'CS333',
        eventName: 'Software Engineering',
        dayOfWeek: 'MON',
        startTime: '09:00',
        endTime: '12:00',
        eventType: 'class',
        eventDate: '2026-05-18',
        createdAt: '2026-10-17T00:00:00Z',
      })
    })

    it('falls back to empty strings when optional fields are missing', () => {
      const normalized = normalizePin({})
      expect(normalized.roomCode).toBe('')
      expect(normalized.scheduleSlot).toBe('')
      expect(normalized.eventType).toBe('class')
      expect(normalized.eventDate).toBe('')
    })
  })

  describe('getPins', () => {
    it('fetches pins with Authorization header and returns normalized list', async () => {
      const mockRawPins = [
        {
          user_id: 'sub-1',
          pin_key: 'LC3-105#MON#09:00#CS333',
          room_code: 'LC3-105',
          schedule_slot: 'MON#09:00#CS333',
          event_code: 'CS333',
        },
      ]

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ records: mockRawPins }),
      } as unknown as Response)

      const result = await getPins()

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/pins$/),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'mock-id-token',
          }),
        }),
      )
      expect(result).toHaveLength(1)
      expect(result[0].roomCode).toBe('LC3-105')
      expect(result[0].eventCode).toBe('CS333')
    })

    it('throws error on 401 Unauthorized', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      } as unknown as Response)

      await expect(getPins()).rejects.toThrow(/Unauthorized/i)
    })
  })

  describe('createPin', () => {
    it('sends POST request with JSON body and Authorization header', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pin: {
            user_id: 'sub-1',
            room_code: 'LC3-105',
            schedule_slot: 'MON#09:00#CS333',
            event_code: 'CS333',
          },
        }),
      } as unknown as Response)

      const payload = {
        roomCode: 'LC3-105',
        scheduleSlot: 'MON#09:00#CS333',
        eventCode: 'CS333',
      }

      const result = await createPin(payload)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/pins$/),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'mock-id-token',
          }),
          body: JSON.stringify({
            room_code: 'LC3-105',
            schedule_slot: 'MON#09:00#CS333',
            event_code: 'CS333',
          }),
        }),
      )
      expect(result.roomCode).toBe('LC3-105')
    })
  })

  describe('deletePin', () => {
    it('sends DELETE request with URL-encoded parameters and Authorization header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'Deleted' }),
      } as unknown as Response)
      globalThis.fetch = mockFetch

      await deletePin('LC3-101/1', 'MON#09:00#CS333')

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('/api/pins/LC3-101%2F1/MON%2309%3A00%23CS333')
      expect(mockFetch.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'mock-id-token',
          }),
        }),
      )
    })
  })
})
