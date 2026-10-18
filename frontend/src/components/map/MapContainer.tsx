import { Component, lazy, Suspense, useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import MapContainer2D from './MapContainer2D'
import type { MapContainerProps } from './MapContainer2D'
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
  const [view, setView] = useState<'2d' | '3d'>('3d')
  const [failed, setFailed] = useState(false)
  const handleFailure = useCallback(() => setFailed(true), [])
  const showing3d = view === '3d' && !failed
  const fallback = (
    <>
      <MapContainer2D {...props} />
      <p role="status" className="map-fallback-notice">
        เปิดแผนที่ 3D ไม่สำเร็จ กำลังใช้แผนที่ 2D
      </p>
    </>
  )
  return (
    <div className="relative h-full w-full">
      {view === '2d' ? (
        <MapContainer2D {...props} />
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
            <MapContainer3D {...props} onUnavailable={handleFailure} />
          </Suspense>
        </MapErrorBoundary>
      )}
      <button
        type="button"
        className={`map-view-toggle ${props.selectedRoomId && props.isDetailOpen ? 'map-view-toggle-sheet-open' : ''}`}
        onClick={() => {
          // From the failure fallback this retries 3D rather than re-selecting 2D.
          setView(showing3d ? '2d' : '3d')
          setFailed(false)
        }}
      >
        {showing3d ? 'แผนที่ 2D' : 'แผนที่ 3D'}
      </button>
    </div>
  )
}
