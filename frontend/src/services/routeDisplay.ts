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

// Fountain constants (east courtyard on floor 1)
export const FOUNTAIN_CENTER = { x: 955, y: 332 } as const
export const FOUNTAIN_RIM_RADIUS = 55
export const FOUNTAIN_WALK_RADIUS = 72

// Bridge constants (floor 1 footbridge over west canal)
export const BRIDGE_X_MIN = 625
export const BRIDGE_X_MAX = 638
export const BRIDGE_SOUTH_Y_MIN = 420
export const BRIDGE_SOUTH_Y_MAX = 445
export const BRIDGE_NORTH_Y_MIN = 280
export const BRIDGE_NORTH_Y_MAX = 305
export const BRIDGE_DECK_SOUTH = { x: 631.5, y: 411 } as const
export const BRIDGE_NORTH_STAIRS_TOP = { x: 640, y: 283.5 } as const
export const BRIDGE_NORTH_STAIRS_BOTTOM = { x: 640, y: 273.5 } as const
export const BRIDGE_ROUTE_HEIGHT = 1.0

export function isPointOnBridgeDeck(point: { floor?: number; x: number; y: number }): boolean {
  if (point.floor !== undefined && point.floor !== 1) return false
  // Bridge walkway over canal
  if (point.x >= 625 && point.x <= 638 && point.y >= 288 && point.y <= 412) {
    return true
  }
  // North elevated landing platform:
  // - West wing (connecting MStair and base of stair 2): x in [614, 628], y in [268, 298]
  // - Central & East wing (connecting MidBridge, NM4, and top of north stairs): x in [628, 649], y in [283, 298]
  if (
    (point.x >= 614 && point.x <= 628 && point.y >= 268 && point.y <= 298) ||
    (point.x >= 628 && point.x <= 649 && point.y >= 283 && point.y <= 298)
  ) {
    return true
  }
  return false
}

export function isSouthBridgeFoot(p: { x: number; y: number }): boolean {
  return (
    p.x >= BRIDGE_X_MIN &&
    p.x <= BRIDGE_X_MAX &&
    p.y >= BRIDGE_SOUTH_Y_MIN &&
    p.y <= BRIDGE_SOUTH_Y_MAX
  )
}

export function isNorthBridgeFoot(p: { x: number; y: number }): boolean {
  return (
    p.x >= BRIDGE_X_MIN &&
    p.x <= BRIDGE_X_MAX &&
    p.y >= BRIDGE_NORTH_Y_MIN &&
    p.y <= BRIDGE_NORTH_Y_MAX
  )
}

export function isBridgeCrossing(p1: RoutePoint, p2: RoutePoint): boolean {
  if (
    (p1.nodeId === 'LC3_Junction_QR1-1' && p2.nodeId === 'LC3_Junction_MidBridge') ||
    (p1.nodeId === 'LC3_Junction_MidBridge' && p2.nodeId === 'LC3_Junction_QR1-1')
  ) {
    return true
  }
  return (
    (isSouthBridgeFoot(p1) && isNorthBridgeFoot(p2)) ||
    (isNorthBridgeFoot(p1) && isSouthBridgeFoot(p2))
  )
}

export function isNorthStairsEdge(p1: RoutePoint, p2: RoutePoint): boolean {
  if (
    (p1.nodeId === 'LC3_Junction_NM4' && p2.nodeId === 'LC3_Junction_NM3') ||
    (p1.nodeId === 'LC3_Junction_NM3' && p2.nodeId === 'LC3_Junction_NM4')
  ) {
    return true
  }
  const isNM4 = (p: RoutePoint) => Math.hypot(p.x - 640, p.y - 291) < 5
  const isNM3 = (p: RoutePoint) => Math.hypot(p.x - 640, p.y - 254) < 5
  return (isNM4(p1) && isNM3(p2)) || (isNM3(p1) && isNM4(p2))
}

export function isNearFountain(p: { x: number; y: number; nodeId?: string }): boolean {
  if (p.nodeId === 'LC3_Junction_RRoundabout') return true
  return Math.hypot(p.x - FOUNTAIN_CENTER.x, p.y - FOUNTAIN_CENTER.y) < FOUNTAIN_RIM_RADIUS
}

