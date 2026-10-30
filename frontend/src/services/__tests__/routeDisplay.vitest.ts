import { describe, expect, it } from 'vitest'
import {
  BRIDGE_DECK_SOUTH,
  BRIDGE_NORTH_STAIRS_BOTTOM,
  BRIDGE_NORTH_STAIRS_TOP,
  FLOOR_2_STAIR_2_X,
  FOUNTAIN_CENTER,
  FOUNTAIN_RIM_RADIUS,
  calculateTurnAngle,
  generateLegInstructions,
  getDisplayRoutePoints,
  getFloorChangeLabel,
  getPlaceLabel,
  getRouteKey,
  isBridgeCrossing,
  isNearFountain,
  isNorthStairsEdge,
  isPointOnBridgeDeck,
  isRoomInRouteCorridor,
  isRouteTransitionStair,
  pointToSegmentDistance,
  splitRouteByFloor,
} from '../routeDisplay'
import type { RoutePoint } from '../../types/route'
import type { Room } from '../../types/room'

const point = (nodeId: string, floor: number): RoutePoint => ({ nodeId, floor, x: 0, y: 0 })

describe('splitRouteByFloor', () => {
  it('keeps a single-floor route as one leg', () => {
    const legs = splitRouteByFloor([point('a', 1), point('b', 1)])
    expect(legs).toHaveLength(1)
    expect(legs[0]).toEqual({ floor: 1, points: [point('a', 1), point('b', 1)] })
  })

  it('splits where the route changes floor, in walking order', () => {
    const legs = splitRouteByFloor([point('a', 1), point('s1', 1), point('s2', 2), point('b', 2)])
    expect(legs.map((leg) => [leg.floor, leg.points.map((p) => p.nodeId)])).toEqual([
      [1, ['a', 's1']],
      [2, ['s2', 'b']],
    ])
  })

  it('gives a floor visited twice two separate legs', () => {
    const legs = splitRouteByFloor([point('a', 1), point('b', 2), point('c', 1)])
    expect(legs.map((leg) => leg.floor)).toEqual([1, 2, 1])
  })

  it('returns no legs for an empty path', () => {
    expect(splitRouteByFloor([])).toEqual([])
  })
})

describe('labels', () => {
  it('says up or down the stairs to the next floor', () => {
    expect(getFloorChangeLabel(1, 2)).toBe('ขึ้นบันไดไปชั้น 2')
    expect(getFloorChangeLabel(2, 1)).toBe('ลงบันไดไปชั้น 1')
  })

  it('names a room by its number and a POI by its name', () => {
    expect(getPlaceLabel({ roomNumber: '105', nameThai: 'ห้องบรรยาย', code: 'LC3-105' })).toBe('ห้อง 105')
    expect(getPlaceLabel({ roomNumber: '', nameThai: 'ห้องน้ำหญิง (ฝั่งซ้าย)', code: 'X' })).toBe('ห้องน้ำหญิง (ฝั่งซ้าย)')
  })
})

describe('getRouteKey', () => {
  it('is the same for the same path and floor', () => {
    expect(getRouteKey([point('a', 1), point('b', 2)], 1)).toBe(getRouteKey([point('a', 1), point('b', 2)], 1))
  })

  it('changes with the path or the floor shown', () => {
    const key = getRouteKey([point('a', 1), point('b', 2)], 1)
    expect(getRouteKey([point('a', 1), point('c', 2)], 1)).not.toBe(key)
    expect(getRouteKey([point('a', 1), point('b', 2)], 2)).not.toBe(key)
  })
})

describe('isRoomInRouteCorridor', () => {
  const path: RoutePoint[] = [
    { nodeId: 'p1', floor: 1, x: 100, y: 100 },
    { nodeId: 'p2', floor: 1, x: 200, y: 100 },
    { nodeId: 'p3', floor: 1, x: 200, y: 200 },
  ]

  it('calculates point-to-segment distance correctly', () => {
    // Directly perpendicular to segment
    expect(pointToSegmentDistance(150, 150, 100, 100, 200, 100)).toBe(50)
    // Closest to segment endpoint
    expect(pointToSegmentDistance(50, 100, 100, 100, 200, 100)).toBe(50)
  })

  it('identifies rooms within the corridor threshold along the path', () => {
    // Room 40 units off the (100,100)-(200,100) segment
    const roomAlongPath = { coordinates: { x: 150, y: 140 } }
    expect(isRoomInRouteCorridor(roomAlongPath, path, 95)).toBe(true)

    // Room exactly on the corner (200, 100)
    const roomAtCorner = { coordinates: { x: 200, y: 100 } }
    expect(isRoomInRouteCorridor(roomAtCorner, path, 95)).toBe(true)
  })

  it('excludes rooms far away in other wings', () => {
    // Room 300 units away
    const farRoom = { coordinates: { x: 500, y: 500 } }
    expect(isRoomInRouteCorridor(farRoom, path, 95)).toBe(false)
  })

  it('returns false for empty floor route points', () => {
    const room = { coordinates: { x: 100, y: 100 } }
    expect(isRoomInRouteCorridor(room, [], 95)).toBe(false)
  })
})

