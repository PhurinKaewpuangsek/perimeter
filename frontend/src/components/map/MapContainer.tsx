import { Component, lazy, Suspense, useCallback, useRef, useState } from 'react'
import CompassIcon from './CompassIcon'
import type { ReactNode } from 'react'
import MapContainer2D from './MapContainer2D'
import type { MapContainerProps } from './MapContainer2D'
import { FLOOR_CONFIGS } from './floorConfig'
import './Map3D.css'
export type { MapContainerProps, MapOverlaySegment } from './MapContainer2D'

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
  const [compassHeading, setCompassHeading] = useState(-41.4)
  const view = props.viewMode ?? internalView
  const resetFnRef = useRef<() => void>(() => {})

  const handleRegisterReset = useCallback((fn: () => void) => {
    resetFnRef.current = fn
  }, [])

  const handleReset = useCallback(() => {
    props.onClearSelection?.()
    resetFnRef.current?.()
  }, [props])

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
    onRegisterReset: handleRegisterReset,
    onHeadingChange: setCompassHeading,
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

      {/* Floating Controls: Standalone Compass Button (Mobile) + Compact Switcher Pill */}
      {!props.hideBottomControls && (
        <div
          className={`pointer-events-none absolute z-30 flex flex-col items-center gap-2 transition-all ${
            props.selectedRoomId && props.isDetailOpen
              ? 'bottom-[calc(55dvh+1rem)] right-3 sm:bottom-5 sm:right-5'
              : props.isNavCollapsed
                ? 'bottom-20 right-3 sm:bottom-5 sm:right-5'
                : 'bottom-5 right-3 sm:bottom-5 sm:right-5'
          }`}
        >
          {/* Compass / Reset Camera View (Mobile only: standalone circular button above pill) */}
          {!(props.selectedRoomId && props.isDetailOpen) && (
            <button
              type="button"
              aria-label="จัดกึ่งกลางแผนที่ (ทิศเหนือ)"
              title="รีเซ็ตมุมมอง (ทิศเหนือ)"
              onClick={handleReset}
              className="pointer-events-auto map-compass-btn sm:!hidden"
            >
              <CompassIcon heading={showing3d ? compassHeading : -41.4} size={44} />
            </button>
          )}

          {/* Floor & View Switcher Pill (Mobile: compact vertical pill; Desktop: identical size & style to TopBar dock) */}
          <div
            role="group"
            aria-label="Floor and view switcher"
            className="pointer-events-auto flex flex-col items-center gap-1 rounded-full border border-line-soft bg-white p-1 shadow-floating transition-all select-none sm:flex-row sm:h-11 sm:w-auto"
          >
            {/* Floor Switcher (2F / 1F on mobile; 1st Floor / 2nd Floor on desktop) */}
            <div
              role="group"
              aria-label="Floor switcher"
              className="flex flex-col-reverse items-center gap-1 sm:relative sm:inline-grid sm:grid-cols-2 sm:gap-0 sm:rounded-full sm:isolate"
            >
              {/* Desktop gooey blobs */}
              {(() => {
                const activeIdx = Math.max(
                  0,
                  FLOOR_CONFIGS.findIndex((f) => f.floor === props.currentFloor),
                )
                const blobTransform = `translateX(${activeIdx * 100}%)`
                return (
                  <div aria-hidden="true" className="hidden sm:block gooey-switch-blobs">
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
                    aria-label={floor.label}
                    aria-pressed={isActive}
                    onClick={() => props.onFloorChange(floor.floor)}
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all sm:btn sm:btn-sm sm:gooey-switch-btn sm:h-auto sm:w-auto sm:min-h-8 sm:px-2.5 sm:py-1.5 sm:text-button sm:font-medium ${
                      isActive
                        ? 'bg-ink text-white shadow-xs sm:bg-transparent sm:text-white'
                        : 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink sm:hover:bg-transparent'
                    }`}
                  >
                    <span className="sm:hidden">{floor.floor}F</span>
                    <span className="hidden sm:inline text-inherit">{floor.label}</span>
                  </button>
                )
              })}
            </div>

            {/* 1px Divider: horizontal on mobile, vertical on desktop */}
            <span
              aria-hidden="true"
              className="h-px w-5 shrink-0 bg-line-soft sm:mx-1 sm:h-5 sm:w-px"
            />

            {/* 2D / 3D View Toggle */}
            <button
              type="button"
              aria-label={showing3d ? 'แผนที่ 2D' : 'แผนที่ 3D'}
              onClick={() => {
                setView(showing3d ? '2d' : '3d')
                setFailed(false)
              }}
              className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink text-xs font-bold transition-all hover:bg-line-soft active:scale-95 sm:btn sm:btn-sm sm:btn-tertiary sm:gooey-fluid-btn sm:h-auto sm:w-auto sm:min-h-8 sm:px-2.5 sm:py-1.5 sm:bg-tertiary sm:hover:bg-tertiary-hover sm:text-button sm:font-medium sm:active:scale-95"
            >
              <span className="sm:hidden">{showing3d ? '2D' : '3D'}</span>
              <span className="hidden sm:inline">{showing3d ? 'แผนที่ 2D' : 'แผนที่ 3D'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
