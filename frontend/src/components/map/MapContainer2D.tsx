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
        className={`absolute z-10 flex flex-col items-center rounded-2xl bg-white/95 backdrop-blur-md shadow-md border border-slate-200/80 divide-y divide-slate-100 overflow-hidden transition-all ${
          hideBottomControls
            ? selectedRoomId && isDetailOpen
              ? 'bottom-[calc(55dvh+1rem)] right-4 sm:bottom-5 sm:right-5'
              : 'bottom-5 right-4 sm:bottom-5 sm:right-5'
            : selectedRoomId && isDetailOpen
              ? 'bottom-[calc(55dvh+4.5rem)] right-4 sm:bottom-18 sm:right-5'
              : 'bottom-18 right-4 sm:bottom-18 sm:right-5'
        }`}
      >
        <button
          type="button"
          aria-label="จัดกึ่งกลางแผนที่"
          title="คืนมุมเริ่มต้น"
          onClick={() => transformRef.current?.resetTransform(motion(650), 'easeOutCubic')}
          className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 transition-colors cursor-pointer"
        >
          <Crosshair size={19} weight="bold" aria-hidden="true" />
        </button>
        <div role="group" aria-label="Zoom controls" className="flex flex-col divide-y divide-slate-100">
          <button
            type="button"
            aria-label="ขยายแผนที่"
            onClick={() => transformRef.current?.zoomIn(0.4, motion(250), 'easeOutCubic')}
            className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 transition-colors cursor-pointer"
          >
            <Plus size={18} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="ย่อแผนที่"
            onClick={() => transformRef.current?.zoomOut(0.4, motion(250), 'easeOutCubic')}
            className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 transition-colors cursor-pointer"
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
          className={`absolute z-10 flex h-10 items-center gap-1 rounded-full border border-slate-200/80 bg-white/95 p-1 shadow-md backdrop-blur-xl ${
            selectedRoomId && isDetailOpen
              ? 'bottom-[calc(55dvh+1rem)] right-4 sm:bottom-[calc(55dvh+1rem)] sm:right-5'
              : 'bottom-5 right-4 sm:bottom-5 sm:right-5'
          }`}
        >
          {FLOOR_CONFIGS.map((config) => {
            const isActive = config.floor === currentFloor
            return (
              <button
                key={config.floor}
                type="button"
                aria-pressed={isActive}
                onClick={() => onFloorChange(config.floor)}
                className={`h-8 rounded-full px-3 text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