export function getFountainDetour(
  prev: RoutePoint,
  next: RoutePoint,
  floor: number,
): RoutePoint[] {
  const a1 = Math.atan2(prev.y - FOUNTAIN_CENTER.y, prev.x - FOUNTAIN_CENTER.x)
  const a2 = Math.atan2(next.y - FOUNTAIN_CENTER.y, next.x - FOUNTAIN_CENTER.x)

  let delta = a2 - a1
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI

  // When crossing directly opposite (delta approx pi or -pi):
  // Choose detour path based on orientation
  if (Math.abs(Math.abs(delta) - Math.PI) < 0.1) {
    if (Math.abs(Math.sin(a1)) > Math.abs(Math.cos(a1))) {
      delta = a1 > 0 ? -Math.PI : Math.PI
    } else {
      delta = a1 > 0 ? -Math.PI : Math.PI
    }
  }

  const count = Math.max(3, Math.ceil((Math.abs(delta) / Math.PI) * 6))
  const points: RoutePoint[] = []
  for (let i = 0; i <= count; i++) {
    const t = i / count
    const angle = a1 + delta * t
    points.push({
      floor,
      nodeId: `fountain_arc_${i}`,
      x: Math.round(FOUNTAIN_CENTER.x + FOUNTAIN_WALK_RADIUS * Math.cos(angle)),
      y: Math.round(FOUNTAIN_CENTER.y + FOUNTAIN_WALK_RADIUS * Math.sin(angle)),
    })
  }
  return points
}

// Center X of the connecting stairs on floor 2 (clears railings on both sides with max 0.358m clearance)
export const FLOOR_2_STAIR_2_X = 521
export const FLOOR_2_BRIDGE_WALKWAY_X = FLOOR_2_STAIR_2_X

export function isFloor2Stair2Node(p: RoutePoint): boolean {
  if (p.floor !== 2) return false
  if (p.nodeId === 'LC3_F2_stair-2' || p.nodeId === 'LC3_F2_hallway-5') return true
  return Math.abs(p.x - 529) <= 3 && p.y >= 195 && p.y <= 235
}

/**
 * Expands route leg points for visual rendering:
 * 1. Detours smoothly around the courtyard fountain rim on floor 1 so the line never cuts through the basin.
 * 2. Adds bridge deck waypoints on floor 1 so the 3D route climbs stairs and crosses above the canal.
 * 3. Centers floor 2 stair 2 / connecting stair points at x=521 to descend the stairs with full clearance on both handrails.
 */
