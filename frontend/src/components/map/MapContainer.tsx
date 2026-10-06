import { useRef, useEffect } from 'react'
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
}: MapContainerProps) {
  const floorConfig = getFloorConfig(currentFloor)
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

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

      transformRef.current.setTransform(posX, posY, targetScale, 650, 'easeOutCubic')
    }, 50)

    return () => clearTimeout(timer)
  }, [selectedRoomId, currentFloor, rooms])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Re-center floating action button */}
      <button
        type="button"
        aria-label="จัดกึ่งกลางแผนที่"
        onClick={() => transformRef.current?.resetTransform(650, 'easeOutCubic')}
        className={`absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-lg border border-slate-200/80 hover:bg-slate-50 hover:text-slate-900 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 transition-transform duration-200 cursor-pointer sm:bottom-[11.25rem] sm:right-6 ${
          selectedRoomId && isDetailOpen ? 'bottom-[calc(55dvh+10.75rem)]' : 'bottom-[11.25rem]'
        }`}
      >
        <Crosshair size={22} weight="bold" aria-hidden="true" />
      </button>

      {/* Vertical +/- zoom controls pill floating above floor switcher */}
      <div
        role="group"
        aria-label="Zoom controls"
        className={`absolute right-4 z-10 flex flex-col items-center rounded-2xl bg-white p-1 shadow-lg border border-slate-200/80 sm:bottom-20 sm:right-6 ${
          selectedRoomId && isDetailOpen ? 'bottom-[calc(55dvh+4.5rem)]' : 'bottom-20'
        }`}
      >
        <button
          type="button"
          aria-label="ขยายแผนที่"
          onClick={() => transformRef.current?.zoomIn(0.4, 250, 'easeOutCubic')}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 active:text-slate-950 transition-colors duration-150 cursor-pointer"
        >
          <Plus size={18} weight="bold" aria-hidden="true" />
        </button>
        <div className="my-0.5 h-px w-6 bg-slate-100" />
        <button
          type="button"
          aria-label="ย่อแผนที่"
          onClick={() => transformRef.current?.zoomOut(0.4, 250, 'easeOutCubic')}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 active:text-slate-950 transition-colors duration-150 cursor-pointer"
        >
          <Minus size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {/* Floor switcher floating on the map */}
      <div
        role="group"
        aria-label="Floor switcher"
        className={`absolute right-4 z-10 flex gap-1.5 rounded-2xl bg-white p-1.5 shadow-lg border border-slate-200/80 sm:bottom-6 sm:right-6 ${
          selectedRoomId && isDetailOpen ? 'bottom-[calc(55dvh+1rem)]' : 'bottom-6'
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
              className={
                isActive
                  ? 'rounded-xl bg-slate-900 border border-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all duration-200 cursor-pointer'
                  : 'rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200/80 hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 transition-all duration-200 cursor-pointer'
              }
            >
              {config.label}
            </button>
          )
        })}
      </div>

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
          animationTime: 200,
          animationType: 'easeOutCubic',
        }}
        autoAlignment={{
          sizeX: 300,
          sizeY: 250,
          animationTime: 650,
          velocityAlignmentTime: 650,
          animationType: 'easeOutCubic',
        }}
        doubleClick={{
          animationTime: 650,
          animationType: 'easeOutCubic',
        }}
        velocityAnimation={{
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

