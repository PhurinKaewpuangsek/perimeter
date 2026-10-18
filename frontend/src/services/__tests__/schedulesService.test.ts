import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getSchedules, normalizeSchedule, SCHEDULES_ENDPOINT } from '../schedulesService.ts'
import type { RawScheduleRecord, SchedulesDataResponse } from '../../types/schedule.ts'

const SAMPLE_SCHEDULE: RawScheduleRecord = {
  room_code: 'LC3-103',
  schedule_slot: 'TUE#08:00#CS361',
  event_code: 'CS361',
  event_name: 'CS 361',
  day_of_week: 'TUE',
  start_time: '08:00',
  end_time: '11:00',
  event_type: 'class',
}

const API_RESPONSE: SchedulesDataResponse = {
  count: 1,
  records: [SAMPLE_SCHEDULE],
}

describe('schedulesService - Data Access Layer', () => {
  describe('normalizeSchedule()', () => {
    it('maps raw schedule fields to ScheduleSlot', () => {
      assert.deepStrictEqual(normalizeSchedule(SAMPLE_SCHEDULE), {
        roomCode: 'LC3-103',
        eventCode: 'CS361',
        eventName: 'CS 361',
        dayOfWeek: 'TUE',
        startTime: '08:00',
        endTime: '11:00',
        eventType: 'class',
        eventDate: '',
      })
    })

    it('uses empty strings when optional fields are missing', () => {
      assert.deepStrictEqual(normalizeSchedule({}), {
        roomCode: '',
        eventCode: '',
        eventName: '',
        dayOfWeek: '',
        startTime: '',
        endTime: '',
        eventType: '',
        eventDate: '',
      })
    })

    it('replaces non-string fields from malformed API records with empty strings', () => {
      assert.deepStrictEqual(
        normalizeSchedule(({
          room_code: 103,
          event_code: { code: 'CS361' },
          event_name: ['CS 361'],
          day_of_week: true,
          start_time: 800,
          end_time: null,
          event_type: 'class',
        } as unknown) as RawScheduleRecord),
        {
          roomCode: '',
          eventCode: '',
          eventName: '',
          dayOfWeek: '',
          startTime: '',
          endTime: '',
          eventType: 'class',
          eventDate: '',
        }
      )
    })

    it('passes event_date through as eventDate for exam rows', () => {
      const result = normalizeSchedule({ ...SAMPLE_SCHEDULE, event_type: 'exam', event_date: '2026-05-18' })
      assert.strictEqual(result.eventDate, '2026-05-18')
    })
  })

  describe('getSchedules()', () => {
    it('targets the schedules API endpoint', () => {
      assert.ok(SCHEDULES_ENDPOINT.endsWith('/api/schedules'))
    })

    it('fetches and normalizes schedule records', async () => {
      const originalFetch = globalThis.fetch
      try {
        globalThis.fetch = async (input: RequestInfo | URL) => {
          assert.strictEqual(String(input), SCHEDULES_ENDPOINT)
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => API_RESPONSE,
          } as Response
        }

        const schedules = await getSchedules()
        assert.deepStrictEqual(schedules, [
          {
            roomCode: 'LC3-103',
            eventCode: 'CS361',
            eventName: 'CS 361',
            dayOfWeek: 'TUE',
            startTime: '08:00',
            endTime: '11:00',
            eventType: 'class',
            eventDate: '',
          },
        ])
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('sends the selected room as the room_code query parameter', async () => {
      const originalFetch = globalThis.fetch
      try {
        globalThis.fetch = async (input: RequestInfo | URL) => {
          assert.strictEqual(String(input), `${SCHEDULES_ENDPOINT}?room_code=LC3-103%2F1`)
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => API_RESPONSE,
          } as Response
        }

        await getSchedules({ roomCode: 'LC3-103/1' })
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('throws when the HTTP response is not successful', async () => {
      const originalFetch = globalThis.fetch
      try {
        globalThis.fetch = async () =>
          ({ ok: false, status: 500, statusText: 'Server Error' }) as Response

        await assert.rejects(getSchedules(), /Failed to fetch schedules: 500 Server Error/)
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('throws when the response has no records array', async () => {
      const originalFetch = globalThis.fetch
      try {
        globalThis.fetch = async () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ count: 0 }),
          }) as Response

        await assert.rejects(
          getSchedules(),
          /Invalid schedules data format: expected "records" array/
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
