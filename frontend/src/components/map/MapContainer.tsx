import { Component, lazy, Suspense, useCallback, useRef, useState } from 'react'
import { Crosshair } from '@phosphor-icons/react'
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
  const view = props.viewMode ?? internalView
  const resetFnRef = useRef<() => void>(() => {})

  const handleRegisterReset = useCallback((fn: () => void) => {
    resetFnRef.current = fn
  }, [])

  const handleReset = useCallback(() => {
    resetFnRef.current?.()
  }, [])

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

      {/* Single Unified 4-Item Pill (⌖ | 2F | 1F | 2D/3D) on mobile; horizontal on desktop */}
      {!props.hideBottomControls && (
        <div
          role="group"
          aria-label="Floor and view switcher"
          className={`pointer-events-auto absolute z-30 flex flex-col items-center gap-1 rounded-2xl border border-line-soft bg-white p-1 shadow-floating transition-all sm:flex-row sm:h-11 sm:w-auto sm:rounded-full sm:p-1 ${
            props.selectedRoomId && props.isDetailOpen
              ? 'bottom-[calc(55dvh+1rem)] right-3 sm:bottom-5 sm:right-5'
              : 'bottom-5 right-3 sm:bottom-5 sm:right-5'
          }`}
        >
          {/* Re-center / Reset Camera View (Mobile only, hidden when room detail sheet is open) */}
          {!(props.selectedRoomId && props.isDetailOpen) && (
            <>
              <button
                type="button"
                aria-label="จัดกึ่งกลางแผนที่"
                title="คืนมุมเริ่มต้น"
                onClick={handleReset}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:bg-tertiary-hover active:scale-95 sm:hidden"
              >
                <Crosshair size={18} weight="bold" aria-hidden="true" />
              </button>
              <span
                aria-hidden="true"
                className="h-px w-6 shrink-0 bg-line-soft sm:hidden"
              />
            </>
          )}

          {/* Floor Switcher (2F / 1F on mobile; 1st Floor / 2nd Floor on desktop) */}
          <div
            role="group"
            aria-label="Floor switcher"
            className="flex flex-col-reverse items-center gap-1 sm:relative sm:inline-grid sm:grid-cols-2 sm:rounded-full sm:isolate"
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
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition-all sm:btn sm:btn-sm sm:gooey-switch-btn sm:h-auto sm:w-auto sm:rounded-full sm:font-medium sm:text-sm ${
                    isActive
                      ? 'bg-ink text-white shadow-xs sm:bg-transparent sm:text-white'
                      : 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink sm:hover:bg-transparent'
                  }`}
                >
                  <span className="sm:hidden">{floor.floor}F</span>
                  <span className="hidden sm:inline">{floor.label}</span>
                </button>
              )
            })}
          </div>

          {/* 1px Divider: horizontal on mobile, vertical on desktop */}
          <span
            aria-hidden="true"
            className="h-px w-6 shrink-0 bg-line-soft sm:mx-0.5 sm:h-5 sm:w-px"
          />

          {/* 2D / 3D View Toggle */}
          <button
            type="button"
            aria-label={showing3d ? 'แผนที่ 2D' : 'แผนที่ 3D'}
            onClick={() => {
              // From the failure fallback this retries 3D rather than re-selecting 2D.
              setView(showing3d ? '2d' : '3d')
              setFailed(false)
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-ink text-xs font-bold transition-all hover:bg-line-soft active:scale-95 sm:btn sm:btn-sm sm:btn-tertiary sm:gooey-fluid-btn sm:h-auto sm:w-auto sm:rounded-full sm:font-medium sm:text-sm"
          >
            <span className="sm:hidden">{showing3d ? '2D' : '3D'}</span>
            <span className="hidden sm:inline">{showing3d ? 'แผนที่ 2D' : 'แผนที่ 3D'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
