/**
 * Start and destination icons for a route, in the Google Maps directions style, shared by
 * the navigation panel, the 2D route overlay and the 3D marker pills so all three match:
 *
 * - Start: a hollow ring (white with a dark outline).
 * - Destination: a red map pin with a dark-red centre.
 *
 * Red is already the map-pin colour in this app (roomDisplay.ts reserves the red family for
 * map pins), so the destination pin reads as "the place you are going". The pin path is
 * Phosphor's MapPin (fill weight) on a 256x256 grid.
 */
export const PIN_ICON_PATH =
  'M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z'

/** Pin body and centre colours (Google Maps' destination pin). */
export const PIN_RED = '#EA4335'
export const PIN_RED_DARK = '#B31412'

/** Centre dot of the pin on the 256 grid; it fills the path's hole. */
export const PIN_DOT = { cx: 128, cy: 104, r: 32 } as const

/** Bottom tip of the pin on the 256 grid, so the pin can stand on the route's last point. */
export const PIN_TIP = { x: 128, y: 240 } as const

/** Outline colour of the start ring. */
export const START_RING_COLOR = '#000000'

/** A plain-DOM red pin <svg>, for the 3D marker pills (built without React). */
export function createPinSvg(className: string, size: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 256 256')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', className)
  const dot = document.createElementNS(ns, 'circle')
  dot.setAttribute('cx', String(PIN_DOT.cx))
  dot.setAttribute('cy', String(PIN_DOT.cy))
  dot.setAttribute('r', String(PIN_DOT.r))
  dot.setAttribute('fill', PIN_RED_DARK)
  const body = document.createElementNS(ns, 'path')
  body.setAttribute('d', PIN_ICON_PATH)
  body.setAttribute('fill', PIN_RED)
  svg.append(dot, body)
  return svg
}
