import { describe, expect, it } from 'vitest'
import { getFloorChangeLabel, getPlaceLabel, getRouteKey, splitRouteByFloor } from '../routeDisplay'
import type { RoutePoint } from '../../types/route'

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
