/**
 * routeService unit tests — vitest
 *
 * Seam: GET /api/route as specified in #144. Checks the query string that is sent and
 * how the response (found / not found / HTTP error) comes back to the UI.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RawRoutePoint } from '../../types/route'
import { BUILDING_ENTRANCE_ID, getRoute, normalizeRoute } from '../routeService'

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const FOUND = {
  found: true,
  distance: 312.5,
  floors: [1, 2],
  path: [
    { node_id: 'LC3_Junction_SM', floor: 1, x: 632, y: 484 },
    { node_id: 'LC3_stair-2', floor: 1, x: 622, y: 270, location_id: 'LC3-F1-PSTAIR-2' },
    { node_id: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228 },
    { node_id: 'LC3_F2_201', floor: 2, x: 424, y: 280, location_id: 'LC3-F2-R201' },
  ],
  closures_avoided: [{ element_id: 'EDGE#A|B', reason: 'ปิดซ่อม' }],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRoute', () => {
  it('asks for the route with from, to and the optional time', async () => {
    const fetchMock = mockFetch(200, FOUND)
    const controller = new AbortController()

    await getRoute({ from: BUILDING_ENTRANCE_ID, to: 'LC3-F2-R201', at: '2026-10-26T09:00:00+07:00', signal: controller.signal })

    const [url, init] = fetchMock.mock.calls[0]
    const query = new URL(url, 'http://localhost').searchParams
    expect(new URL(url, 'http://localhost').pathname).toMatch(/\/api\/route$/)
    expect(query.get('from')).toBe('LC3_Junction_SM')
    expect(query.get('to')).toBe('LC3-F2-R201')
    expect(query.get('at')).toBe('2026-10-26T09:00:00+07:00')
    expect(init.signal).toBe(controller.signal)
  })

  it('leaves out `at` when none is given', async () => {
    const fetchMock = mockFetch(200, FOUND)
    await getRoute({ from: 'LC3-F1-R105', to: 'LC3-F2-R201' })
    expect(new URL(fetchMock.mock.calls[0][0], 'http://localhost').searchParams.has('at')).toBe(false)
  })

  it('returns a found route in the app shape', async () => {
    mockFetch(200, FOUND)
    const route = await getRoute({ from: BUILDING_ENTRANCE_ID, to: 'LC3-F2-R201' })
    expect(route).toEqual({
      found: true,
      distance: 312.5,
      floors: [1, 2],
      path: [
        { nodeId: 'LC3_Junction_SM', floor: 1, x: 632, y: 484 },
        { nodeId: 'LC3_stair-2', floor: 1, x: 622, y: 270, locationId: 'LC3-F1-PSTAIR-2' },
        { nodeId: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228 },
        { nodeId: 'LC3_F2_201', floor: 2, x: 424, y: 280, locationId: 'LC3-F2-R201' },
      ],
      closuresAvoided: [{ elementId: 'EDGE#A|B', reason: 'ปิดซ่อม' }],
    })
  })

  it.each(['NO_PATH', 'DESTINATION_CLOSED', 'ORIGIN_CLOSED', 'UNKNOWN_LOCATION'])(
    'passes "no route" (%s) through as a normal result, not an error',
    async (reason) => {
      mockFetch(200, { found: false, reason })
      await expect(getRoute({ from: 'a', to: 'b' })).resolves.toEqual({ found: false, reason })
    },
  )

  it('throws a readable message when the request is rejected', async () => {
    mockFetch(400, { error: 'Missing required query parameters' })
    await expect(getRoute({ from: 'a', to: 'b' })).rejects.toThrow('ข้อมูลจุดเริ่มต้นหรือปลายทางไม่ถูกต้อง')
  })

  it('throws a readable message with the status for other HTTP errors', async () => {
    mockFetch(404, { message: 'Not found' })
    await expect(getRoute({ from: 'a', to: 'b' })).rejects.toThrow('คำนวณเส้นทางไม่สำเร็จ (404)')
  })

  it('rejects a found route with a malformed point', async () => {
    mockFetch(200, { found: true, path: [{ node_id: 'n', floor: 1, y: 20 }] })
    await expect(getRoute({ from: 'a', to: 'b' })).rejects.toThrow('ข้อมูลเส้นทางจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  })

  it('rejects a body that is not a route', async () => {
    mockFetch(200, { records: [] })
    await expect(getRoute({ from: 'a', to: 'b' })).rejects.toThrow('ข้อมูลเส้นทางจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  })
})

describe('normalizeRoute', () => {
  it('treats an unknown failure reason as NO_PATH', () => {
    expect(normalizeRoute({ found: false, reason: 'SOMETHING_NEW' })).toEqual({ found: false, reason: 'NO_PATH' })
  })

  it('coerces numeric strings and fills missing lists', () => {
    expect(normalizeRoute({ found: true, path: [{ node_id: 'n', floor: '2', x: '10', y: '20' }] })).toEqual({
      found: true,
      distance: 0,
      floors: [2],
      path: [{ nodeId: 'n', floor: 2, x: 10, y: 20 }],
      closuresAvoided: [],
    })
  })

  it.each<[string, unknown]>([
    ['x is missing', { node_id: 'n', floor: 1, y: 20 }],
    ['y is null', { node_id: 'n', floor: 1, x: 10, y: null }],
    ['floor is missing', { node_id: 'n', x: 10, y: 20 }],
    ['x is not a number', { node_id: 'n', floor: 1, x: 'abc', y: 20 }],
    ['y is not finite', { node_id: 'n', floor: 1, x: 10, y: Infinity }],
  ])('rejects a route whose point has a bad coordinate (%s) instead of plotting it at 0', (_case, point) => {
    expect(() => normalizeRoute({ found: true, path: [point as RawRoutePoint] })).toThrow('ข้อมูลเส้นทางจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  })

  it('keeps a coordinate that is really 0', () => {
    expect(normalizeRoute({ found: true, path: [{ node_id: 'n', floor: 1, x: 0, y: 0 }] })).toMatchObject({
      path: [{ nodeId: 'n', floor: 1, x: 0, y: 0 }],
    })
  })
})
