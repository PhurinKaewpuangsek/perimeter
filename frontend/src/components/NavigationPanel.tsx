/**
 * NavigationPanel — pick where you are and see the route to the destination (#145).
 *
 * Indoors there is no usable GPS, so the start point is picked by hand: the building
 * entrance by default, or any room / POI found with the same search as the map
 * (`filterRooms` + `SearchBar`). The destination is the room the user asked to go to;
 * tapping another room on the map changes it.
 *
 * Modeled after enterprise campus mapping systems (MazeMap):
 * - From & To stack with interactive direction swap button (⇄ / ⇅).
 * - Single walking-mode indicator (no vehicle / train / bike selector).
 * - Suggested route summary with estimated walking time and total distance.
 * - Overview floor cards with milestone landmark chips (bridges, fountains, stairs, restrooms, named rooms).
 */
import { createElement, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowsDownUp,
  ArrowUp,
  Barricade,
  Clock,
  DoorOpen,
  MapPin,
  Prohibit,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import SearchBar from './SearchBar'
import { getCategoryIcon } from './categoryIcon'
import { DEFAULT_CATEGORY_KEY, filterRooms } from '../services/filterRooms'
import { BUILDING_ENTRANCES, BUILDING_ENTRANCE_FLOOR } from '../services/routeService'
import {
  BUILDING_ENTRANCE_LABEL,
  CLOSURES_AVOIDED_NOTICE,
  ROUTE_FAILURE_MESSAGES,
  calculateLegDistance,
  calculateRouteSummary,
  getEntranceLabel,
  getFloorChangeLabel,
  getLegKeyMilestones,
  getPlaceLabel,
  splitRouteByFloor,
} from '../services/routeDisplay'
import type { UseRouteResult } from '../hooks/useRoute'
import type { Room } from '../types/room'

interface NavigationPanelProps {
  rooms: Room[]
  /** BUILDING_ENTRANCE_ID or a room's location_id. */
  fromId: string
  toId?: string | null
  onChangeFrom: (fromId: string) => void
  destination: Room | undefined
  routeState: UseRouteResult
  currentFloor: number
  onFloorChange: (floor: number) => void
  onClose: () => void
  onSwapLocations?: () => void
}

/** Pickup dot (Gradient Pink) and drop-off square (Gradient Orange-Yellow) matching Perimeter brand (#145). */
function StartGlyph() {
  return (
    <span
      aria-hidden="true"
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full shadow-2xs"
      style={{ background: 'linear-gradient(135deg, #ff4d94 0%, #ec4899 50%, #db2777 100%)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    </span>
  )
}

function EndGlyph() {
  return (
    <span
      aria-hidden="true"
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] shadow-2xs"
      style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 50%, #ea580c 100%)' }}
    >
      <span className="h-1.5 w-1.5 bg-white rounded-[0.5px]" />
    </span>
  )
}

/** Animated walking stickman with fluid continuous spline stride, invariant 3-point vertices, and distinct elbow (ข้อพับ) (#145). */
function WalkingStickmanIcon({ size = 25, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Stable head and torso (no pulsating vertical jerk) */}
      <circle cx="16.5" cy="5" r="3.2" fill="currentColor" stroke="none" />
      <path d="M16,10 L14.5,18" stroke="currentColor" strokeWidth="3.8" />

      {/* Back Arm: distinct elbow crease (ข้อพับ) swinging with continuous harmonic spline */}
      <path d="M16,10.5 L11,14.5 L9,19.5" stroke="currentColor" strokeWidth="3.2" opacity="0.75">
        <animate
          attributeName="d"
          dur="1.2s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0; 0.5; 1"
          keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
          values="
            M16,10.5 L11,14.5 L9,19.5;
            M16,10.5 L19,15.5 L24.5,18.5;
            M16,10.5 L11,14.5 L9,19.5
          "
        />
      </path>

      {/* Back Leg: strictly invariant 3-point spline morphing (no vertex count mismatch, no teleport snap) */}
      <path d="M14.5,18 L12,24 L9.5,29.5" stroke="currentColor" strokeWidth="3.4" opacity="0.75">
        <animate
          attributeName="d"
          dur="1.2s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0; 0.25; 0.5; 0.75; 1"
          keySplines="0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1"
          values="
            M14.5,18 L12,24 L9.5,29.5;
            M14.5,18 L15.5,23 L13.5,27.5;
            M14.5,18 L18.5,23.5 L19.5,29.5;
            M14.5,18 L16.5,24 L16,29.8;
            M14.5,18 L12,24 L9.5,29.5
          "
        />
      </path>

      {/* Front Leg: strictly invariant 3-point spline morphing (no vertex count mismatch, no teleport snap) */}
      <path d="M14.5,18 L18.5,23.5 L19.5,29.5" stroke="currentColor" strokeWidth="3.4">
        <animate
          attributeName="d"
          dur="1.2s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0; 0.25; 0.5; 0.75; 1"
          keySplines="0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1"
          values="
            M14.5,18 L18.5,23.5 L19.5,29.5;
            M14.5,18 L16.5,24 L16,29.8;
            M14.5,18 L12,24 L9.5,29.5;
            M14.5,18 L15.5,23 L13.5,27.5;
            M14.5,18 L18.5,23.5 L19.5,29.5
          "
        />
      </path>

      {/* Front Arm: distinct elbow crease (ข้อพับ) swinging with continuous harmonic spline */}
      <path d="M16,10.5 L19,15.5 L24.5,18.5" stroke="currentColor" strokeWidth="3.2">
        <animate
          attributeName="d"
          dur="1.2s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0; 0.5; 1"
          keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
          values="
            M16,10.5 L19,15.5 L24.5,18.5;
            M16,10.5 L11,14.5 L9,19.5;
            M16,10.5 L19,15.5 L24.5,18.5
          "
        />
      </path>
    </svg>
  )
}

export default function NavigationPanel({
  rooms,
  fromId,
  toId,
  onChangeFrom,
  destination,
  routeState,
  currentFloor,
  onFloorChange,
  onClose,
  onSwapLocations,
}: NavigationPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // null = not searching: the start field shows the picked start instead of a query.
  const [query, setQuery] = useState<string | null>(null)
  const isPickingStart = query !== null

  const entranceLabel = getEntranceLabel(fromId)
  const fromRoom = entranceLabel ? undefined : rooms.find((room) => room.id === fromId)
  const fromLabel = entranceLabel ?? (fromRoom ? getPlaceLabel(fromRoom) : BUILDING_ENTRANCE_LABEL)

  const toEntranceLabel = toId ? getEntranceLabel(toId) : undefined
  const destinationLabel = toEntranceLabel ?? (destination ? getPlaceLabel(destination) : 'ปลายทาง')
  const destinationFloor = toEntranceLabel ? BUILDING_ENTRANCE_FLOOR : destination?.floor

  const startOptions = useMemo(
    () =>
      query === null
        ? []
        : filterRooms(rooms, query, DEFAULT_CATEGORY_KEY).filter(
            (room) => room.id !== destination?.id && room.id !== toId,
          ),
    [rooms, query, destination?.id, toId],
  )

  function pickStart(id: string) {
    onChangeFrom(id)
    setQuery(null)
    inputRef.current?.blur()
  }

  const legs = routeState.route ? splitRouteByFloor(routeState.route.path) : []
  const routeSummary = calculateRouteSummary(legs)

  return (
    <section aria-label="นำทาง" className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm sm:text-h3-sm font-bold text-ink">นำทาง</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="ล้างเส้นทาง"
          title="ล้างเส้นทาง"
          className="btn btn-ghost btn-sm text-ink-2 hover:text-ink"
        >
          <X size={14} weight="bold" aria-hidden="true" />
          <span>ล้างเส้นทาง</span>
        </button>
      </div>

      {/* Start and destination input group with right-side Swap button */}
      <div className="rounded-2xl border border-line-soft bg-surface-2 p-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          {/* Left vertical glyph track: Continuous line from Circle to Rectangle */}
          <div className="relative flex flex-col items-center shrink-0 w-5 self-stretch pt-[30px] pb-[12px] select-none">
            <StartGlyph />
            <span aria-hidden="true" className="w-0.5 flex-1 bg-ink my-1" />
            <EndGlyph />
          </div>

          {/* Center inputs */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Start Field */}
            <div
              className="min-w-0"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setQuery(null)
              }}
            >
              <span className="mb-0.5 block text-[11px] sm:text-xs text-ink-3">จุดเริ่มต้น (From)</span>
              <SearchBar
                inputRef={inputRef}
                value={query ?? fromLabel}
                onChange={setQuery}
                onFocus={() => setQuery((current) => current ?? '')}
                ariaLabel="จุดเริ่มต้น"
                placeholder="ค้นหาห้องหรือจุดสำคัญ เช่น 105, บันได"
                variant="surface"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setQuery(null)
                    inputRef.current?.blur()
                  }
                }}
              />
              {isPickingStart && (
                <ul
                  aria-label="ตัวเลือกจุดเริ่มต้น"
                  className="no-scrollbar mt-1 max-h-56 overflow-y-auto border border-line-soft bg-white shadow-floating"
                >
                  {BUILDING_ENTRANCES.map((entrance, index) => (
                    <li key={entrance.id} className={index > 0 ? 'border-t border-line-soft' : ''}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pickStart(entrance.id)}
                        className="flex min-h-10 sm:min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
                      >
                        <DoorOpen size={18} weight="bold" className="shrink-0 text-ink" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-button font-medium text-ink">{entrance.label}</span>
                          {entrance.description && (
                            <span className="block truncate text-xs text-ink-3">{entrance.description}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                  {startOptions.map((room) => (
                    <li key={room.id} className="border-t border-line-soft">
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pickStart(room.id)}
                        className="flex min-h-10 sm:min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
                      >
                        {createElement(getCategoryIcon(room.category, room.nameThai), {
                          size: 18,
                          weight: 'duotone',
                          className: 'shrink-0 text-ink-2',
                          'aria-hidden': true,
                        })}
                        <span className="min-w-0">
                          <span className="block text-button font-medium text-ink">{getPlaceLabel(room)}</span>
                          <span className="block truncate text-xs text-ink-3">
                            ชั้น {room.floor}
                            {room.roomNumber && room.nameThai ? ` · ${room.nameThai}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {query?.trim() && startOptions.length === 0 && (
                    <li className="border-t border-line-soft px-3 py-2 text-button text-ink-3">
                      ไม่พบห้องที่ตรงกับ "{query?.trim()}"
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Destination Field */}
            <div className="min-w-0">
              <span className="mb-0.5 block text-[11px] sm:text-xs text-ink-3">ปลายทาง (To)</span>
              <p className="flex h-10 sm:h-11 items-center truncate rounded-lg border border-line-soft bg-white px-3 text-body font-medium text-ink shadow-xs">
                <span className="truncate">{destinationLabel}</span>
                {destinationFloor !== undefined && (
                  <span className="ml-1 shrink-0 text-ink-3 font-normal">· ชั้น {destinationFloor}</span>
                )}
              </p>
            </div>
          </div>

          {/* Right side: Direction Swap button */}
          <div className="flex items-center shrink-0 self-center pl-1">
            <button
              type="button"
              onClick={onSwapLocations}
              disabled={!onSwapLocations || !toId || fromId === toId}
              aria-label="สลับจุดเริ่มต้นและปลายทาง"
              title="สลับจุดเริ่มต้นและปลายทาง"
              className="group flex h-9 w-9 items-center justify-center rounded-full border border-line-soft bg-white hover:border-ink hover:text-ink hover:bg-surface-2 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs text-ink-2"
            >
              <ArrowsDownUp
                size={16}
                weight="bold"
                className="transition-transform duration-200 group-hover:rotate-180"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
      <p className="pl-1 text-[11px] text-ink-3">แตะห้องบนแผนที่เพื่อเปลี่ยนปลายทาง</p>

      {/* Route status: Loading */}
      {routeState.status === 'loading' && (
        <p role="status" className="py-2 text-button text-ink-3">
          กำลังคำนวณเส้นทาง…
        </p>
      )}

      {/* Route status: Error */}
      {routeState.status === 'error' && (
        <div role="alert" className="card flex items-start gap-3 border-ink p-4">
          <WarningCircle size={20} weight="bold" className="shrink-0 text-ink" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-button font-medium text-ink">คำนวณเส้นทางไม่สำเร็จ</p>
            <p className="mt-0.5 text-button text-ink-2">{routeState.error?.message}</p>
            <button type="button" onClick={routeState.retry} className="btn btn-secondary btn-sm mt-3">
              ลองอีกครั้ง
            </button>
          </div>
        </div>
      )}

      {/* Route status: Not found */}
      {routeState.status === 'not-found' && routeState.reason && (
        <div role="alert" className="card flex items-start gap-3 border-ink p-4">
          <Prohibit size={20} weight="bold" className="shrink-0 text-ink" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-button font-medium text-ink">{ROUTE_FAILURE_MESSAGES[routeState.reason].title}</p>
            <p className="mt-0.5 text-button text-ink-2">{ROUTE_FAILURE_MESSAGES[routeState.reason].hint}</p>
          </div>
        </div>
      )}

      {/* Route status: Found */}
      {routeState.status === 'found' && routeState.route && (
        <div className="space-y-3">
          {routeState.route.closuresAvoided.length > 0 && (
            <div role="status" className="card flex items-start gap-3 p-3">
              <Barricade size={20} weight="bold" className="shrink-0 text-ink" aria-hidden="true" />
              <div className="min-w-0 text-button">
                <p className="font-medium text-ink">{CLOSURES_AVOIDED_NOTICE}</p>
                {routeState.route.closuresAvoided.some((closure) => closure.reason) && (
                  <p className="mt-0.5 text-ink-2">
                    {routeState.route.closuresAvoided
                        .map((closure) => closure.reason)
                        .filter(Boolean)
                        .join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {routeState.route.path.length <= 1 ? (
            <p role="status" className="text-button text-ink-2">
              คุณอยู่ที่ปลายทางแล้ว
            </p>
          ) : (
            <div className="space-y-3">
              {/* Suggested Route Header */}
              <div className="flex items-center justify-between border-b border-line-soft/80 pb-2">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-display text-xs sm:text-button font-bold text-ink">
                    เส้นทางแนะนำ
                  </h3>
                  <span className="text-[11px] text-ink-3 font-normal">(Suggested route)</span>
                </div>
              </div>

              {/* Unified Route Card (integrates trip metrics and floor directions, eliminating competing boxes) */}
              <div className="overflow-hidden rounded-2xl border border-line-soft bg-white shadow-xs">
                {/* Trip Metric Overview Header Banner */}
                <div className="flex items-center justify-between border-b border-line-soft bg-white px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink shadow-2xs">
                      <WalkingStickmanIcon size={25} />
                    </div>
                    <p className="text-button font-bold text-ink truncate">
                      {legs.length > 1 ? `เดินรวม ~${routeSummary.meters} ม.` : `เดิน ~${routeSummary.meters} ม.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink shrink-0 pl-2">
                    <Clock size={15} weight="bold" className="text-ink-3" aria-hidden="true" />
                    <span>~{routeSummary.minutes} นาที</span>
                  </div>
                </div>

                {/* Floor-by-floor instructions */}
                <ol aria-label="ขั้นตอนเส้นทาง" className="divide-y divide-line-soft">
                  {legs.map((leg, index) => {
                    const next = legs[index + 1]
                    const isShown = leg.floor === currentFloor
                    const walk = index === 0 ? `เดินจาก${fromLabel} ` : 'เดินต่อ'
                    const to = next ? 'ไปที่บันได' : `ไปยัง${destinationLabel}`
                    const metrics = calculateLegDistance(leg.points)
                    const milestones = getLegKeyMilestones(
                      leg.points,
                      rooms,
                      leg.floor,
                      new Set([destination?.id, fromId, toId].filter(Boolean) as string[]),
                    )
                    return (
                      <li key={index}>
                        <button
                          type="button"
                          onClick={() => onFloorChange(leg.floor)}
                          aria-pressed={isShown}
                          className={`group flex w-full items-start gap-2.5 p-3 text-left transition-all ${
                            isShown
                              ? 'bg-white'
                              : 'cursor-pointer bg-white hover:bg-surface-2/40'
                          }`}
                        >
                          <span className="flex h-6 sm:h-7 shrink-0 items-center rounded-full px-2 sm:px-2.5 text-[11px] sm:text-xs font-bold bg-ink text-white">
                            ชั้น {leg.floor}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="block text-button text-ink font-semibold">
                              {walk}
                              {to}
                            </span>

                            {/* In multi-floor routes, show individual leg distance */}
                            {legs.length > 1 && (
                              <p className="mt-1 text-xs text-ink-3 font-medium">
                                ช่วงนี้: {metrics.formatted}
                              </p>
                            )}

                            {!isShown && (
                              <p className="mt-1.5">
                                <span className="text-xs font-semibold text-accent underline underline-offset-2 hover:text-accent-hover transition-colors">
                                  แตะเพื่อสลับดูชั้นนี้
                                </span>
                              </p>
                            )}

                            {/* Key Landmarks / Waypoints (augmenting the 3D map) */}
                            {milestones.length > 0 && (
                              <div className="mt-2.5 border-t border-line-soft/80 pt-2">
                                <p className="mb-1.5 text-[11px] font-medium text-ink-3">
                                  จุดสังเกตตามทางเดิน:
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {milestones.map((landmark, landmarkIdx) => (
                                    <span
                                      key={landmarkIdx}
                                      className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink"
                                    >
                                      <MapPin size={11} weight="fill" className="text-secondary" aria-hidden="true" />
                                      <span>{landmark}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </button>

                        {/* Multi-floor transition connector */}
                        {next && (
                          <p className="flex items-center gap-2 border-t border-line-soft bg-white px-4 py-2 text-button font-medium text-ink">
                            {createElement(next.floor > leg.floor ? ArrowUp : ArrowDown, {
                              size: 16,
                              weight: 'bold',
                              'aria-hidden': true,
                            })}
                            {getFloorChangeLabel(leg.floor, next.floor)}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
