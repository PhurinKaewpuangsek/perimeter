import { describe, expect, it } from 'vitest'
import { findRoomAt, isMapTap, modelToSvg, svgToModel } from '../modelCoordinates'
import { ROOM_AREAS } from '../roomAreaGeometry'
import type { Room } from '../../../types/room'

describe('SVG to approved GLB alignment', () => {
  it('matches independently measured opposite corners of the floor 1 reference', () => {
    const top = svgToModel(1, { x: 95, y: 50 })
    const bottom = svgToModel(1, { x: 536, y: 551 })
    expect(top.x).toBeCloseTo(-25.675, 4)
    expect(top.z).toBeCloseTo(-16.04661, 4)
    expect(bottom.x).toBeCloseTo(-3.625, 4)
    expect(bottom.z).toBeCloseTo(8.998099, 4)
  })
  it('uses the independently scaled and translated floor 2, at its exported elevation', () => {
    const top = svgToModel(2, { x: -1, y: 20 })
    const bottom = svgToModel(2, { x: 1046, y: 463 })
    expect(top.x).toBeCloseTo(-26.426796, 4)
    expect(top.z).toBeCloseTo(-16.93478, 4)
    expect(bottom.x).toBeCloseTo(27.957371, 4)
    expect(bottom.z).toBeCloseTo(6.071045, 4)
    expect(top.y).toBeCloseTo(3.69)
  })
  it.each([1, 2])(
    'returns ray-picked floor %i positions to the original API coordinate system',
    (floor) => {
      const svg = { x: 423.5, y: 280.25 }
      const restored = modelToSvg(floor, svgToModel(floor, svg))
      expect(restored.x).toBeCloseTo(svg.x, 8)
      expect(restored.y).toBeCloseTo(svg.y, 8)
    },
  )
  it('does not treat a drag or a two-finger gesture as a room selection', () => {
    expect(isMapTap({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(true)
    expect(isMapTap({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(false)
    expect(isMapTap({ x: 10, y: 10 }, { x: 10, y: 10 }, true)).toBe(false)
  })
  it('maps a floor ray hit back to the room whose SVG area contains it', () => {
    const [id, area] = Object.entries(ROOM_AREAS).find(([, a]) => a.floor === 1)!
    const room = { id, floor: 1 } as Room
    const centre = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
    const hit = svgToModel(1, centre)
    expect(findRoomAt([room], 1, modelToSvg(1, hit))).toBe(room)
    expect(findRoomAt([room], 2, centre)).toBeUndefined()
    expect(findRoomAt([room], 1, { x: area.x - 1, y: area.y - 1 })).toBeUndefined()
  })
})
