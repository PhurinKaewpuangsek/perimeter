import type { Coordinates } from '../../types/room'

// Reference rectangles from the approved assembly's svg-audit-inventory.json.
// Export: glTF (x,y,z) = (Blender x + 34, Blender z, -Blender y).
const REFERENCES: Record<number, { svg: number[]; bounds: number[] }> = {
  1: {
    svg: [95, 50, 441, 501],
    bounds: [-59.67499923706055, -37.625, -8.998099327087402, 16.04660987854004],
  },
  2: {
    svg: [-1, 20, 1047, 443],
    bounds: [-60.426795959472656, -6.042629241943359, -6.071044921875, 16.93478012084961],
  },
}
function reference(floor: number) {
  const result = REFERENCES[floor]
  if (!result) throw new Error(`Unsupported 3D floor: ${floor}`)
  return result
}
export function svgToModel(floor: number, point: Coordinates, height = 0.49) {
  const {
    svg: [x, y, w, h],
    bounds: [left, right, bottom, top],
  } = reference(floor)
  return {
    x: left + 34 + ((point.x - x) / w) * (right - left),
    y: (floor - 1) * 3.2 + height,
    z: -top + ((point.y - y) / h) * (top - bottom),
  }
}
export function modelToSvg(floor: number, point: { x: number; z: number }): Coordinates {
  const {
    svg: [x, y, w, h],
    bounds: [left, right, bottom, top],
  } = reference(floor)
  return {
    x: x + ((point.x - 34 - left) / (right - left)) * w,
    y: y + ((point.z + top) / (top - bottom)) * h,
  }
}
export function isMapTap(start: Coordinates, end: Coordinates, multiTouch = false) {
  return !multiTouch && Math.hypot(end.x - start.x, end.y - start.y) <= 5
}
