/**
 * Pure helpers that turn a route into what the 2D map, the 3D map and the navigation
 * panel show, so all three agree on the floor legs and the wording.
 */
import type { Room } from '../types/room.ts'
import type { RouteFailureReason, RoutePoint } from '../types/route.ts'
import { BUILDING_ENTRANCES } from './routeService.ts'

export const BUILDING_ENTRANCE_LABEL = 'ทางเข้าอาคาร 1'
export const BUILDING_ENTRANCE_2_LABEL = 'ทางเข้าอาคาร 2'

/** Returns the display label if the id is a known building entrance. */
export function getEntranceLabel(id: string): string | undefined {
  const entrance = BUILDING_ENTRANCES.find((e) => e.id === id)
  return entrance?.label
}

/**
 * Maximum Euclidean distance (in floor plan SVG coordinate units) from a walking path
 * for a room/landmark to be considered part of the active route corridor.
 * Based on LC3 hallway dimensions (~30-40 units width, doors within ~60-90 units).
 */
export const ROUTE_CORRIDOR_THRESHOLD = 95

/** Distance from point (px, py) to the finite line segment (x1, y1)-(x2, y2). */
export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/**
 * Returns true if a room is within `threshold` units of any segment of the route on the given floor.
 */
export function isRoomInRouteCorridor(
  room: Pick<Room, 'coordinates'>,
  floorPoints: RoutePoint[],
  threshold = ROUTE_CORRIDOR_THRESHOLD,
): boolean {
  if (!room?.coordinates || floorPoints.length === 0) return false
  if (floorPoints.length === 1) {
    const pt = floorPoints[0]
    return Math.hypot(room.coordinates.x - pt.x, room.coordinates.y - pt.y) <= threshold
  }
  for (let i = 0; i < floorPoints.length - 1; i++) {
    const p1 = floorPoints[i]
    const p2 = floorPoints[i + 1]
    if (pointToSegmentDistance(room.coordinates.x, room.coordinates.y, p1.x, p1.y, p2.x, p2.y) <= threshold) {
      return true
    }
  }
  return false
}

/** "ห้อง 105", or the POI name ("ห้องน้ำหญิง (ฝั่งซ้าย)") when there is no room number. */
export function getPlaceLabel(room: Pick<Room, 'roomNumber' | 'nameThai' | 'code'>): string {
  return room.roomNumber ? `ห้อง ${room.roomNumber}` : room.nameThai || room.code
}

export interface RouteLeg {
  floor: number
  points: RoutePoint[]
}

/** Consecutive runs of the path on one floor, in walking order. */
export function splitRouteByFloor(path: RoutePoint[]): RouteLeg[] {
  const legs: RouteLeg[] = []
  for (const point of path) {
    const last = legs[legs.length - 1]
    if (last && last.floor === point.floor) last.points.push(point)
    else legs.push({ floor: point.floor, points: [point] })
  }
  return legs
}

/** Identifies a path, so the 2D and 3D maps redraw only when the route or floor changes. */
export function getRouteKey(path: RoutePoint[], floor: number): string {
  return `${path.map((point) => point.nodeId).join('>')}@${floor}`
}

/** "ขึ้นบันไดไปชั้น 2" / "ลงบันไดไปชั้น 1" */
export function getFloorChangeLabel(fromFloor: number, toFloor: number): string {
  return `${toFloor > fromFloor ? 'ขึ้น' : 'ลง'}บันไดไปชั้น ${toFloor}`
}

export const ROUTE_FAILURE_MESSAGES: Record<RouteFailureReason, { title: string; hint: string }> = {
  NO_PATH: {
    title: 'ไม่มีทางเดินไปยังปลายทางในขณะนี้',
    hint: 'ทางเดินบางจุดอาจปิดชั่วคราว ลองเลือกจุดเริ่มต้นอื่น',
  },
  DESTINATION_CLOSED: {
    title: 'ปลายทางปิดชั่วคราว',
    hint: 'ห้องนี้ปิดอยู่ในขณะนี้ ลองตรวจสอบอีกครั้งภายหลัง',
  },
  ORIGIN_CLOSED: {
    title: 'จุดเริ่มต้นปิดชั่วคราว',
    hint: 'ลองเลือกจุดเริ่มต้นอื่น เช่น ทางเข้าอาคาร',
  },
  UNKNOWN_LOCATION: {
    title: 'ไม่พบสถานที่นี้ในข้อมูลเส้นทาง',
    hint: 'ลองเลือกห้องหรือจุดสำคัญอื่น',
  },
}

export const CLOSURES_AVOIDED_NOTICE = 'เส้นทางนี้เลี่ยงจุดที่ปิดชั่วคราว'

export type TurnDirection = 'straight' | 'turn-left' | 'turn-right' | 'stairs' | 'arrive'

export interface RouteStepChip {
  id: string
  floor: number
  turnType: TurnDirection
  text: string
  landmarks?: string[]
}

/**
 * Calculates the turn angle between two consecutive 2D vectors in SVG coordinates (+x right, +y down).
 * Returns angle in degrees and whether it's a left or right turn.
 */