describe('calculateTurnAngle and generateLegInstructions', () => {
  it('detects 90-degree right and left turns correctly', () => {
    // Walking right (100,100 -> 200,100), then turning down to (200,200) -> right turn in SVG (+y down)
    const right = calculateTurnAngle({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 })
    expect(right.isTurn).toBe(true)
    expect(right.turnType).toBe('turn-right')
    expect(Math.round(right.angleDeg)).toBe(90)

    // Walking right (100,100 -> 200,100), then turning up to (200,0) -> left turn in SVG
    const left = calculateTurnAngle({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 0 })
    expect(left.isTurn).toBe(true)
    expect(left.turnType).toBe('turn-left')
    expect(Math.round(left.angleDeg)).toBe(90)

    // Continuing straight (100,100 -> 200,100 -> 300,100) -> no turn
    const straight = calculateTurnAngle({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 })
    expect(straight.isTurn).toBe(false)
    expect(straight.turnType).toBe('straight')
  })

  it('generates landmark-based instructions along segments', () => {
    const legPoints: RoutePoint[] = [
      { nodeId: 'p0', floor: 1, x: 100, y: 100 },
      { nodeId: 'p1', floor: 1, x: 300, y: 100 },
      { nodeId: 'p2', floor: 1, x: 300, y: 250 },
    ]
    const testRooms = [
      { id: 'r1', roomNumber: '102/1', floor: 1, coordinates: { x: 150, y: 120 } },
      { id: 'r2', roomNumber: '101/1', floor: 1, coordinates: { x: 250, y: 120 } },
      { id: 'rDest', roomNumber: '105', floor: 1, coordinates: { x: 300, y: 250 } },
    ] as Room[]

    const steps = generateLegInstructions(
      legPoints,
      testRooms,
      1,
      true,
      'ห้อง 105',
      'ทางเข้าอาคาร 2',
      true,
      'rDest',
    )

    expect(steps).toHaveLength(2)
    expect(steps[0].text).toBe('เดินตรงผ่าน 102/1 - 101/1')
    expect(steps[1].turnType).toBe('turn-right')
    expect(steps[1].text).toBe('เลี้ยวขวาเข้าโถงห้อง 105')
  })
})

