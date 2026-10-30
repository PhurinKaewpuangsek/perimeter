import { describe, expect, it } from 'vitest'
import {
  calculateTurnAngle,
  generateLegInstructions,
  getFloorChangeLabel,
  getPlaceLabel,
  getRouteKey,
  isRoomInRouteCorridor,
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