export function getDisplayRoutePoints(legPoints: RoutePoint[], floor: number): RoutePoint[] {
  if (legPoints.length <= 1) return legPoints

  if (floor === 2) {
    return legPoints.map((p) => {
      if (isFloor2Stair2Node(p)) {
        return { ...p, x: FLOOR_2_STAIR_2_X }
      }
      return p
    })
  }

  if (floor !== 1) return legPoints

  const result: RoutePoint[] = []
  for (let i = 0; i < legPoints.length; i++) {
    const current = legPoints[i]

    // Check if current point is the fountain center node
    if (isNearFountain(current)) {
      const prev = i > 0 ? legPoints[i - 1] : null
      const next = i < legPoints.length - 1 ? legPoints[i + 1] : null
      if (prev && next) {
        const arc = getFountainDetour(prev, next, floor)
        for (const p of arc) {
          result.push(p)
        }
      } else if (prev) {
        const a1 = Math.atan2(prev.y - FOUNTAIN_CENTER.y, prev.x - FOUNTAIN_CENTER.x)
        result.push({
          floor,
          nodeId: 'fountain_rim',
          x: Math.round(FOUNTAIN_CENTER.x + FOUNTAIN_WALK_RADIUS * Math.cos(a1)),
          y: Math.round(FOUNTAIN_CENTER.y + FOUNTAIN_WALK_RADIUS * Math.sin(a1)),
        })
      } else if (next) {
        const a2 = Math.atan2(next.y - FOUNTAIN_CENTER.y, next.x - FOUNTAIN_CENTER.x)
        result.push({
          floor,
          nodeId: 'fountain_rim',
          x: Math.round(FOUNTAIN_CENTER.x + FOUNTAIN_WALK_RADIUS * Math.cos(a2)),
          y: Math.round(FOUNTAIN_CENTER.y + FOUNTAIN_WALK_RADIUS * Math.sin(a2)),
        })
      } else {
        result.push(current)
      }
      continue
    }

    // Check if edge to next point crosses the footbridge over the canal
    if (i < legPoints.length - 1) {
      const next = legPoints[i + 1]
      if (isBridgeCrossing(current, next)) {
        result.push(current)
        result.push({ floor, x: BRIDGE_DECK_SOUTH.x, y: BRIDGE_DECK_SOUTH.y, nodeId: 'bridge_deck_south' })
        continue
      }
    }

    // Check if edge to next point traverses the north bridge stairs
    if (i < legPoints.length - 1) {
      const next = legPoints[i + 1]
      if (isNorthStairsEdge(current, next)) {
        if (current.nodeId === 'LC3_Junction_NM4' || Math.hypot(current.x - 640, current.y - 291) < 5) {
          result.push(current)
          result.push({ floor, x: BRIDGE_NORTH_STAIRS_TOP.x, y: BRIDGE_NORTH_STAIRS_TOP.y, nodeId: 'bridge_north_stairs_top' })
          result.push({ floor, x: BRIDGE_NORTH_STAIRS_BOTTOM.x, y: BRIDGE_NORTH_STAIRS_BOTTOM.y, nodeId: 'bridge_north_stairs_bottom' })
        } else {
          result.push(current)
          result.push({ floor, x: BRIDGE_NORTH_STAIRS_BOTTOM.x, y: BRIDGE_NORTH_STAIRS_BOTTOM.y, nodeId: 'bridge_north_stairs_bottom' })
          result.push({ floor, x: BRIDGE_NORTH_STAIRS_TOP.x, y: BRIDGE_NORTH_STAIRS_TOP.y, nodeId: 'bridge_north_stairs_top' })
        }
        continue
      }
    }

    result.push(current)
  }

  // Deduplicate consecutive identical points if any
  return result.filter((p, idx) => {
    if (idx === 0) return true
    const prev = result[idx - 1]
    return p.x !== prev.x || p.y !== prev.y
  })
}

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

/**
 * Returns true if a room is an active transition stair on the current floor
 * (where the route leaves the floor or arrived from another floor),
 * so that the stair POI pin can be hidden and cleanly replaced by the floor change button.
 */
export function isRouteTransitionStair(
  room: Pick<Room, 'id' | 'coordinates' | 'category' | 'floor'>,
  route: { path: RoutePoint[] } | null | undefined,
  currentFloor: number,
): boolean {
  if (!route || room.floor !== currentFloor) return false
  const destLocationId = route.path[route.path.length - 1]?.locationId
  if (destLocationId && room.id === destLocationId) return false
  const originLocationId = route.path[0]?.locationId
  if (originLocationId && room.id === originLocationId) return false

  const legs = splitRouteByFloor(route.path)
  return legs.some((leg, index) => {
    if (leg.floor !== currentFloor) return false
    const prev = legs[index - 1]
    const following = legs[index + 1]

    if (following) {
      const exitPt = leg.points[leg.points.length - 1]
      if (
        (exitPt.locationId && room.id === exitPt.locationId) ||
        (room.category === 'stairs' &&
          Math.hypot(room.coordinates.x - exitPt.x, room.coordinates.y - exitPt.y) < 25)
      ) {
        return true
      }
    }

    if (prev) {
      const entryPt = leg.points[0]
      if (
        (entryPt.locationId && room.id === entryPt.locationId) ||
        (room.category === 'stairs' &&
          Math.hypot(room.coordinates.x - entryPt.x, room.coordinates.y - entryPt.y) < 25)
      ) {
        return true
      }
    }

    return false
  })
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
