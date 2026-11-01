import { useState } from 'react'
import { ArrowDown, ArrowUp } from '@phosphor-icons/react'
import type { FoundRoute } from '../../types/route'
import type { FloorConfig } from './floorConfig'
import { useTransformScale } from './useTransformScale'
import {
  getDisplayRoutePoints,
  getFloorChangeLabel,
  getRouteKey,
  splitRouteByFloor,
} from '../../services/routeDisplay'

interface RouteOverlayProps {
  route: FoundRoute
  currentFloor: number
  floorConfig: FloorConfig
  onFloorChange: (floor: number) => void
  /** Draw the line in from the start when a route or floor is shown (off for reduced motion). */
  animate?: boolean
}

/** Black route line with a white casing so it reads over every room fill. */
const LINE_COLOR = '#000000'
const CASING_COLOR = '#FFFFFF'

/**
 * The part of a route on the floor being shown, drawn over the 2D floor plan: the line,
 * a round start marker, a square end marker and, where the route takes the stairs, a
 * button that switches to the floor it continues on.
 */
export default function RouteOverlay({
  route,
  currentFloor,
  floorConfig,
  onFloorChange,
  animate = false,
}: RouteOverlayProps) {
  const scale = useTransformScale()
  const invScale = 1 / (scale || 1)
  const legs = splitRouteByFloor(route.path)
  const start = route.path[0]
  const end = route.path[route.path.length - 1]
  // Each route-and-floor is drawn in once; after that the line is static.
  const drawKey = getRouteKey(route.path, currentFloor)
  const [drawnKey, setDrawnKey] = useState<string>()
  const drawing = animate && drawnKey !== drawKey
  const isMobile =
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  const casingWidth = isMobile ? 12 : 9
  const lineWidth = isMobile ? 7 : 5
  const arrowScale = isMobile ? invScale : invScale * 0.75
  const minSeg = isMobile ? 28 : 20
  const arrowSpacing = isMobile ? 55 : 40

  // While drawing, the dash is measured along the line (pathLength 1) in floor-plan units,
  // so the width is counter-scaled by hand: a non-scaling stroke would measure the dash in
  // screen pixels, which change while the view glides to the route.
  const stroke = (width: number) =>
    drawing
      ? { pathLength: 1, className: 'animate-route-draw', strokeWidth: width * invScale }
      : { strokeWidth: width, vectorEffect: 'non-scaling-stroke' as const }

  return (
    <>
      <svg
        data-testid="route-overlay"
        viewBox={`0 0 ${floorConfig.width} ${floorConfig.height}`}
        width={floorConfig.width}
        height={floorConfig.height}
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
      >
        {legs.map((leg, index) => {
          if (leg.floor !== currentFloor) return null
          const displayPoints = getDisplayRoutePoints(leg.points, leg.floor)
          if (displayPoints.length < 2) return null
          const points = displayPoints.map((point) => `${point.x},${point.y}`).join(' ')
          return (
            <g key={`${drawKey}-${index}`} data-testid="route-line">
              <polyline
                points={points}
                fill="none"
                stroke={CASING_COLOR}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...stroke(casingWidth)}
              />
              <polyline
                points={points}
                fill="none"
                stroke={LINE_COLOR}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...stroke(lineWidth)}
                onAnimationEnd={drawing ? () => setDrawnKey(drawKey) : undefined}
              />
              {!drawing &&
                displayPoints.slice(1).map((point, i) => {
                  const prev = displayPoints[i]
                  const dx = point.x - prev.x
                  const dy = point.y - prev.y
                  const segLength = Math.hypot(dx, dy)
                  if (segLength < minSeg) return null
                  const arrowCount = Math.max(1, Math.floor(segLength / arrowSpacing))
                  const step = segLength / (arrowCount + 1)
                  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
                  const arrows = []
                  for (let a = 1; a <= arrowCount; a++) {
                    const ax = prev.x + (dx / segLength) * a * step
                    const ay = prev.y + (dy / segLength) * a * step
                    arrows.push(
                      <path
                        key={`arrow-${i}-${a}`}
                        d="M 4.5 0 L -2 -3.5 L -1 -1.2 L -4 -1.2 L -4 1.2 L -1 1.2 L -2 3.5 Z"
                        fill="#FFFFFF"
                        transform={`translate(${ax}, ${ay}) rotate(${angle}) scale(${arrowScale})`}
                      />,
                    )
                  }
                  return <g key={`arrows-${i}`}>{arrows}</g>
                })}
            </g>
          )
        })}
        {start?.floor === currentFloor && (
          <g data-testid="route-start" transform={`translate(${start.x}, ${start.y}) scale(${invScale})`}>
            <circle r={11} fill={LINE_COLOR} stroke={CASING_COLOR} strokeWidth={2.5} />
            <circle r={4.5} fill={CASING_COLOR} />
          </g>
        )}
        {end && route.path.length > 1 && end.floor === currentFloor && (
          <g
            data-testid="route-end"
            className={drawing ? 'animate-route-reveal' : undefined}
            transform={`translate(${end.x}, ${end.y}) scale(${invScale})`}
          >
            <rect x={-10} y={-10} width={20} height={20} rx={2} fill={LINE_COLOR} stroke={CASING_COLOR} strokeWidth={2.5} />
            <rect x={-4} y={-4} width={8} height={8} fill={CASING_COLOR} />
          </g>
        )}
      </svg>

      {legs.flatMap((leg, index) => {
        if (leg.floor !== currentFloor) return []
        const prev = legs[index - 1]
        const next = legs[index + 1]
        const buttons: React.ReactNode[] = []
        const displayPoints = getDisplayRoutePoints(leg.points, leg.floor)

        if (next) {
          const stairs = displayPoints[displayPoints.length - 1]
          const label = getFloorChangeLabel(leg.floor, next.floor)
          const Arrow = next.floor > leg.floor ? ArrowUp : ArrowDown
          buttons.push(
            <button
              key={`next-${index}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onFloorChange(next.floor)
              }}
              className={`btn btn-primary btn-sm absolute z-20 shadow-floating whitespace-nowrap${drawing ? ' animate-route-reveal' : ''}`}
              style={{
                left: stairs.x,
                top: stairs.y,
                // Anchored at the stairs node, replacing the stair POI pin
                transform: `scale(${invScale}) translate(-50%, calc(-100% - 6px))`,
                transformOrigin: '0 0',
              }}
            >
              <Arrow size={14} weight="bold" aria-hidden="true" />
              <span>{label}</span>
            </button>
          )
        }

        if (prev) {
          const stairs = displayPoints[0]
          const label = getFloorChangeLabel(leg.floor, prev.floor)
          const Arrow = prev.floor > leg.floor ? ArrowUp : ArrowDown
          buttons.push(
            <button
              key={`prev-${index}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onFloorChange(prev.floor)
              }}
              className={`btn btn-primary btn-sm absolute z-20 shadow-floating whitespace-nowrap${drawing ? ' animate-route-reveal' : ''}`}
              style={{
                left: stairs.x,
                top: stairs.y,
                // Anchored at the stairs node, replacing the stair POI pin
                transform: `scale(${invScale}) translate(-50%, calc(-100% - 6px))`,
                transformOrigin: '0 0',
              }}
            >
              <Arrow size={14} weight="bold" aria-hidden="true" />
              <span>{label}</span>
            </button>
          )
        }

        return buttons
      })}
    </>
  )
}
