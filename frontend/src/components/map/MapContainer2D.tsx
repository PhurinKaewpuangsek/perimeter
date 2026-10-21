import { useRef, useEffect, useState } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { Crosshair, Plus, Minus } from '@phosphor-icons/react'
import type { Room } from '../../types/room'

import { FLOOR_CONFIGS, getFloorConfig } from './floorConfig'
import FloorPlanSvg from './FloorPlanSvg'
import RoomMarkers from './RoomMarkers'
import './MapContainer.css'

export interface MapContainerProps {
  rooms: Room[]
  currentFloor: number
  onFloorChange: (floor: number) => void
  selectedRoomId: string | null
  onSelectRoom: (roomId: string) => void
  onClearSelection?: () => void
  /**
   * 'public' (default) — standard interactive map view used on /map.
   * 'admin'            — same map but `onSelectRoom` targets the admin panel instead of a modal.
   *                      No visual difference; the prop exists so callers can document intent.
   */
  mode?: 'public' | 'admin'
  initialScale?: number
  isDetailOpen?: boolean
  /** Screen area occupied by the public page sidebar, for 3D camera framing. */
  sidebarWidth?: number
  /** Enable landing-page 3D idle 360 auto-orbit. */
  idleOrbit?: boolean
  /** Stop the idle 3D orbit when the user interacts with external UI (e.g. search bar). */
  demoInterrupted?: boolean
  /** Controlled 2D/3D view mode when managed by parent page */
  viewMode?: '2d' | '3d'
  onViewModeChange?: (view: '2d' | '3d') => void
  /** Hide duplicate floor/2D controls when rendered inside TopBar's unified bottom dock */
  hideBottomControls?: boolean
  /** Suppress internal floor switcher when parent (MapContainer) renders unified dock */
  hideFloorSwitcher?: boolean
}

const PADDING_X = 300
const PADDING_Y = 240

