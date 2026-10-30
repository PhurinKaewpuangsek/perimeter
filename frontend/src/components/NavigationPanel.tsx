/**
 * NavigationPanel — pick where you are and see the route to the destination (#145).
 *
 * Indoors there is no usable GPS, so the start point is picked by hand: the building
 * entrance by default, or any room / POI found with the same search as the map
 * (`filterRooms` + `SearchBar`). The destination is the room the user asked to go to;
 * tapping another room on the map changes it.
 */
import { createElement, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Barricade,
  DoorOpen,
  Prohibit,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import SearchBar from './SearchBar'
import { getCategoryIcon } from './categoryIcon'
import { DEFAULT_CATEGORY_KEY, filterRooms } from '../services/filterRooms'
import { BUILDING_ENTRANCES } from '../services/routeService'
import {
  BUILDING_ENTRANCE_LABEL,
  CLOSURES_AVOIDED_NOTICE,
  ROUTE_FAILURE_MESSAGES,
  generateLegInstructions,
  getEntranceLabel,
  getFloorChangeLabel,
  getPlaceLabel,
  splitRouteByFloor,
} from '../services/routeDisplay'
import type { UseRouteResult } from '../hooks/useRoute'
import type { Room } from '../types/room'

interface NavigationPanelProps {
  rooms: Room[]
  /** BUILDING_ENTRANCE_ID or a room's location_id. */
  fromId: string
  onChangeFrom: (fromId: string) => void
  destination: Room | undefined
  routeState: UseRouteResult
  currentFloor: number
  onFloorChange: (floor: number) => void
  onClose: () => void
}

/** Uber-style pickup dot and drop-off square, also used for the map markers. */
function StartGlyph() {
  return (
    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    </span>
  )
}
function EndGlyph() {
  return (
    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center bg-ink">
      <span className="h-1.5 w-1.5 bg-white" />
    </span>
  )
}

export default function NavigationPanel({
  rooms,
  fromId,
  onChangeFrom,
  destination,
  routeState,
  currentFloor,
  onFloorChange,
  onClose,
}: NavigationPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // null = not searching: the start field shows the picked start instead of a query.
  const [query, setQuery] = useState<string | null>(null)
  const isPickingStart = query !== null

  const entranceLabel = getEntranceLabel(fromId)
  const fromRoom = entranceLabel ? undefined : rooms.find((room) => room.id === fromId)
  const fromLabel = entranceLabel ?? (fromRoom ? getPlaceLabel(fromRoom) : BUILDING_ENTRANCE_LABEL)
  const destinationLabel = destination ? getPlaceLabel(destination) : 'ปลายทาง'

  const startOptions = useMemo(
    () =>
      query === null
        ? []
        : filterRooms(rooms, query, DEFAULT_CATEGORY_KEY).filter((room) => room.id !== destination?.id),
    [rooms, query, destination?.id],
  )

  function pickStart(id: string) {
    onChangeFrom(id)
    setQuery(null)
    inputRef.current?.blur()
  }

  const legs = routeState.route ? splitRouteByFloor(routeState.route.path) : []

  return (
    <section aria-label="นำทาง" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm sm:text-h3-sm font-bold text-ink">นำทาง</h2>
        <button type="button" onClick={onClose} aria-label="ล้างเส้นทาง" title="ล้างเส้นทาง" className="btn btn-ghost btn-sm">
          <X size={14} weight="bold" aria-hidden="true" />
          <span>ล้างเส้นทาง</span>
        </button>
      </div>

      {/* Start and destination fields, joined by the route connector */}
      <div className="relative space-y-1.5">
        <span aria-hidden="true" className="absolute top-[42px] bottom-[26px] left-[7.5px] w-px bg-ink" />

        <div className="flex items-start gap-3">
          <div className="mt-4 flex h-10 sm:h-11 items-center">
            <StartGlyph />
          </div>
          <div
            className="min-w-0 flex-1"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setQuery(null)
            }}
          >
            <span className="mb-0.5 block text-[11px] sm:text-xs text-ink-3">จุดเริ่มต้น</span>
            <SearchBar
              inputRef={inputRef}
              value={query ?? fromLabel}
              onChange={setQuery}
              onFocus={() => setQuery((current) => current ?? '')}
              ariaLabel="จุดเริ่มต้น"
              placeholder="ค้นหาห้องหรือจุดสำคัญ เช่น 105, ห้องน้ำ"
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
                className="no-scrollbar mt-1 max-h-56 overflow-y-auto border border-line-soft bg-white"
              >
                {BUILDING_ENTRANCES.map((entrance, index) => (
                  <li key={entrance.id} className={index > 0 ? 'border-t border-line-soft' : ''}>
                    <button
                      type="button"
                      // Keep focus in the field so its blur does not close the list first.
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
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-4 flex h-10 sm:h-11 items-center">
            <EndGlyph />
          </div>
          <div className="min-w-0 flex-1">
            <span className="mb-0.5 block text-[11px] sm:text-xs text-ink-3">ปลายทาง</span>
            <p className="flex h-10 sm:h-11 items-center truncate bg-search px-3 text-body text-ink">
              {destinationLabel}
              {destination && <span className="ml-1 text-ink-3">· ชั้น {destination.floor}</span>}
            </p>
          </div>
        </div>
      </div>
      <p className="-mt-1.5 pl-7 text-[11px] text-ink-3">แตะห้องบนแผนที่เพื่อเปลี่ยนปลายทาง</p>

      {/* Route status */}
      {routeState.status === 'loading' && (
        <p role="status" className="py-2 text-button text-ink-3">
          กำลังคำนวณเส้นทาง…
        </p>
      )}

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

      {routeState.status === 'not-found' && routeState.reason && (
        <div role="alert" className="card flex items-start gap-3 border-ink p-4">
          <Prohibit size={20} weight="bold" className="shrink-0 text-ink" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-button font-medium text-ink">{ROUTE_FAILURE_MESSAGES[routeState.reason].title}</p>
            <p className="mt-0.5 text-button text-ink-2">{ROUTE_FAILURE_MESSAGES[routeState.reason].hint}</p>
          </div>
        </div>
      )}

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
            <ol aria-label="ขั้นตอนเส้นทาง" className="space-y-2">
              {legs.map((leg, index) => {
                const next = legs[index + 1]
                const isShown = leg.floor === currentFloor
                const walk = index === 0 ? `เดินจาก${fromLabel} ` : 'เดินต่อ'
                const to = next ? 'ไปที่บันได' : `ไปยัง${destinationLabel}`
                const legSteps = generateLegInstructions(
                  leg.points,
                  rooms,
                  leg.floor,
                  !next,
                  destinationLabel,
                  fromLabel,
                  index === 0,
                  destination?.id,
                  fromId,
                )
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => onFloorChange(leg.floor)}
                      aria-pressed={isShown}
                      className={`flex w-full items-start gap-2.5 border p-2.5 sm:p-3 text-left transition-colors ${
                        isShown ? 'border-ink bg-white shadow-xs' : 'border-line-soft bg-white hover:bg-surface-2'
                      }`}
                    >
                      <span
                        className={`flex h-6 sm:h-7 shrink-0 items-center rounded-full px-2 sm:px-2.5 text-[11px] sm:text-xs font-bold ${
                          isShown ? 'bg-ink text-white' : 'bg-tertiary text-ink'
                        }`}
                      >
                        ชั้น {leg.floor}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-button text-ink font-semibold">
                          {walk}
                          {to}
                        </span>
                        {!isShown && <span className="block text-[11px] text-ink-3">แตะเพื่อดูชั้นนี้</span>}
                        {isShown && legSteps.length > 0 && (
                          <div className="mt-2.5 space-y-1.5 border-t border-line-soft/80 pt-2">
                            {legSteps.map((step, stepIdx) => (
                              <div key={step.id || stepIdx} className="flex items-center gap-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] font-bold text-ink">
                                  {stepIdx + 1}
                                </span>
                                <span className="text-xs font-medium text-ink-2">
                                  {step.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                    {next && (
                      <p className="flex items-center gap-2 py-2 pl-3 text-button font-medium text-ink">
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
          )}
        </div>
      )}
    </section>
  )
}
