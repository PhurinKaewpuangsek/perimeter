import { createElement, useContext, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Context } from 'react-zoom-pan-pinch'
import type { Room } from '../../types/room'
import type { FloorConfig } from './floorConfig'
import { getCategoryIcon } from '../categoryIcon'
import { getCategoryPinColor } from '../../services/roomDisplay'
import {
  DOT_LABEL_FONT_SIZE,
  DOT_RADIUS,
  LABEL_FONT_SIZE,
  LABEL_GAP,
  SELECTED_PIN_HEAD_Y,
  SELECTED_PIN_WIDTH,
  getMarkerLabel,
  layoutMarkers,
} from '../../services/markerLayout'
import type { LabelSide } from '../../services/markerLayout'

export interface RoomMarkersProps {
  rooms: Room[]
  currentFloor: number
  floorConfig: FloorConfig
  selectedRoomId: string | null
  onSelectRoom: (roomId: string) => void
}

/**
 * Hover growth has to scale about the marker itself. SVG elements default to
 * `transform-box: view-box`, so a Tailwind origin class (origin-bottom, or the default
 * centre) resolves against the whole floor plan and the marker slides away from the
 * pointer — which drops the hover, snaps it back, and makes the marker flee the cursor.
 * Local (0,0) is the badge and dot centre, because the parent `g` translates there.
 */
const HOVER_ORIGIN = { transformOrigin: '0px 0px' } as const

/** Screen-px radius of the invisible tap target around a dot. */
const DOT_HIT_RADIUS = 11

const BADGE_ICON_SIZE = 12
const POI_PIN_HALF_WIDTH = 12

/**
 * Google Maps POI pin path for room badges:
 * Outer white pin body: width 24px, height 26.2px, top circle radius 12,
 * smooth horizontal tangent at rounded bottom tip (0, 14.2).
 */
const POI_BADGE_PATH =
  'M 0 14.2 C -3 14.2 -12 7 -12 0 A 12 12 0 1 1 12 0 C 12 7 3 14.2 0 14.2 Z'

/** Offset drop shadow (y + 1.3px) matching Google Maps POI elevation without CSS filter lag. */
const POI_SHADOW_PATH =
  'M 0 15.5 C -3 15.5 -12 8.3 -12 1.3 A 12 12 0 1 1 12 1.3 C 12 8.3 3 15.5 0 15.5 Z'

const POI_INNER_RADIUS = 9.2

/**
 * Selected pin: Google Maps iconic red teardrop pin with dark red circular dot.
 * Tip at (0, 0), head centred at (0, -23), radius 12.2, height 35.2.
 */
const SELECTED_PIN_PATH =
  'M 0 0 C -1 -4 -8.13 -10.55 -11.31 -18.43 A 12.2 12.2 0 1 1 11.31 -18.43 C 8.13 -10.55 1 -4 0 0 Z'

const SELECTED_PIN_COLOR = '#EA4335'
const SELECTED_PIN_BORDER_COLOR = '#B31412'
const SELECTED_PIN_DOT_COLOR = '#B31412'
const SELECTED_PIN_DOT_RADIUS = 4.4
const SELECTED_LABEL_COLOR = '#C5221F'

/**
 * Safely extracts current zoom scale from react-zoom-pan-pinch context.
 * Falls back to scale=1 in standalone test environments.
 */
function useTransformScale(): number {
  const transformContext = useContext(Context)
  const [scale, setScale] = useState<number>(
    transformContext?.state?.scale ?? 1
  )

  useEffect(() => {
    if (!transformContext) return
    const callback = (ref: { state: { scale: number } }) => {
      const currentScale = ref?.state?.scale
      if (currentScale && currentScale > 0) {
        setScale(currentScale)
      }
    }
    transformContext.onChangeCallbacks.add(callback)
    return () => {
      transformContext.onChangeCallbacks.delete(callback)
    }
  }, [transformContext])

  return scale
}

function renderIcon(room: Room, x: number, y: number, size: number): ReactNode {
  return createElement(getCategoryIcon(room.category, room.nameThai), {
    x,
    y,
    size,
    color: 'white',
    weight: 'fill',
    'aria-hidden': true,
  })
}

/** Room number (or POI name) beside a marker, with a white halo so it reads over any fill. */
function MarkerLabel({
  text,
  side,
  offset,
  y,
  color,
  fontSize = LABEL_FONT_SIZE,
  bold = false,
}: {
  text: string
  side: LabelSide
  offset: number
  y: number
  color: string
  fontSize?: number
  bold?: boolean
}) {
  return (
    <text
      x={side === 'right' ? offset : -offset}
      y={y}
      dominantBaseline="central"
      textAnchor={side === 'right' ? 'start' : 'end'}
      fontSize={fontSize}
      fontWeight={bold ? 700 : 600}
      fill={color}
      stroke="white"
      strokeWidth={fontSize / 4}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={{ userSelect: 'none' }}
    >
      {text}
    </text>
  )
}

