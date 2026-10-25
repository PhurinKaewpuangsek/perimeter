import { createElement } from 'react'
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { ROOMS_CACHE_KEY, useRooms, type UseRoomsResult, _resetRoomsCacheForTesting } from '../useRooms.ts'

/** In-memory stand-in for window.localStorage, fresh for every test. */
let storage: Map<string, string>

beforeEach(() => {
  _resetRoomsCacheForTesting()
  storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  })
})

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}

reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let renderer: ReactTestRenderer | undefined
const originalFetch = globalThis.fetch

function createResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
  } as Response
}

async function flushUpdates(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function renderUseRooms(): Promise<() => UseRoomsResult> {
  let latestResult: UseRoomsResult | undefined

  function HookProbe() {
    latestResult = useRooms()
    return null
  }

  await act(async () => {
    renderer = create(createElement(HookProbe))
    await flushUpdates()
  })

  return () => {
    assert.ok(latestResult, 'useRooms should return a result')
    return latestResult
  }
}

afterEach(async () => {
  globalThis.fetch = originalFetch

  if (renderer) {
    await act(async () => {
      renderer?.unmount()
    })
    renderer = undefined
  }
})

describe('useRooms()', () => {
  it('returns loading initially, then exposes normalized rooms', async () => {
    let resolveFetch: (response: Response) => void = () => undefined
    globalThis.fetch =
      (() =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })) as typeof fetch

    const readResult = await renderUseRooms()
    assert.strictEqual(readResult().loading, true)
    assert.deepStrictEqual(readResult().rooms, [])
    assert.strictEqual(readResult().error, null)

    await act(async () => {
      resolveFetch(
        createResponse({
          records: [
            {
              location_id: 'LC3-F1-R101',
              room_code: 'LC3-101',
              name_th: 'ห้องบรรยาย 1',
              building_code: 'LC3',
              floor: 1,
              room_number: '101',
              category: 'lecture_room',
              x: 100,
              y: 200,
            },
          ],
        })
      )
      await flushUpdates()
    })

    assert.strictEqual(readResult().loading, false)
    assert.strictEqual(readResult().error, null)
    assert.deepStrictEqual(readResult().rooms, [
      {
        id: 'LC3-F1-R101',
        code: 'LC3-101',
        nameThai: 'ห้องบรรยาย 1',
        building: 'LC3',
        floor: 1,
        roomNumber: '101',
        category: 'lecture_room',
        coordinates: { x: 100, y: 200 },
        landmarks: [],
        aliases: [],
      },
    ])
  })

  it('returns an Error and clears loading when the request fails', async () => {
    let rejectFetch: (reason: Error) => void = () => undefined
    globalThis.fetch =
      (() =>
        new Promise<Response>((_, reject) => {
          rejectFetch = reject
        })) as typeof fetch

    const readResult = await renderUseRooms()

    await act(async () => {
      rejectFetch(new Error('Network unavailable'))
      await flushUpdates()
    })

    assert.strictEqual(readResult().loading, false)
    assert.deepStrictEqual(readResult().rooms, [])
    const error = readResult().error
    assert.ok(error instanceof Error)
    assert.strictEqual(error.message, 'Network unavailable')
  })

  it('reload() ล้าง error กลับไปโหลดใหม่ แล้วได้ข้อมูลห้อง', async () => {
    let calls = 0
    let resolveRetry: (response: Response) => void = () => undefined
    globalThis.fetch = (() => {
      calls += 1
      if (calls === 1) return Promise.reject(new Error('Network unavailable'))
      return new Promise<Response>((resolve) => {
        resolveRetry = resolve
      })
    }) as typeof fetch

    const readResult = await renderUseRooms()
    assert.ok(readResult().error instanceof Error)

    await act(async () => {
      readResult().reload()
      await flushUpdates()
    })

    assert.strictEqual(calls, 2)
    assert.strictEqual(readResult().loading, true)
    assert.strictEqual(readResult().error, null)

    await act(async () => {
      resolveRetry(createResponse({ records: [{ location_id: 'LC3-F1-R101', floor: 1, x: 1, y: 2 }] }))
      await flushUpdates()
    })

    assert.strictEqual(readResult().loading, false)
    assert.strictEqual(readResult().rooms.length, 1)
  })

  it('เข้าเว็บครั้งถัดไปโชว์ห้องจาก cache ทันที ไม่ต้องรอ API แล้วค่อยอัปเดตเป็นข้อมูลใหม่', async () => {
    const cachedRoom = {
      id: 'LC3-F1-R101',
      code: 'LC3-101',
      nameThai: 'ห้องเก่า',
      building: 'LC3',
      floor: 1,
      roomNumber: '101',
      category: 'lecture_room',
      coordinates: { x: 100, y: 200 },
      landmarks: [],
      aliases: [],
    }
    storage.set(ROOMS_CACHE_KEY, JSON.stringify([cachedRoom]))

    let resolveFetch: (response: Response) => void = () => undefined
    globalThis.fetch = (() =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })) as typeof fetch

    const readResult = await renderUseRooms()
    assert.strictEqual(readResult().loading, false)
    assert.strictEqual(readResult().rooms[0].nameThai, 'ห้องเก่า')

    await act(async () => {
      resolveFetch(createResponse({ records: [{ location_id: 'LC3-F1-R101', name_th: 'ห้องใหม่', floor: 1, x: 100, y: 200 }] }))
      await flushUpdates()
    })

    assert.strictEqual(readResult().rooms[0].nameThai, 'ห้องใหม่')
    assert.strictEqual(JSON.parse(storage.get(ROOMS_CACHE_KEY) ?? '[]')[0].nameThai, 'ห้องใหม่')
  })

  it('มี cache อยู่แล้ว API ล่มก็ยังใช้ข้อมูลเดิมได้ ไม่ขึ้น error', async () => {
    storage.set(
      ROOMS_CACHE_KEY,
      JSON.stringify([{ id: 'A', code: '', nameThai: 'A', building: 'LC3', floor: 1, roomNumber: '', category: '', coordinates: { x: 0, y: 0 }, landmarks: [], aliases: [] }])
    )
    globalThis.fetch = (() => Promise.reject(new Error('Network unavailable'))) as typeof fetch

    const readResult = await renderUseRooms()

    assert.strictEqual(readResult().error, null)
    assert.strictEqual(readResult().loading, false)
    assert.strictEqual(readResult().rooms.length, 1)
  })

  it('cache เสียหาย ไม่ทำให้พัง แค่กลับไปรอ API ตามปกติ', async () => {
    storage.set(ROOMS_CACHE_KEY, '{not json')
    globalThis.fetch = (() => new Promise<Response>(() => undefined)) as typeof fetch

    const readResult = await renderUseRooms()

    assert.strictEqual(readResult().loading, true)
    assert.deepStrictEqual(readResult().rooms, [])
  })

  it('deduplicates in-flight fetches so multiple callers share a single network request', async () => {
    let fetchCount = 0
    globalThis.fetch = (() => {
      fetchCount++
      return Promise.resolve(createResponse({ records: [{ location_id: 'LC3-101', room_code: 'LC3-101' }] }))
    }) as typeof fetch

    const read1 = await renderUseRooms()
    assert.strictEqual(fetchCount, 1)
    assert.strictEqual(read1().rooms.length, 1)

    let secondResult: UseRoomsResult | undefined
    function SecondHookProbe() {
      secondResult = useRooms()
      return null
    }

    let secondRenderer: ReactTestRenderer | undefined
    await act(async () => {
      secondRenderer = create(createElement(SecondHookProbe))
      await flushUpdates()
    })

    assert.strictEqual(fetchCount, 1)
    assert.strictEqual(secondResult?.rooms.length, 1)

    if (secondRenderer) {
      await act(async () => {
        secondRenderer?.unmount()
      })
    }
  })
})
