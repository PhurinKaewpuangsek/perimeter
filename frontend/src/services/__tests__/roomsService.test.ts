import { describe, it } from 'node:test'
import assert from 'node:assert'
import { normalizeRoom, getRooms, ROOMS_ENDPOINT } from '../roomsService.ts'
import type { RawRoomRecord, RoomsDataResponse } from '../../types/room.ts'

/**
 * Fixtures are inline on purpose. Room data now lives in DynamoDB and reaches the app
 * through GET /api/locations, so there is no local JSON file to read from disk.
 * Dataset-wide invariants (record count, provenance, coordinates) are asserted in
 * tools/data-extraction/validate-lc3-seed.mjs instead.
 */
const SAMPLE_ROOM: RawRoomRecord = {
  location_id: 'LC3-F1-R101-1',
  building_code: 'LC3',
  floor: 1,
  location_kind: 'room',
  room_code: 'LC3-101/1',
  aliases: ['LC3-101/1', '101/1'],
  name_th: 'ห้องบรรยาย 4 (วิทยาศาสตร์สิ่งแวดล้อม)',
  category: 'lecture_room',
  x: 376,
  y: 152,
  landmarks: [
    {
      kind: 'near_toilet',
      ref_location_id: 'LC3-F1-PLMTOILET',
      walk_hops: 10,
      text_th: 'ใกล้ห้องน้ำชาย (ฝั่งซ้าย)',
      verification: 'derived_unverified',
    },
  ],
}

const SAMPLE_POI: RawRoomRecord = {
  location_id: 'LC3-F1-PLFTOILET',
  building_code: 'LC3',
  floor: 1,
  location_kind: 'poi',
  room_code: '',
  aliases: [],
  name_th: 'ห้องน้ำหญิง (ฝั่งซ้าย)',
  category: 'toilet',
  x: 127,
  y: 356,
}

const API_RESPONSE: RoomsDataResponse = {
  counts: { records: 2 },
  records: [SAMPLE_POI, SAMPLE_ROOM],
}

describe('roomsService - Data Access Layer', () => {
  describe('normalizeRoom()', () => {
    it('correctly maps raw seed fields to Room interface', () => {
      const room = normalizeRoom(SAMPLE_ROOM)

      assert.strictEqual(room.id, 'LC3-F1-R101-1')
      assert.strictEqual(room.code, 'LC3-101/1')
      assert.strictEqual(room.nameThai, 'ห้องบรรยาย 4 (วิทยาศาสตร์สิ่งแวดล้อม)')
      assert.strictEqual(room.building, 'LC3')
      assert.strictEqual(room.floor, 1)
      assert.strictEqual(room.roomNumber, '101/1')
      assert.strictEqual(room.category, 'lecture_room')
      assert.deepStrictEqual(room.coordinates, { x: 376, y: 152 })
      assert.strictEqual(room.landmarks.length, 1)
      assert.deepStrictEqual(room.aliases, ['LC3-101/1', '101/1'])
    })

    it('handles POI records without room_code or landmarks gracefully', () => {
      const room = normalizeRoom(SAMPLE_POI)

      assert.strictEqual(room.id, 'LC3-F1-PLFTOILET')
      assert.strictEqual(room.code, '')
      assert.strictEqual(room.nameThai, 'ห้องน้ำหญิง (ฝั่งซ้าย)')
      assert.strictEqual(room.building, 'LC3')
      assert.strictEqual(room.floor, 1)
      assert.strictEqual(room.roomNumber, '')
      assert.strictEqual(room.category, 'toilet')
      assert.deepStrictEqual(room.coordinates, { x: 127, y: 356 })
      assert.deepStrictEqual(room.landmarks, [])
      assert.deepStrictEqual(room.aliases, [])
    })

    it('leaves no required field undefined for a record missing every optional key', () => {
      const room = normalizeRoom({ location_id: 'LC3-F2-R999' })

      const requiredKeys = [
        'id',
        'code',
        'nameThai',
        'building',
        'floor',
        'roomNumber',
        'category',
        'coordinates',
        'landmarks',
        'aliases',
      ] as const

      for (const key of requiredKeys) {
        assert.notStrictEqual(room[key], undefined, `normalizeRoom left ${key} undefined`)
      }
      assert.strictEqual(room.coordinates.x, 0)
      assert.strictEqual(room.coordinates.y, 0)
      assert.ok(Array.isArray(room.landmarks))
      assert.ok(Array.isArray(room.aliases))
    })

    it('keeps the capacity saved through the edit flow, so the detail view can show it', () => {
      assert.strictEqual(normalizeRoom({ ...SAMPLE_ROOM, capacity: 45 }).capacity, 45)
    })

    it('reads a numeric capacity that came back as a string', () => {
      assert.strictEqual(normalizeRoom({ ...SAMPLE_ROOM, capacity: '30' as unknown as number }).capacity, 30)
    })

    it('leaves capacity off when the room has none or it is not a usable number', () => {
      assert.strictEqual('capacity' in normalizeRoom(SAMPLE_ROOM), false)
      for (const bad of ['', 'ไม่ทราบ', -5, Number.NaN, null]) {
        const room = normalizeRoom({ ...SAMPLE_ROOM, capacity: bad as unknown as number })
        assert.strictEqual('capacity' in room, false, `capacity ${String(bad)} should be dropped`)
      }
    })
  })

  describe('getRooms()', () => {
    it('targets the /api/locations endpoint built from VITE_API_BASE_URL', () => {
      assert.ok(
        ROOMS_ENDPOINT.endsWith('/api/locations'),
        `expected ROOMS_ENDPOINT to end with /api/locations, got "${ROOMS_ENDPOINT}"`
      )
      assert.ok(!ROOMS_ENDPOINT.includes('rooms.json'), 'must not read the retired static file')
    })

    it('fetches the API and returns normalized rooms from data.records', async () => {
      const originalFetch = globalThis.fetch
      try {
        globalThis.fetch = async (input: RequestInfo | URL) => {
          assert.strictEqual(String(input), ROOMS_ENDPOINT)
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => API_RESPONSE,
          } as Response
        }

        const rooms = await getRooms()
        assert.strictEqual(rooms.length, 2)
        assert.strictEqual(rooms[0].id, 'LC3-F1-PLFTOILET')
        assert.strictEqual(rooms[0].building, 'LC3')
        assert.strictEqual(rooms[1].id, 'LC3-F1-R101-1')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('passes cache: "no-cache" when bypassCache is true', async () => {
      const originalFetch = globalThis.fetch
      try {
        let receivedInit: RequestInit | undefined
        globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
          receivedInit = init
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => API_RESPONSE,
          } as Response
        }

        await getRooms({ bypassCache: true })
        assert.strictEqual(receivedInit?.cache, 'no-cache')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('throws an error when HTTP response is not ok', async () => {
      const originalFetch = globalThis.fetch
      try {
        globalThis.fetch = async () =>
          ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          }) as Response

        await assert.rejects(async () => {
          await getRooms()
        }, /Failed to fetch rooms: 404 Not Found/)
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('throws an error when data does not have records array', async () => {
      const originalFetch = globalThis.fetch
      try {
        globalThis.fetch = async () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ foo: 'bar' }),
          }) as Response

        await assert.rejects(async () => {
          await getRooms()
        }, /Invalid rooms data format: expected "records" array/)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