function RoomMarkers({
  rooms,
  currentFloor,
  floorConfig,
  selectedRoomId,
  onSelectRoom,
}: RoomMarkersProps) {
  const scale = useTransformScale()
  const invScale = 1 / (scale || 1)
  // Re-run collision layout per 0.1 zoom step, not on every wheel frame.
  const layoutScale = Math.round((scale || 1) * 10) / 10

  const floorRooms = useMemo(
    () => rooms.filter((room) => room.floor === currentFloor),
    [rooms, currentFloor]
  )
  const layout = useMemo(
    () => layoutMarkers({ rooms: floorRooms, scale: layoutScale, selectedRoomId }),
    [floorRooms, layoutScale, selectedRoomId]
  )

  const dots = floorRooms.filter((room) => room.id !== selectedRoomId && layout.get(room.id)?.mode === 'dot')
  const badges = floorRooms.filter((room) => room.id !== selectedRoomId && layout.get(room.id)?.mode === 'badge')
  const selected = floorRooms.filter((room) => room.id === selectedRoomId)

  const interactiveProps = (room: Room, isSelected: boolean) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': room.nameThai || room.code || room.id,
    'aria-pressed': isSelected,
    style: { cursor: 'pointer', pointerEvents: 'auto' as const },
    onClick: (event: MouseEvent) => {
      event.stopPropagation()
      onSelectRoom(room.id)
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        onSelectRoom(room.id)
      }
    },
  })

  return (
    <svg
      viewBox={`0 0 ${floorConfig.width} ${floorConfig.height}`}
      width={floorConfig.width}
      height={floorConfig.height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      {/* Paint order: dots → badges (with labels) → selected. The layout guarantees no
          label overlaps another marker, so labels never end up under a later one. */}
      {dots.map((room) => {
        const color = getCategoryPinColor(room.category)
        const side = layout.get(room.id)?.label ?? null
        return (
          <g
            key={room.id}
            {...interactiveProps(room, false)}
            className="group"
            transform={`translate(${room.coordinates.x}, ${room.coordinates.y}) scale(${invScale})`}
          >
            <circle r={DOT_HIT_RADIUS} fill="transparent" />
            <circle
              data-testid="room-dot"
              r={DOT_RADIUS}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
              className="transition-transform duration-150 group-hover:scale-150"
              style={HOVER_ORIGIN}
            />
            {side && (
              <MarkerLabel
                text={getMarkerLabel(room)}
                side={side}
                offset={DOT_RADIUS + LABEL_GAP}
                y={0}
                color={color}
                fontSize={DOT_LABEL_FONT_SIZE}
              />
            )}
          </g>
        )
      })}

      {badges.map((room) => {
        const color = getCategoryPinColor(room.category)
        const side = layout.get(room.id)?.label ?? null
        return (
          <g
            key={room.id}
            {...interactiveProps(room, false)}
            className="group"
            transform={`translate(${room.coordinates.x}, ${room.coordinates.y}) scale(${invScale})`}
          >
            <g
              data-testid="room-badge"
              className="transition-transform duration-150 group-hover:scale-110"
              style={HOVER_ORIGIN}
            >
              {/* Simulated drop shadow matching Google Maps POI elevation */}
              <path d={POI_SHADOW_PATH} fill="#0f172a" fillOpacity={0.18} />
              {/* Google Maps POI white teardrop body */}
              <path d={POI_BADGE_PATH} fill="white" />
              {/* Concentric colored disc */}
              <circle r={POI_INNER_RADIUS} fill={color} />
              {renderIcon(room, -BADGE_ICON_SIZE / 2, -BADGE_ICON_SIZE / 2, BADGE_ICON_SIZE)}
            </g>
            {side && (
              <MarkerLabel
                text={getMarkerLabel(room)}
                side={side}
                offset={POI_PIN_HALF_WIDTH + LABEL_GAP}
                y={0}
                color={color}
              />
            )}
          </g>
        )
      })}

      {selected.map((room) => {
        const side = layout.get(room.id)?.label ?? 'right'
        return (
          <g
            key={room.id}
            {...interactiveProps(room, true)}
            transform={`translate(${room.coordinates.x}, ${room.coordinates.y}) scale(${invScale})`}
          >
            {/* Elliptical ground shadow under the pin tip */}
            <ellipse
              data-testid="room-selected-halo"
              cx={0}
              cy={1.5}
              rx={5}
              ry={2}
              fill="#000000"
              fillOpacity={0.22}
            />
            <g
              data-testid="room-selected-pin"
              className="animate-pin-drop"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.22))' }}
            >
              <path
                d={SELECTED_PIN_PATH}
                fill={SELECTED_PIN_COLOR}
                stroke={SELECTED_PIN_BORDER_COLOR}
                strokeWidth={0.8}
                strokeLinejoin="round"
              />
              <circle
                cx={0}
                cy={-SELECTED_PIN_HEAD_Y}
                r={SELECTED_PIN_DOT_RADIUS}
                fill={SELECTED_PIN_DOT_COLOR}
              />
            </g>
            <MarkerLabel
              text={getMarkerLabel(room)}
              side={side}
              offset={SELECTED_PIN_WIDTH / 2 + LABEL_GAP}
              y={-SELECTED_PIN_HEAD_Y}
              color={SELECTED_LABEL_COLOR}
              bold
            />
          </g>
        )
      })}
    </svg>
  )
}

export default RoomMarkers
