import { useState } from 'react'
import { ArrowDown, ArrowUp } from '@phosphor-icons/react'
import type { FoundRoute } from '../../types/route'
import type { FloorConfig } from './floorConfig'
import { useTransformScale } from './useTransformScale'
import { getFloorChangeLabel, getRouteKey, splitRouteByFloor } from '../../services/routeDisplay'

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
          if (leg.floor !== currentFloor || leg.points.length < 2) return null
          const points = leg.points.map((point) => `${point.x},${point.y}`).join(' ')
          return (
            <g key={`${drawKey}-${index}`} data-testid="route-line">
              <polyline
                points={points}
                fill="none"
                stroke={CASING_COLOR}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...stroke(9)}
              />
              <polyline
                points={points}
                fill="none"
                stroke={LINE_COLOR}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...stroke(5)}
                onAnimationEnd={drawing ? () => setDrawnKey(drawKey) : undefined}
              />
            </g>
          )
        })}
        {start?.floor === currentFloor && (
          <g data-testid="route-start" transform={`translate(${start.x}, ${start.y}) scale(${invScale})`}>
            <circle r={9} fill={LINE_COLOR} stroke={CASING_COLOR} strokeWidth={2} />
            <circle r={3.5} fill={CASING_COLOR} />
          </g>
        )}
        {end && route.path.length > 1 && end.floor === currentFloor && (
          <g
            data-testid="route-end"
            className={drawing ? 'animate-route-reveal' : undefined}
            transform={`translate(${end.x}, ${end.y}) scale(${invScale})`}
          >
            <rect x={-8} y={-8} width={16} height={16} fill={LINE_COLOR} stroke={CASING_COLOR} strokeWidth={2} />
            <rect x={-3} y={-3} width={6} height={6} fill={CASING_COLOR} />
          </g>
        )}
      </svg>

      {legs.map((leg, index) => {
        const next = legs[index + 1]
        if (!next || leg.floor !== currentFloor) return null
        const stairs = leg.points[leg.points.length - 1]
        const label = getFloorChangeLabel(leg.floor, next.floor)
        const Arrow = next.floor > leg.floor ? ArrowUp : ArrowDown
        return (
          <button
            key={index}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onFloorChange(next.floor)
            }}
            className={`btn btn-primary btn-sm absolute z-2 shadow-floating whitespace-nowrap${drawing ? ' animate-route-reveal' : ''}`}
            style={{
              left: stairs.x,
              top: stairs.y,
              // Anchored at the stairs (top-left = the point), kept at screen size like the pins.
              transform: `scale(${invScale}) translate(-50%, calc(-100% - 12px))`,
              transformOrigin: '0 0',
            }}
          >
            <Arrow size={14} weight="bold" aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
    </>
  )
}
