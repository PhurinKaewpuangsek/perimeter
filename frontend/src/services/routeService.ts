import type {
  RawRoutePoint,
  RawRouteResponse,
  RouteFailureReason,
  RoutePoint,
  RouteResult,
} from '../types/route.ts'
import { fetchWithRetry } from './apiClient.ts'

/**
 * Graph node of the building entrances (`building_entrances` in lc3-graph.seed.json).
 * GET /api/route takes a node_id as well as a location_id for `from`.
 */
export const BUILDING_ENTRANCE_ID = 'LC3_Junction_SM'
export const BUILDING_ENTRANCE_2_ID = 'LC3_Junction_NM'

/** Floor the building entrances are on, so a route from them opens the map there. */
export const BUILDING_ENTRANCE_FLOOR = 1

export interface BuildingEntrance {
  id: string
  label: string
  floor: number
  description?: string
  coordinates: { x: number; y: number }
}

export const BUILDING_ENTRANCES: BuildingEntrance[] = [
  {
    id: BUILDING_ENTRANCE_ID,
    label: 'ทางเข้าอาคาร 1',
    floor: BUILDING_ENTRANCE_FLOOR,
    description: 'ทางเข้าฝั่งทิศใต้ (ลานน้ำพุ)',
    coordinates: { x: 632, y: 484 },
  },
  {
    id: BUILDING_ENTRANCE_2_ID,
    label: 'ทางเข้าอาคาร 2',
    floor: BUILDING_ENTRANCE_FLOOR,
    description: 'ทางเข้าฝั่งทิศเหนือ (สะพานทางเดินเชื่อม)',
    coordinates: { x: 621, y: 116 },
  },
]

const INVALID_ROUTE_MESSAGE = 'ข้อมูลเส้นทางจากเซิร์ฟเวอร์ไม่ถูกต้อง'

const FAILURE_REASONS: RouteFailureReason[] = [
  'NO_PATH',
  'DESTINATION_CLOSED',
  'ORIGIN_CLOSED',
  'UNKNOWN_LOCATION',
]

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0
}

/** A coordinate the map can plot; a missing or non-finite one would land at (0, 0) or floor 0. */
function toFiniteNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (value === undefined || value === null || value === '' || !Number.isFinite(number)) {
    throw new Error(INVALID_ROUTE_MESSAGE)
  }
  return number
}

function normalizePoint(raw: RawRoutePoint): RoutePoint {
  return {
    nodeId: raw.node_id ?? '',
    floor: toFiniteNumber(raw.floor),
    x: toFiniteNumber(raw.x),
    y: toFiniteNumber(raw.y),
    ...(raw.location_id ? { locationId: raw.location_id } : {}),
  }
}

export function normalizeRoute(raw: RawRouteResponse): RouteResult {
  if (raw.found !== true) {
    const reason = FAILURE_REASONS.find((known) => known === raw.reason) ?? 'NO_PATH'
    return { found: false, reason }
  }
  const path = Array.isArray(raw.path) ? raw.path.map(normalizePoint) : []
  const floors = Array.isArray(raw.floors)
    ? raw.floors.map(toNumber)
    : [...new Set(path.map((point) => point.floor))]
  return {
    found: true,
    distance: toNumber(raw.distance),
    floors,
    path,
    closuresAvoided: Array.isArray(raw.closures_avoided)
      ? raw.closures_avoided.map((closure) => ({
          elementId: closure.element_id ?? '',
          ...(closure.reason ? { reason: closure.reason } : {}),
        }))
      : [],
  }
}

/**
 * Base URL of the deployed API Gateway stage, from VITE_API_BASE_URL.
 *
 * `import.meta.env` is optional-chained because unit tests for this module may run under
 * plain `node --test`, where Vite never injects it.
 */
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const ROUTE_ENDPOINT = `${API_BASE_URL}/api/route`

export interface GetRouteOptions {
  /** location_id of a room/POI, or a graph node_id such as BUILDING_ENTRANCE_ID. */
  from: string
  /** location_id of the destination. */
  to: string
  /** Evaluate closures at this time instead of now (testing). */
  at?: string
  signal?: AbortSignal
}

export async function getRoute({ from, to, at, signal }: GetRouteOptions): Promise<RouteResult> {
  const url = new URL(ROUTE_ENDPOINT || '/api/route', globalThis.location?.origin ?? 'http://localhost')
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  if (at) url.searchParams.set('at', at)
  const endpoint = API_BASE_URL ? url.toString() : `${url.pathname}${url.search}`

  const response = await fetchWithRetry(endpoint, { signal })

  if (!response.ok) {
    throw new Error(
      response.status === 400
        ? 'ข้อมูลจุดเริ่มต้นหรือปลายทางไม่ถูกต้อง'
        : `คำนวณเส้นทางไม่สำเร็จ (${response.status}) ลองใหม่อีกครั้ง`,
    )
  }

  const data: RawRouteResponse | null = await response.json()

  if (!data || typeof data.found !== 'boolean') {
    throw new Error(INVALID_ROUTE_MESSAGE)
  }

  return normalizeRoute(data)
}