export function calculateTurnAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
): { angleDeg: number; isTurn: boolean; turnType: 'straight' | 'turn-left' | 'turn-right' } {
  const v1x = p2.x - p1.x
  const v1y = p2.y - p1.y
  const v2x = p3.x - p2.x
  const v2y = p3.y - p2.y

  const mag1 = Math.hypot(v1x, v1y)
  const mag2 = Math.hypot(v2x, v2y)
  if (mag1 < 1e-3 || mag2 < 1e-3) {
    return { angleDeg: 0, isTurn: false, turnType: 'straight' }
  }

  const dot = v1x * v2x + v1y * v2y
  const cross = v1x * v2y - v1y * v2x
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)))
  const angleDeg = (Math.acos(cos) * 180) / Math.PI

  if (angleDeg < 45) {
    return { angleDeg, isTurn: false, turnType: 'straight' }
  }

  return {
    angleDeg,
    isTurn: true,
    turnType: cross > 0 ? 'turn-right' : 'turn-left',
  }
}

/**
 * Finds landmark rooms along a specific path chunk on a floor, ordered from start of chunk to end.
 */
export function getLandmarksAlongSubpath(
  subpath: RoutePoint[],
  rooms: Room[],
  floor: number,
  excludeLocationIds: Set<string>,
  threshold = 75,
): string[] {
  if (subpath.length < 2) return []

  const floorRooms = rooms.filter(
    (r) => r.floor === floor && (!r.id || !excludeLocationIds.has(r.id)),
  )

  const candidateRooms: { label: string; t: number }[] = []

  let accumulatedDist = 0
  for (let i = 0; i < subpath.length - 1; i++) {
    const p1 = subpath[i]
    const p2 = subpath[i + 1]
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const segLen = Math.hypot(dx, dy)
    if (segLen < 1e-3) continue

    for (const room of floorRooms) {
      const rx = room.coordinates.x
      const ry = room.coordinates.y
      const dist = pointToSegmentDistance(rx, ry, p1.x, p1.y, p2.x, p2.y)
      if (dist <= threshold) {
        const proj = Math.max(0, Math.min(1, ((rx - p1.x) * dx + (ry - p1.y) * dy) / (segLen * segLen)))
        const overallDist = accumulatedDist + proj * segLen
        const label = room.roomNumber || room.nameThai || room.code
        if (label && !candidateRooms.some((c) => c.label === label)) {
          candidateRooms.push({ label, t: overallDist })
        }
      }
    }
    accumulatedDist += segLen
  }

  candidateRooms.sort((a, b) => a.t - b.t)
  return candidateRooms.map((c) => c.label)
}

/**
 * Generates turn-by-turn landmark instructions for a given floor leg.
 */
export function generateLegInstructions(
  legPoints: RoutePoint[],
  rooms: Room[],
  floor: number,
  isLastLeg: boolean,
  destinationLabel: string,
  _fromLabel?: string,
  _isFirstLeg?: boolean,
  destLocationId?: string,
  originLocationId?: string,
): RouteStepChip[] {
  if (legPoints.length <= 1) return []

  const excludeIds = new Set<string>()
  if (destLocationId) excludeIds.add(destLocationId)
  if (originLocationId) excludeIds.add(originLocationId)

  // Find all turn vertices where turn angle > 45 deg
  const turnIndices: { index: number; turnType: 'turn-left' | 'turn-right' }[] = []
  for (let i = 1; i < legPoints.length - 1; i++) {
    const turn = calculateTurnAngle(legPoints[i - 1], legPoints[i], legPoints[i + 1])
    if (turn.isTurn && turn.turnType !== 'straight') {
      turnIndices.push({ index: i, turnType: turn.turnType })
    }
  }

  // Break leg into segments between turns: [0..turn1], [turn1..turn2], ..., [turnK..end]
  const steps: RouteStepChip[] = []
  const waypoints = [0, ...turnIndices.map((t) => t.index), legPoints.length - 1]

  for (let w = 0; w < waypoints.length - 1; w++) {
    const startIdx = waypoints[w]
    const endIdx = waypoints[w + 1]
    const subpath = legPoints.slice(startIdx, endIdx + 1)
    const landmarks = getLandmarksAlongSubpath(subpath, rooms, floor, excludeIds)
    const isStartChunk = w === 0
    const isEndChunk = w === waypoints.length - 2

    let turnType: TurnDirection = 'straight'
    let prefix = 'เดินตรง'
    if (!isStartChunk) {
      const turn = turnIndices[w - 1]
      if (turn) {
        turnType = turn.turnType
        prefix = turn.turnType === 'turn-left' ? 'เลี้ยวซ้าย' : 'เลี้ยวขวา'
      }
    }

    let text: string
    if (landmarks.length > 0) {
      const landmarkText = landmarks.slice(0, 3).join(' - ')
      if (isStartChunk) {
        text = `เดินตรงผ่าน ${landmarkText}`
      } else if (isEndChunk && isLastLeg) {
        text = `${prefix}เข้าโถง${destinationLabel}`
      } else {
        text = `${prefix}แล้วเดินผ่าน ${landmarkText}`
      }
    } else {
      if (isEndChunk && isLastLeg) {
        text = isStartChunk ? `เดินตรงไปยัง${destinationLabel}` : `${prefix}เข้าโถง${destinationLabel}`
      } else if (isEndChunk && !isLastLeg) {
        text = isStartChunk ? 'เดินตรงไปที่บันได' : `${prefix}ไปที่บันได`
      } else {
        text = isStartChunk ? 'เดินตรงไปตามทางเดิน' : `${prefix}ตรงไปตามทางเดิน`
      }
    }

    steps.push({
      id: `step-${floor}-${w}`,
      floor,
      turnType,
      text,
      landmarks,
    })
  }

  return steps
}
