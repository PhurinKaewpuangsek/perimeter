import { Component, lazy, Suspense, useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import MapContainer2D from './MapContainer2D'
import type { MapContainerProps } from './MapContainer2D'
import { FLOOR_CONFIGS } from './floorConfig'
import './Map3D.css'
export type { MapContainerProps } from './MapContainer2D'

const MapContainer3D = lazy(() => import('./MapContainer3D'))
class MapErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  // Report up so the view toggle knows 2D is showing (e.g. the lazy chunk failed to load).
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
export default function MapContainer(props: MapContainerProps) {
  const [internalView, setInternalView] = useState<'2d' | '3d'>('3d')
  const [failed, setFailed] = useState(false)
  const view = props.viewMode ?? internalView

  const setView = useCallback(
    (next: '2d' | '3d') => {
      setInternalView(next)
      props.onViewModeChange?.(next)
    },
    [props],
  )

  const handleFailure = useCallback(() => {
    setFailed(true)
    props.onViewModeChange?.('2d')
  }, [props])

  const showing3d = view === '3d' && !failed
  const childProps: MapContainerProps = {
    ...props,
    hideFloorSwitcher: true, // Suppress child floor switchers since MapContainer renders the unified dock
  }
  const fallback = (
    <>
      <MapContainer2D {...childProps} />
      <p role="status" className="map-fallback-notice">
        เปิดแผนที่ 3D ไม่สำเร็จ กำลังใช้แผนที่ 2D
      </p>
    </>
  )
  return (
    <div className="relative h-full w-full">
      {view === '2d' ? (
        <MapContainer2D {...childProps} />
      ) : failed ? (
        fallback
      ) : (
        <MapErrorBoundary fallback={fallback} onError={handleFailure}>
          <Suspense
            fallback={
              <div className="map3d-loading" role="status">
                กำลังโหลดแผนที่ 3D…
              </div>
            }
          >
            <MapContainer3D {...childProps} onUnavailable={handleFailure} />
          </Suspense>
        </MapErrorBoundary>
      )}

      {/* Merged Floor & View Switcher (1st Floor | 2nd Floor | แผนที่ 2D/3D) on phones and the landing preview */}
      {!props.hideBottomControls && (
        <div
          role="group"
          aria-label="Floor and view switcher"
          className={`pointer-events-auto absolute z-2 flex h-12 items-center gap-1 rounded-full border border-line-soft bg-white p-1.5 shadow-floating transition-all sm:h-11 sm:p-1 ${
            props.selectedRoomId && props.isDetailOpen
              ? 'bottom-[calc(55dvh+1rem)] right-4 sm:bottom-5 sm:right-5'
              : 'bottom-5 right-4 sm:bottom-5 sm:right-5'
          }`}
        >
          {/* Floor Switcher (1st Floor | 2nd Floor) */}
          <div role="group" aria-label="Floor switcher" className="gooey-switch-group">
            {(() => {
              const activeIdx = Math.max(
                0,
                FLOOR_CONFIGS.findIndex((f) => f.floor === props.currentFloor),
              )
              const blobTransform = `translateX(${activeIdx * 100}%)`
              return (
                <div aria-hidden="true" className="gooey-switch-blobs">
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
            {FLOOR_CONFIGS.map((floor) => {
              const isActive = floor.floor === props.currentFloor
              return (
                <button
                  key={floor.floor}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => props.onFloorChange(floor.floor)}
                  className={`btn btn-sm gooey-switch-btn ${
                    isActive ? 'text-white' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {floor.label}
                </button>
              )
            })}
          </div>

          {/* 1px Vertical Divider */}
          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-line-soft" />

          {/* 2D / 3D View Toggle */}
          <button
            type="button"
            onClick={() => {
              // From the failure fallback this retries 3D rather than re-selecting 2D.
              setView(showing3d ? '2d' : '3d')
              setFailed(false)
            }}
            className="btn btn-sm btn-tertiary gooey-fluid-btn"
          >
            {showing3d ? 'แผนที่ 2D' : 'แผนที่ 3D'}
          </button>
        </div>
      )}
    </div>
  )
}