describe('getDisplayRoutePoints (fountain & bridge fixes)', () => {
  it('detects points near the fountain rim', () => {
    expect(isNearFountain({ x: 956, y: 334, nodeId: 'LC3_Junction_RRoundabout' })).toBe(true)
    expect(isNearFountain({ x: FOUNTAIN_CENTER.x, y: FOUNTAIN_CENTER.y })).toBe(true)
    expect(isNearFountain({ x: FOUNTAIN_CENTER.x + 30, y: FOUNTAIN_CENTER.y })).toBe(true)
    expect(isNearFountain({ x: FOUNTAIN_CENTER.x + 80, y: FOUNTAIN_CENTER.y })).toBe(false)
  })

  it('detects bridge crossing edges', () => {
    const southFoot: RoutePoint = { nodeId: 'LC3_Junction_QR1-1', floor: 1, x: 632, y: 434 }
    const northFoot: RoutePoint = { nodeId: 'LC3_Junction_MidBridge', floor: 1, x: 631, y: 291 }
    const hallway: RoutePoint = { nodeId: 'LC3_Junction_SM', floor: 1, x: 632, y: 484 }

    expect(isBridgeCrossing(southFoot, northFoot)).toBe(true)
    expect(isBridgeCrossing(northFoot, southFoot)).toBe(true)
    expect(isBridgeCrossing(hallway, southFoot)).toBe(false)
  })

  it('identifies coordinates on the bridge deck and north landing', () => {
    expect(isPointOnBridgeDeck({ floor: 1, x: 631.5, y: 350 })).toBe(true)
    expect(isPointOnBridgeDeck({ floor: 1, x: BRIDGE_DECK_SOUTH.x, y: BRIDGE_DECK_SOUTH.y })).toBe(true)
    // North landing nodes are elevated at height 1.0
    expect(isPointOnBridgeDeck({ floor: 1, x: 631, y: 291 })).toBe(true) // MidBridge
    expect(isPointOnBridgeDeck({ floor: 1, x: 640, y: 291 })).toBe(true) // NM4
    expect(isPointOnBridgeDeck({ floor: 1, x: 622, y: 291 })).toBe(true) // MStair
    expect(isPointOnBridgeDeck({ floor: 1, x: BRIDGE_NORTH_STAIRS_TOP.x, y: BRIDGE_NORTH_STAIRS_TOP.y })).toBe(true)
    // Feet of the stairs and ground points are outside the elevated deck
    expect(isPointOnBridgeDeck({ floor: 1, x: 632, y: 434 })).toBe(false) // QR1-1
    expect(isPointOnBridgeDeck({ floor: 1, x: BRIDGE_NORTH_STAIRS_BOTTOM.x, y: BRIDGE_NORTH_STAIRS_BOTTOM.y })).toBe(false)
    expect(isPointOnBridgeDeck({ floor: 1, x: 640, y: 254 })).toBe(false) // NM3
    // Different floor is false
    expect(isPointOnBridgeDeck({ floor: 2, x: 631.5, y: 350 })).toBe(false)
  })

  it('detects north stairs edges', () => {
    const nm4: RoutePoint = { nodeId: 'LC3_Junction_NM4', floor: 1, x: 640, y: 291 }
    const nm3: RoutePoint = { nodeId: 'LC3_Junction_NM3', floor: 1, x: 640, y: 254 }
    const midBridge: RoutePoint = { nodeId: 'LC3_Junction_MidBridge', floor: 1, x: 631, y: 291 }

    expect(isNorthStairsEdge(nm4, nm3)).toBe(true)
    expect(isNorthStairsEdge(nm3, nm4)).toBe(true)
    expect(isNorthStairsEdge(midBridge, nm4)).toBe(false)
  })

  it('curves smoothly around the fountain rim without entering water', () => {
    const routeLeg: RoutePoint[] = [
      { nodeId: 'LC3_Junction_SR3', floor: 1, x: 955, y: 440 },
      { nodeId: 'LC3_Junction_RRoundabout', floor: 1, x: 956, y: 334 },
      { nodeId: 'LC3_Junction_RRoundabout3', floor: 1, x: 1060, y: 334 },
    ]

    const displayPoints = getDisplayRoutePoints(routeLeg, 1)
    expect(displayPoints.length).toBeGreaterThan(routeLeg.length)
    // Neither the start nor end points are changed
    expect(displayPoints[0]).toEqual(routeLeg[0])
    expect(displayPoints[displayPoints.length - 1]).toEqual(routeLeg[2])

    // Every intermediate point must clear the fountain rim
    for (const pt of displayPoints) {
      if (pt === routeLeg[0] || pt === routeLeg[2]) continue
      const distToCenter = Math.hypot(pt.x - FOUNTAIN_CENTER.x, pt.y - FOUNTAIN_CENTER.y)
      expect(distToCenter).toBeGreaterThanOrEqual(FOUNTAIN_RIM_RADIUS)
      expect(Math.abs(distToCenter - 72)).toBeLessThanOrEqual(2)
    }
  })

  it('inserts bridge deck and north stairs waypoints without railing clipping', () => {
    const routeLeg: RoutePoint[] = [
      { nodeId: 'LC3_Junction_SM', floor: 1, x: 632, y: 484 },
      { nodeId: 'LC3_Junction_QR1-1', floor: 1, x: 632, y: 434 },
      { nodeId: 'LC3_Junction_MidBridge', floor: 1, x: 631, y: 291 },
      { nodeId: 'LC3_Junction_NM4', floor: 1, x: 640, y: 291 },
      { nodeId: 'LC3_Junction_NM3', floor: 1, x: 640, y: 254 },
    ]

    const displayPoints = getDisplayRoutePoints(routeLeg, 1)
    expect(displayPoints.map((p) => p.nodeId)).toEqual([
      'LC3_Junction_SM',
      'LC3_Junction_QR1-1',
      'bridge_deck_south',
      'LC3_Junction_MidBridge',
      'LC3_Junction_NM4',
      'bridge_north_stairs_top',
      'bridge_north_stairs_bottom',
      'LC3_Junction_NM3',
    ])

    // In reverse (North to South)
    const reversedLeg = [...routeLeg].reverse()
    const reversedDisplay = getDisplayRoutePoints(reversedLeg, 1)
    expect(reversedDisplay.map((p) => p.nodeId)).toEqual([
      'LC3_Junction_NM3',
      'bridge_north_stairs_bottom',
      'bridge_north_stairs_top',
      'LC3_Junction_NM4',
      'LC3_Junction_MidBridge',
      'bridge_deck_south',
      'LC3_Junction_QR1-1',
      'LC3_Junction_SM',
    ])
  })

  it('does not alter non-stair points on floor 2', () => {
    const f2Leg: RoutePoint[] = [
      { nodeId: 'LC3_F2_A', floor: 2, x: 956, y: 334 },
      { nodeId: 'LC3_F2_B', floor: 2, x: 1060, y: 334 },
    ]
    expect(getDisplayRoutePoints(f2Leg, 2)).toEqual(f2Leg)
  })

  it('aligns floor 2 stair-2 node with the connecting stairs center (x=521)', () => {
    const f2StairLeg: RoutePoint[] = [
      { nodeId: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228 },
      { nodeId: 'LC3_F2_hallway-5', floor: 2, x: 529, y: 198 },
      { nodeId: 'LC3_F2_dest', floor: 2, x: 600, y: 198 },
    ]
    const displayPoints = getDisplayRoutePoints(f2StairLeg, 2)
    expect(displayPoints[0]).toEqual({ nodeId: 'LC3_F2_stair-2', floor: 2, x: FLOOR_2_STAIR_2_X, y: 228 })
    expect(displayPoints[1]).toEqual({ nodeId: 'LC3_F2_hallway-5', floor: 2, x: FLOOR_2_STAIR_2_X, y: 198 })
    expect(displayPoints[2]).toEqual({ nodeId: 'LC3_F2_dest', floor: 2, x: 600, y: 198 })
  })

  it('elevates LC3_stair-2 on the north bridge landing platform', () => {
    expect(isPointOnBridgeDeck({ floor: 1, x: 622, y: 270 })).toBe(true)
    expect(isPointOnBridgeDeck({ floor: 1, x: 631, y: 291 })).toBe(true)
    expect(isPointOnBridgeDeck({ floor: 1, x: 622, y: 291 })).toBe(true)
  })
})

