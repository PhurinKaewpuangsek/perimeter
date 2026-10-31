import { createElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Minus, Plus } from '@phosphor-icons/react'
import CompassIcon from './CompassIcon'
import { getCategoryIcon } from '../categoryIcon'
import type { MapContainerProps } from './MapContainer2D'
import { createMapScene } from './createMapScene'
import type { MapScene } from './createMapScene'
import { FLOOR_CONFIGS } from './floorConfig'

export default function MapContainer3D(props: MapContainerProps & { onUnavailable: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const icons = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<MapScene | null>(null)
  const [progress, setProgress] = useState(0)
  // Callbacks live in a ref so a new callback identity alone neither rebuilds
  // the WebGL scene nor re-runs update (which recreates markers and resizes).
  const callbacks = useRef(props)
  useLayoutEffect(() => {
    callbacks.current = props
  })
  useEffect(() => {
    const onUnavailable = () => callbacks.current.onUnavailable()
    if (!host.current) return
    let disposed = false
    let map: MapScene | undefined
    try {
      map = createMapScene(host.current, onUnavailable, (fraction) => {
        if (!disposed) setProgress(Math.floor(fraction * 100))
      })
      const instance = map
      instance.ready
        .then(() => {
          if (!disposed) setScene(instance)
        })
        .catch((error) => {
          if (!disposed) {
            console.warn('3D map unavailable', error)
            onUnavailable()
          }
        })
    } catch (error) {
      console.warn('3D map unavailable', error)
      onUnavailable()
    }
    return () => {
      disposed = true
      map?.dispose()
    }
  }, [])
  const [heading, setHeading] = useState(-41.4)

  const {
    rooms,
    currentFloor,
    selectedRoomId,
    isDetailOpen,
    mode,
    sidebarWidth,
    initialScale,
    idleOrbit,
    demoInterrupted,
    route,
    closedRoomIds,
    onRegisterReset,
    onHeadingChange,
  } = props

  useEffect(() => {
    if (!scene?.onHeadingChange) return
    return scene.onHeadingChange((deg) => {
      setHeading(deg)
      onHeadingChange?.(deg)
    })
  }, [scene, onHeadingChange])
  useEffect(() => {
    if (scene) {
      onRegisterReset?.(() => scene.reset(true))
    }
  }, [scene, onRegisterReset])

  useEffect(() => {
    scene?.update({
      rooms,
      currentFloor,
      selectedRoomId,
      onSelectRoom: (id) => callbacks.current.onSelectRoom(id),
      onClearSelection: () => callbacks.current.onClearSelection?.(),
      onFloorChange: (floor) => callbacks.current.onFloorChange(floor),
      isDetailOpen,
      mode,
      sidebarWidth,
      initialScale,
      idleOrbit,
      demoInterrupted,
      route,
      closedRoomIds,
      icons: icons.current,
    })
  }, [
    scene,
    rooms,
    currentFloor,
    selectedRoomId,
    isDetailOpen,
    mode,
    sidebarWidth,
    initialScale,
    idleOrbit,
    demoInterrupted,
    route,
    closedRoomIds,
  ])
  const hintOffset = sidebarWidth ?? (mode === 'admin' ? 460 : 400)
  return (
    <div className="map3d" style={{ '--map3d-sidebar': `${hintOffset}px` } as CSSProperties}>
      <div
        ref={host}
        className="map3d-canvas"
        role="region"
        aria-label={`แผนที่อาคาร LC3 ชั้น ${currentFloor} แบบ 3D`}
      />
      {!scene && (
        <div className="map3d-loading" role="status">
          กำลังโหลดโมเดลอาคาร… {progress > 0 && `${progress}%`}
        </div>
      )}
      <div
        className={`hidden sm:flex map3d-controls transition-all ${
          props.hideBottomControls
            ? 'sm:bottom-5 sm:right-5'
            : selectedRoomId && isDetailOpen
              ? 'sm:bottom-20 sm:right-5'
              : 'sm:bottom-20 sm:right-5'
        }`}
      >
        <button
          type="button"
          aria-label="จัดกึ่งกลางแผนที่ (ทิศเหนือ)"
          title="รีเซ็ตมุมมอง (ทิศเหนือ)"
          onClick={() => {
            callbacks.current.onClearSelection?.()
            scene?.reset(true)
          }}
          className="map-compass-btn"
        >
          <CompassIcon heading={heading} size={44} />
        </button>
        <div role="group" aria-label="Zoom controls" className="map-zoom-pill">
          <button type="button" aria-label="ขยายแผนที่" onClick={() => scene?.zoom(1.3)}>
            <Plus size={16} weight="bold" />
          </button>
          <span aria-hidden="true" className="map-zoom-pill-divider" />
          <button type="button" aria-label="ย่อแผนที่" onClick={() => scene?.zoom(1 / 1.3)}>
            <Minus size={16} weight="bold" />
          </button>
        </div>
        {!props.hideBottomControls && !props.hideFloorSwitcher && (
          <div role="group" aria-label="Floor switcher" className="map3d-floors">
            {FLOOR_CONFIGS.map((floor) => (
              <button
                key={floor.floor}
                type="button"
                aria-pressed={floor.floor === currentFloor}
                onClick={() => props.onFloorChange(floor.floor)}
              >
                {floor.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* The scene builds its markers outside React, so it copies each room's
          category icon (the same glyph as the 2D pins) from here. */}
      <div ref={icons} hidden>
        {rooms
          .filter((room) => room.floor === currentFloor)
          .map((room) => (
            <span key={room.id} data-room-id={room.id}>
              {createElement(getCategoryIcon(room.category, room.nameThai), {
                size: 12,
                color: 'white',
                weight: 'fill',
                'aria-hidden': true,
              })}
            </span>
          ))}
      </div>
    </div>
  )
}
