import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Crosshair, Minus, Plus } from '@phosphor-icons/react'
import type { MapContainerProps } from './MapContainer2D'
import { createMapScene } from './createMapScene'
import type { MapScene } from './createMapScene'
import { FLOOR_CONFIGS } from './floorConfig'

export default function MapContainer3D(props: MapContainerProps & { onUnavailable: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<MapScene | null>(null)
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
      map = createMapScene(host.current, onUnavailable)
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
  const { rooms, currentFloor, selectedRoomId, isDetailOpen, mode, sidebarWidth, initialScale } =
    props
  useEffect(() => {
    scene?.update({
      rooms,
      currentFloor,
      selectedRoomId,
      onSelectRoom: (id) => callbacks.current.onSelectRoom(id),
      onClearSelection: () => callbacks.current.onClearSelection?.(),
      isDetailOpen,
      mode,
      sidebarWidth,
      initialScale,
    })
  }, [scene, rooms, currentFloor, selectedRoomId, isDetailOpen, mode, sidebarWidth, initialScale])
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
          กำลังโหลดโมเดลอาคาร…
        </div>
      )}
      <div
        className={`map3d-controls ${selectedRoomId && isDetailOpen ? 'map3d-controls-raised' : ''}`}
      >
        <button
          type="button"
          aria-label="จัดกึ่งกลางแผนที่"
          title="คืนมุมเริ่มต้น"
          onClick={() => scene?.reset()}
        >
          <Crosshair size={21} />
        </button>
        <div role="group" aria-label="Zoom controls" className="map3d-zoom">
          <button type="button" aria-label="ขยายแผนที่" onClick={() => scene?.zoom(1.3)}>
            <Plus size={19} />
          </button>
          <button type="button" aria-label="ย่อแผนที่" onClick={() => scene?.zoom(1 / 1.3)}>
            <Minus size={19} />
          </button>
        </div>
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
      </div>
      <p className="map3d-hint">ลากเมาส์ซ้ายเพื่อเลื่อน · ลากเมาส์ขวาเพื่อหมุน · บีบสองนิ้วเพื่อซูม/เลื่อน</p>
    </div>
  )
}