function MapContainer({
  rooms,
  currentFloor,
  onFloorChange,
  selectedRoomId,
  onSelectRoom,
  onClearSelection,
  initialScale = 1,
  isDetailOpen = false,
  hideBottomControls = false,
  hideFloorSwitcher = false,
}: MapContainerProps) {
  const floorConfig = getFloorConfig(currentFloor)
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  // Read once per mount; every pan/zoom animation below becomes an instant jump.
  const [reduceMotion] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const motion = (ms: number) => (reduceMotion ? 0 : ms)

  useEffect(() => {
    if (!selectedRoomId) return
    const room = rooms.find((r) => r.id === selectedRoomId)
    if (!room || room.floor !== currentFloor) return

    // Small delay to ensure SVG and layout are ready
    const timer = setTimeout(() => {
      if (!transformRef.current) return
      const wrapper = transformRef.current.instance?.wrapperComponent
      const wrapperWidth = wrapper?.clientWidth ?? window.innerWidth
      const wrapperHeight = wrapper?.clientHeight ?? window.innerHeight

      const isMobile = wrapperWidth < 640
      const targetScale = 1.8

      // On mobile: top search bar takes ~65px and bottom modal takes ~40-45% of height.
      // Target the vertical center of the open map area (~36% of viewport height).
      // On desktop: search panel sits on the left and modal card on the right.
      // Target the center of the viewport (wrapperWidth / 2, wrapperHeight / 2).
      const targetX = wrapperWidth / 2
      const targetY = isMobile ? wrapperHeight * 0.36 : wrapperHeight / 2

      const posX = targetX - (room.coordinates.x + PADDING_X) * targetScale
      const posY = targetY - (room.coordinates.y + PADDING_Y) * targetScale

      transformRef.current.setTransform(posX, posY, targetScale, reduceMotion ? 0 : 650, 'easeOutCubic')
    }, 50)

    return () => clearTimeout(timer)
  }, [selectedRoomId, currentFloor, rooms, reduceMotion])

  return (
    <div className="map2d relative h-full w-full overflow-hidden">
      {/* Unified Right-Edge Vertical Zoom Stack (⌖, +, -) */}
      <div
        className={`absolute z-2 flex flex-col items-center overflow-hidden border border-line-soft bg-white shadow-floating divide-y divide-line-soft transition-all ${
          hideBottomControls
            ? selectedRoomId && isDetailOpen
              ? 'bottom-[calc(55dvh+1rem)] right-4 sm:bottom-5 sm:right-5'
              : 'bottom-5 right-4 sm:bottom-5 sm:right-5'
            : selectedRoomId && isDetailOpen
              ? 'bottom-[calc(55dvh+5rem)] right-4 sm:bottom-20 sm:right-5'
              : 'bottom-20 right-4 sm:bottom-20 sm:right-5'
        }`}
      >
        <button
          type="button"
          aria-label="จัดกึ่งกลางแผนที่"
          title="คืนมุมเริ่มต้น"
          onClick={() => transformRef.current?.resetTransform(motion(650), 'easeOutCubic')}
          className="flex h-11 w-11 cursor-pointer items-center justify-center text-ink-2 transition-colors hover:bg-tertiary hover:text-ink active:bg-tertiary-hover"
        >
          <Crosshair size={19} weight="bold" aria-hidden="true" />
        </button>
        <div role="group" aria-label="Zoom controls" className="flex flex-col divide-y divide-line-soft">
          <button
            type="button"
            aria-label="ขยายแผนที่"
            onClick={() => transformRef.current?.zoomIn(0.4, motion(250), 'easeOutCubic')}
            className="flex h-11 w-11 cursor-pointer items-center justify-center text-ink-2 transition-colors hover:bg-tertiary hover:text-ink active:bg-tertiary-hover"
          >
            <Plus size={18} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="ย่อแผนที่"
            onClick={() => transformRef.current?.zoomOut(0.4, motion(250), 'easeOutCubic')}
            className="flex h-11 w-11 cursor-pointer items-center justify-center text-ink-2 transition-colors hover:bg-tertiary hover:text-ink active:bg-tertiary-hover"
          >
            <Minus size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      {!hideBottomControls && !hideFloorSwitcher && (
        /* Floor switcher floating on the map (Matching 3D pill styling) */
        <div
          role="group"
          aria-label="Floor switcher"
          className={`gooey-switch-group absolute z-2 h-12 rounded-full border border-line-soft bg-white p-1.5 shadow-floating sm:h-11 sm:p-1 ${
            selectedRoomId && isDetailOpen
              ? 'bottom-[calc(55dvh+1rem)] right-4 sm:bottom-[calc(55dvh+1rem)] sm:right-5'
              : 'bottom-5 right-4 sm:bottom-5 sm:right-5'
          }`}
        >
          {(() => {
            const activeIdx = Math.max(
              0,
              FLOOR_CONFIGS.findIndex((f) => f.floor === currentFloor),
            )
            const blobTransform = `translateX(${activeIdx * 100}%)`
            return (
              <div aria-hidden="true" className="gooey-switch-blobs inset-1.5 sm:inset-1">
                <span
                  className="gooey-pill-lead"
                  style={{ width: `${100 / FLOOR_CONFIGS.length}%`, transform: blobTransform }}
                />
                <span
                  className="gooey-pill-drop"
                  style={{ width: `${100 / FLOOR_CONFIGS.length}%`, transform: blobTransform }}
                />
                <span
                  className="gooey-pill-trail"
                  style={{ width: `${100 / FLOOR_CONFIGS.length}%`, transform: blobTransform }}
                />
              </div>
            )
          })()}
          {FLOOR_CONFIGS.map((config) => {
            const isActive = config.floor === currentFloor
            return (
              <button
                key={config.floor}
                type="button"
                aria-pressed={isActive}
                onClick={() => onFloorChange(config.floor)}
                className={`btn btn-sm gooey-switch-btn ${
                  isActive ? 'text-white' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {config.label}
              </button>
            )
          })}
        </div>
      )}

      <TransformWrapper
        ref={transformRef}
        initialScale={initialScale}
        minScale={0.8}
        maxScale={4}
        centerOnInit
        centerZoomedOut
        limitToBounds={true}
        disablePadding={false}
        smooth={false}
        wheel={{
          step: 0.2,
          disabled: false,
          wheelDisabled: false,
          touchPadDisabled: false,
        }}
        zoomAnimation={{
          disabled: false,
          size: 0.2,
          animationTime: motion(200),
          animationType: 'easeOutCubic',
        }}
        autoAlignment={{
          sizeX: 300,
          sizeY: 250,
          animationTime: motion(650),
          velocityAlignmentTime: motion(650),
          animationType: 'easeOutCubic',
        }}
        doubleClick={{
          animationTime: motion(650),
          animationType: 'easeOutCubic',
        }}
        velocityAnimation={{
          disabled: reduceMotion,
          animationTime: 400,
          animationType: 'easeOutCubic',
        }}
      >

        <TransformComponent
          wrapperClass="w-full h-full overflow-hidden"
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ padding: `${PADDING_Y}px ${PADDING_X}px` }}
        >

          <div
            data-testid="map-background"
            style={{ position: 'relative', width: floorConfig.width, height: floorConfig.height }}
            onPointerDown={(e) => {
              pointerStartRef.current = { x: e.clientX, y: e.clientY }
            }}
            onClick={(e) => {
              if (pointerStartRef.current) {
                const dx = Math.abs(e.clientX - pointerStartRef.current.x)
                const dy = Math.abs(e.clientY - pointerStartRef.current.y)
                if (dx > 5 || dy > 5) return
              }
              onClearSelection?.()
            }}
          >
            <FloorPlanSvg floorConfig={floorConfig} />
            <RoomMarkers
              rooms={rooms}
              currentFloor={currentFloor}
              floorConfig={floorConfig}
              selectedRoomId={selectedRoomId}
              onSelectRoom={onSelectRoom}
            />
          </div>
        </TransformComponent>
      </TransformWrapper>

    </div>
  )
}

export default MapContainer