describe('isRouteTransitionStair', () => {
  const multiFloorRoute = {
    found: true,
    distance: 100,
    floors: [1, 2],
    path: [
      { nodeId: 'start', floor: 1, x: 632, y: 484, locationId: 'entrance-1' },
      { nodeId: 'LC3_stair-2', floor: 1, x: 622, y: 270, locationId: 'LC3-F1-PSTAIR-2' },
      { nodeId: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228, locationId: 'LC3-F2-PSTAIR-2' },
      { nodeId: 'dest', floor: 2, x: 500, y: 200, locationId: 'LC3-F2-R203' },
    ],
    closuresAvoided: [],
  }

  const stairF1: Room = {
    id: 'LC3-F1-PSTAIR-2',
    code: 'STAIR-2',
    nameThai: 'บันได 2',
    building: 'LC3',
    floor: 1,
    roomNumber: '',
    category: 'stairs',
    coordinates: { x: 622, y: 270 },
    landmarks: [],
    aliases: [],
  }

  const stairF2: Room = {
    id: 'LC3-F2-PSTAIR-2',
    code: 'F2-STAIR-2',
    nameThai: 'บันได 2',
    building: 'LC3',
    floor: 2,
    roomNumber: '',
    category: 'stairs',
    coordinates: { x: 529, y: 228 },
    landmarks: [],
    aliases: [],
  }

  const otherStair: Room = {
    id: 'LC3-F1-PSTAIR-1',
    code: 'STAIR-1',
    nameThai: 'บันได 1',
    building: 'LC3',
    floor: 1,
    roomNumber: '',
    category: 'stairs',
    coordinates: { x: 160, y: 340 },
    landmarks: [],
    aliases: [],
  }

  it('identifies floor 1 transition stair when route leaves to floor 2', () => {
    expect(isRouteTransitionStair(stairF1, multiFloorRoute, 1)).toBe(true)
    // Non-transition stair on floor 1 remains false
    expect(isRouteTransitionStair(otherStair, multiFloorRoute, 1)).toBe(false)
  })

  it('identifies floor 2 transition stair when route entered from floor 1', () => {
    expect(isRouteTransitionStair(stairF2, multiFloorRoute, 2)).toBe(true)
    // Floor 1 stair checked while on floor 2 returns false
    expect(isRouteTransitionStair(stairF1, multiFloorRoute, 2)).toBe(false)
  })

  it('returns false when there is no active route', () => {
    expect(isRouteTransitionStair(stairF1, null, 1)).toBe(false)
    expect(isRouteTransitionStair(stairF1, undefined, 1)).toBe(false)
  })

  it('does not hide the stair if the stair itself is the destination', () => {
    const routeToStair = {
      found: true,
      distance: 50,
      floors: [1],
      path: [
        { nodeId: 'start', floor: 1, x: 632, y: 484 },
        { nodeId: 'LC3_stair-2', floor: 1, x: 622, y: 270, locationId: 'LC3-F1-PSTAIR-2' },
      ],
      closuresAvoided: [],
    }
    expect(isRouteTransitionStair(stairF1, routeToStair, 1)).toBe(false)
  })
})
