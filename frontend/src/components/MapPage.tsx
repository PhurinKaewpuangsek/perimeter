/**
 * MapPage — Official interactive floor-plan view with Unified Left Sidebar.
 * Route: /map
 *
 * Refined design improvements:
 * 1. Prominent Brand Header: Enlarged Perimeter logo (h-10 / 40px) with clean typography.
 * 2. Elevated Room Hero Card: Large room number callout, Thai room title, Category & Capacity chips,
 *    and streamlined compact landmark strip.
 * 3. Chronological Day-Grouped Schedule: Fixed 3-letter day codes (MON-SUN), Thai day badges with
 *    standard day colors, quick day filter pills, and cleaned non-redundant schedule cards.
 */
import { useState, useMemo, useRef, useEffect, createElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  X,
  MapPin,
  CalendarPlus,
  BookOpen,
  GraduationCap,
  NavigationArrow,
  Sparkle,
  Users,
  Prohibit,
} from '@phosphor-icons/react'
import { useRooms } from '../hooks/useRooms'
import { useGraph } from '../hooks/useGraph'
import { activeRoomClosures, formatWindow } from '../services/closureModel'
import type { Closure } from '../types/graph'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useSchedules } from '../hooks/useSchedules'
import { usePreloadImages } from '../hooks/usePreloadImages'
import { useRoute } from '../hooks/useRoute'
import { BUILDING_ENTRANCE_FLOOR, BUILDING_ENTRANCE_ID, BUILDING_ENTRANCE_2_ID } from '../services/routeService'
import MapContainer from './map/MapContainer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import LoadingScreen from './LoadingScreen'
import TopBar from './TopBar'
import SearchBar from './SearchBar'
import NavigationPanel from './NavigationPanel'
import CategoryFilter from './CategoryFilter'
import SearchResultList from './SearchResultList'
import PinButton from './PinButton'
import WeeklyTimetable from './WeeklyTimetable'
import ExamAgendaList from './ExamAgendaList'
import {
  filterRooms,
  getExpandedSearchTerms,
  scheduleMatchesQuery,
  DEFAULT_CATEGORY_KEY,
  parseExamQuery,
  isExamKeywordQuery,
  resolveScheduleTabOnRoomSelect,
} from '../services/filterRooms'
import { useExamSearch } from '../hooks/useExamSearch'
import {
  getBuildingLabel,
  getCategoryLabel,
  getLandmarkText,
  getCategoryColor,
} from '../services/roomDisplay'
import { getCategoryIcon } from './categoryIcon'
import { buildGoogleCalendarUrl } from '../services/calendarExport'
import { computeScheduleSlot } from '../hooks/usePins'
import { formatLocalDate, isExamSchedule } from '../services/scheduleDisplay'
import { useRoomSchedules } from '../hooks/useRoomSchedules'
import type { Room } from '../types/room'
import type { ScheduleSlot } from '../types/schedule'
import type { PinnedSchedule } from '../types/pin'

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((config) => config.asset)

/**
 * How often /map refetches closures and re-checks their windows, so a closure staff add or
 * cancel, or one that starts or ends, shows up without a page reload.
 */
const CLOSURE_CLOCK_MS = 60_000

/** Shown in the room panel when closures failed to load, so the room may be closed. */
function ClosureStatusUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="status" className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
      <span>ตรวจสอบสถานะปิดชั่วคราวไม่ได้ในขณะนี้</span>
      <button type="button" onClick={onRetry} className="btn btn-ghost btn-sm">
        ลองใหม่
      </button>
    </div>
  )
}

/** Shown in the room panel while staff have the room closed (#147). */
function RoomClosureNotice({ closure }: { closure: Closure }) {
  return (
    <div role="status" className="mt-3 flex items-start gap-2 border border-ink bg-surface-2 p-3">
      <Prohibit size={16} weight="bold" className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
      <div className="min-w-0 text-xs text-ink-2">
        <p className="text-button font-bold text-ink">ปิดชั่วคราว</p>
        <p className="mt-0.5">ช่วงเวลา: {formatWindow(closure)}</p>
        {closure.closedReason && <p className="mt-0.5 break-words">เหตุผล: {closure.closedReason}</p>}
      </div>
    </div>
  )
}

function RoomCategoryBadge({ category, nameThai }: { category: string; nameThai?: string }) {
  const color = getCategoryColor(category)
  const Icon = getCategoryIcon(category, nameThai)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${color.border} ${color.bg} px-2.5 py-1 text-xs font-medium ${color.text}`}
    >
      {createElement(Icon, { size: 14, weight: 'duotone' })}
      <span>{getCategoryLabel(category)}</span>
    </span>
  )
}

interface RoomDetailContentProps {
  room: Room
  onClose: () => void
  onNavigate: () => void
  activeScheduleTab: 'class' | 'exam'
  setActiveScheduleTab: (tab: 'class' | 'exam') => void
  classSchedules: ScheduleSlot[]
  examSchedules: ScheduleSlot[]
  schedulesLoading: boolean
  schedulesError: Error | null
  reloadSchedules: () => void
  /** Set while staff have this room closed right now (#147). */
  closure?: Closure
  /** Set when closures could not be loaded, so "open" cannot be confirmed; retries the load. */
  onRetryClosures?: () => void
  highlightExamCode?: string | null
}

function RoomDetailContent({
  room,
  onClose,
  onNavigate,
  activeScheduleTab,
  setActiveScheduleTab,
  classSchedules,
  examSchedules,
  schedulesLoading,
  schedulesError,
  reloadSchedules,
  closure,
  onRetryClosures,
  highlightExamCode,
}: RoomDetailContentProps) {

  const renderScheduleActions = (slot: ScheduleSlot) => {
    const scheduleSlot = computeScheduleSlot(slot)
    const calendarSlot: PinnedSchedule = {
      ...slot,
      userId: '',
      scheduleSlot,
      pinKey: `${slot.roomCode}#${scheduleSlot}`,
    }
    const calendarUrl = buildGoogleCalendarUrl(calendarSlot)

    return (
      <>
        <PinButton slot={slot} showLabel />
        {calendarUrl ? (
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`เพิ่ม ${slot.eventCode} ลง Google Calendar`}
            title="เพิ่มลง Google Calendar"
            className="btn btn-tertiary btn-icon-sm"
          >
            <CalendarPlus size={14} weight="bold" />
          </a>
        ) : (
          <span
            aria-label="ยังเพิ่มลง Google Calendar ไม่ได้จนกว่าจะประกาศวันสอบ"
            title="ยังเพิ่มลง Google Calendar ไม่ได้จนกว่าจะประกาศวันสอบ"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-3"
          >
            <CalendarPlus size={14} weight="bold" />
          </span>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ROOM HERO CARD (square white card on desktop; seamless in mobile bottom sheet) */}
      <div className="sm:card p-0 sm:p-4 border-0 sm:border shadow-none sm:shadow-card">
        {/* Header Row: location breadcrumb + close button */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 uppercase">
              <span>{getBuildingLabel(room.building)}</span>
              <span aria-hidden="true">·</span>
              <span>ชั้น {room.floor}</span>
            </div>

            {/* Main Room Identity */}
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-display text-h3 font-bold text-ink">
                {room.roomNumber ? (
                  <>
                    <span className="mr-1.5 text-body font-medium text-ink-3">ห้อง</span>
                    <span>{room.roomNumber}</span>
                  </>
                ) : (
                  <span>{room.nameThai || room.code || '-'}</span>
                )}
              </h2>
              {room.code &&
                room.roomNumber &&
                room.code !== room.roomNumber && (
                  <span className="text-xs font-medium text-ink-3">({room.code})</span>
                )}
            </div>

            {room.nameThai &&
              room.roomNumber &&
              room.nameThai !== room.roomNumber && (
                <p className="mt-1 text-button font-medium text-ink-2">{room.nameThai}</p>
              )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดรายละเอียดห้อง"
            className="btn btn-ghost btn-icon-sm -mt-1 -mr-1"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {closure && <RoomClosureNotice closure={closure} />}
        {!closure && onRetryClosures && <ClosureStatusUnavailable onRetry={onRetryClosures} />}

        {/* Quick Meta Chips: Category + Capacity */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RoomCategoryBadge category={room.category} nameThai={room.nameThai} />

          {room.capacity !== undefined && (
            <span className="chip">
              <Users size={14} weight="bold" className="text-ink-3" />
              <span>ความจุ {room.capacity} คน</span>
            </span>
          )}
        </div>

        {/* Compact Landmark Strip */}
        {room.landmarks && room.landmarks.length > 0 && (
          <div className="mt-3 flex items-start gap-2 border-t border-line-soft pt-3">
            <MapPin size={15} weight="fill" className="mt-0.5 shrink-0 text-ink" />
            <div className="text-xs text-ink-2">
              <span className="font-medium text-ink">จุดสังเกต: </span>
              {room.landmarks.map((l) => getLandmarkText(l)).join(' · ')}
            </div>
          </div>
        )}

        <button type="button" onClick={onNavigate} className="btn btn-primary mt-4 w-full">
          <NavigationArrow size={16} weight="fill" aria-hidden="true" />
          <span>นำทางมาที่นี่</span>
        </button>
      </div>

      {/* SCHEDULE SECTION */}
      <div className="border-t border-line-soft pt-4">
        {/* Schedule Tabs Header */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-h3-sm font-bold text-ink">
            ตารางการใช้ห้อง
          </h3>

          <div
            role="group"
            aria-label="ประเภทตาราง"
            className="gooey-switch-group rounded-full bg-tertiary p-0.5"
          >
            {(() => {
              const activeTabIdx = activeScheduleTab === 'exam' ? 1 : 0
              const blobTransform = `translateX(${activeTabIdx * 100}%)`
              return (
                <div aria-hidden="true" className="gooey-switch-blobs inset-0.5">
                  <span
                    className="gooey-pill-lead"
                    style={{ width: '50%', transform: blobTransform }}
                  />
                  <span
                    className="gooey-pill-drop"
                    style={{ width: '50%', transform: blobTransform }}
                  />
                  <span
                    className="gooey-pill-trail"
                    style={{ width: '50%', transform: blobTransform }}
                  />
                </div>
              )
            })()}
            <button
              type="button"
              onClick={() => setActiveScheduleTab('class')}
              aria-pressed={activeScheduleTab === 'class'}
              className={`btn btn-sm gooey-switch-btn ${
                activeScheduleTab === 'class' ? 'text-white' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <BookOpen size={13} weight="bold" />
              <span>ตารางเรียน</span>
              <span className="text-xs">({classSchedules.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveScheduleTab('exam')}
              aria-pressed={activeScheduleTab === 'exam'}
              className={`btn btn-sm gooey-switch-btn ${
                activeScheduleTab === 'exam' ? 'text-white' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <GraduationCap size={13} weight="bold" />
              <span>ตารางสอบ</span>
              <span className="text-xs">({examSchedules.length})</span>
            </button>
          </div>
        </div>

        {schedulesError ? (
          <div className="py-6 text-center">
            <p className="text-button text-ink">โหลดตารางห้องไม่สำเร็จ: {schedulesError.message}</p>
            <button
              type="button"
              onClick={() => reloadSchedules()}
              className="btn btn-secondary btn-sm mt-3"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : schedulesLoading ? (
          <p role="status" className="py-6 text-center text-button text-ink-3">
            กำลังโหลดตารางห้อง...
          </p>
        ) : (
          <div key={activeScheduleTab} className="animate-gooey-content-swap">
            {activeScheduleTab === 'class' ? (
              <WeeklyTimetable
                slots={classSchedules}
                renderActions={renderScheduleActions}
                layout="compact"
                title={`ห้อง ${room.roomNumber || room.code || ''}${room.nameThai ? ` (${room.nameThai})` : ''}`}
                roomCode={room.code || room.roomNumber}
              />
            ) : (
              <ExamAgendaList
                slots={examSchedules}
                renderActions={renderScheduleActions}
                roomCode={room.code || room.roomNumber}
                highlightEventCode={highlightExamCode}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MapPage() {
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const initialRoomId = searchParams.get('room') ?? null
  const initialDestinationId = searchParams.get('navigate') ?? null

  const isDesktop = useIsDesktop()

  const { rooms, loading, error, reload } = useRooms()
  const { schedules, loading: schedulesLoading, error: schedulesError } = useSchedules()
  const floorPlansReady = usePreloadImages(FLOOR_PLAN_ASSETS)
  // Closures are public (GET /api/graph). If the first load fails the room panel says the
  // status is unavailable and offers a retry; the minute refresh below also retries.
  const { graph, error: graphError, reload: reloadGraph } = useGraph()
  const retryClosures = graph === null && graphError ? () => reloadGraph().catch(() => {}) : undefined
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
      // A failed refresh keeps the last good graph (useGraph), so closures never vanish.
      reloadGraph().catch(() => {})
    }, CLOSURE_CLOCK_MS)
    return () => clearInterval(timer)
  }, [reloadGraph])
  const roomClosures = useMemo(() => activeRoomClosures(graph, now), [graph, now])
  // Keyed by content so the minute clock alone does not rebuild the 3D markers.
  const closedRoomKey = [...roomClosures.keys()].sort().join('|')
  const closedRoomIds = useMemo(
    () => new Set(closedRoomKey ? closedRoomKey.split('|') : []),
    [closedRoomKey]
  )

  const targetInitialRoom = initialRoomId ? rooms.find((rm) => rm.id === initialRoomId) : null
  // Resolve a cold deep link after the room response arrives, until the user
  // explicitly chooses a floor. useState(initialRoom.floor) misses async data.
  const [floorOverride, setCurrentFloor] = useState<number | null>(null)
  const currentFloor =
    floorOverride ??
    (initialDestinationId
      ? BUILDING_ENTRANCE_FLOOR
      : targetInitialRoom?.floor ?? 1)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    initialRoomId ?? initialDestinationId
  )
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false)
  const [mapView, setMapView] = useState<'2d' | '3d'>('3d')
  const [query, setQuery] = useState(initialQuery)
  const [categoryKey, setCategoryKey] = useState(DEFAULT_CATEGORY_KEY)
  const [isDropdownOpen, setIsDropdownOpen] = useState(
    Boolean(initialQuery && !initialRoomId && !initialDestinationId)
  )
  const [isFilterExpanded, setIsFilterExpanded] = useState(false)
  const [targetExamCode, setTargetExamCode] = useState<string | null>(() => {
    if (!initialQuery) return null
    const parsed = parseExamQuery(initialQuery).courseCode
    return /^[A-Z]+\d+[A-Z0-9]*$/i.test(parsed) ? parsed : null
  })
  const [activeScheduleTab, setActiveScheduleTab] = useState<'class' | 'exam'>(() => {
    if (!initialQuery) return 'class'
    if (isExamKeywordQuery(initialQuery)) return 'exam'
    const parsed = parseExamQuery(initialQuery).courseCode
    if (/^[A-Z]+\d+[A-Z0-9]*$/i.test(parsed)) {
      return 'exam'
    }
    return 'class'
  })
  // Navigation (#145): active while a destination is set. Indoors there is no usable
  // GPS, so the start is picked by hand and defaults to the building entrance.
  const [routeFrom, setRouteFrom] = useState(BUILDING_ENTRANCE_ID)
  const [routeTo, setRouteTo] = useState<string | null>(initialDestinationId)
  const isNavigating = routeTo !== null
  const [isNavCollapsed, setIsNavCollapsed] = useState(false)
  const routeState = useRoute(isNavigating ? routeFrom : null, routeTo)

  const inputRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const sheetContentRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{
    startY: number
    startTime: number
    isHandle: boolean
  } | null>(null)
  const hasDraggedRef = useRef<boolean>(false)

  const navSheetRef = useRef<HTMLDivElement>(null)
  const navPeekRef = useRef<HTMLDivElement>(null)
  const navSheetContentRef = useRef<HTMLDivElement>(null)
  const navTouchStartRef = useRef<{
    startY: number
    startTime: number
    isHandle: boolean
    sheetHeight: number
    startCollapsed: boolean
  } | null>(null)
  const navHasDraggedRef = useRef<boolean>(false)

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId),
    [rooms, selectedRoomId]
  )

  const {
    schedules: roomSchedules,
    loading: roomSchedulesLoading,
    error: roomSchedulesError,
    reload: reloadRoomSchedules,
  } = useRoomSchedules(selectedRoom?.code)

  // Split schedules into class and exam
  const classSchedules = useMemo(
    () => roomSchedules.filter((s) => !isExamSchedule(s)),
    [roomSchedules]
  )
  const examSchedules = useMemo(
    () => roomSchedules.filter(isExamSchedule),
    [roomSchedules]
  )

  const hasActiveFilter = categoryKey !== DEFAULT_CATEGORY_KEY
  const hasActiveQueryOrFilter = query.trim() !== '' || hasActiveFilter
  const isShowingSearchResults = isDropdownOpen && hasActiveQueryOrFilter && !isNavigating
  const isDetailOpen = Boolean(selectedRoom) && !isShowingSearchResults && !isNavigating

  const searchResults = useMemo(
    () => (hasActiveQueryOrFilter ? filterRooms(rooms, query, categoryKey, schedules) : []),
    [rooms, query, categoryKey, schedules, hasActiveQueryOrFilter]
  )

  const matchedSchedules = useMemo(() => {
    const searchTerms = getExpandedSearchTerms(query)
    return schedules.filter((schedule) => scheduleMatchesQuery(schedule, searchTerms))
  }, [query, schedules])
  const matchedActivities = useMemo(
    () => matchedSchedules.filter((schedule) => schedule.eventType.toLowerCase() === 'other'),
    [matchedSchedules]
  )
  const {
    examResults,
    examSearchActive,
    pastExamsAvailable,
    showPastExams,
    toggleShowPastExams,
  } = useExamSearch(query, rooms, schedules, formatLocalDate(now))

  function handleSelectRoom(roomId: string, eventCode?: string, explicitTab?: 'class' | 'exam') {
    setSelectedRoomId(roomId)
    setIsSidebarCollapsed(false)
    setIsDropdownOpen(false)
    if (!isDesktop) setIsFilterExpanded(false)

    const targetRoom = rooms.find((r) => r.id === roomId)
    const roomCodeLower = targetRoom?.code?.toLowerCase()
    const targetRoomSchedules = schedules.filter(
      (s) => s.roomCode?.toLowerCase() === roomCodeLower
    )

    const resolution = resolveScheduleTabOnRoomSelect({
      query,
      roomSchedules: targetRoomSchedules,
      explicitTab,
      targetEventCode: eventCode,
    })

    setActiveScheduleTab(resolution.tab)
    setTargetExamCode(resolution.targetCode)

    if (targetRoom && targetRoom.floor !== currentFloor) {
      setCurrentFloor(targetRoom.floor)
    }
  }

  function handleMapRoomSelect(roomId: string) {
    // While navigating, tapping a room makes it the new destination.
    if (isNavigating) {
      setRouteTo(roomId)
      setSelectedRoomId(roomId)
      return
    }
    if (selectedRoomId === roomId) {
      handleUnpinRoom()
      return
    }
    handleSelectRoom(roomId)
  }

  function handleUnpinRoom() {
    setSelectedRoomId(null)
    setTargetExamCode(null)
  }

  /** The floor a route starts on, so the map opens where the user is standing. */
  function getStartFloor(fromId: string) {
    if (fromId === BUILDING_ENTRANCE_ID || fromId === BUILDING_ENTRANCE_2_ID) return BUILDING_ENTRANCE_FLOOR
    return rooms.find((r) => r.id === fromId)?.floor ?? currentFloor
  }

  function handleNavigate(roomId: string) {
    setRouteTo(roomId)
    setSelectedRoomId(roomId)
    setIsNavCollapsed(false)
    setIsDropdownOpen(false)
    setIsSidebarCollapsed(false)
    if (!isDesktop) setIsFilterExpanded(false)
    setCurrentFloor(getStartFloor(routeFrom))
  }

  function handleChangeRouteFrom(fromId: string) {
    setRouteFrom(fromId)
    setCurrentFloor(getStartFloor(fromId))
  }

  function handleClearRoute() {
    setRouteTo(null)
    setIsNavCollapsed(false)
  }

  function handleMapBackgroundClick() {
    if (isDropdownOpen) {
      setIsDropdownOpen(false)
    }
    if (!isDesktop) setIsFilterExpanded(false)
  }

  function handleDismissDetailMobile() {
    if (sheetRef.current && window.innerWidth < 640) {
      sheetRef.current.style.animation = 'none'
      sheetRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 240ms ease-out'
      sheetRef.current.style.transform = 'translateY(100%)'
      sheetRef.current.style.opacity = '0'
      setTimeout(() => {
        handleUnpinRoom()
        if (sheetRef.current) {
          sheetRef.current.style.transform = ''
          sheetRef.current.style.transition = ''
          sheetRef.current.style.opacity = ''
          sheetRef.current.style.animation = ''
        }
      }, 230)
    } else {
      handleUnpinRoom()
    }
  }

  function handleSheetTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const touch = e.touches[0]
    const target = e.target as HTMLElement
    const isHandle = Boolean(target.closest('[data-sheet-handle]'))
    const isAtTop = !sheetContentRef.current || sheetContentRef.current.scrollTop <= 0

    hasDraggedRef.current = false

    if (isHandle || isAtTop) {
      touchStartRef.current = {
        startY: touch.clientY,
        startTime: performance.now(),
        isHandle,
      }
      if (sheetRef.current) {
        sheetRef.current.style.animation = 'none'
        sheetRef.current.style.transition = 'none'
      }
    } else {
      touchStartRef.current = null
    }
  }

  function handleSheetTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!touchStartRef.current || !sheetRef.current) return
    const touch = e.touches[0]
    const deltaY = touch.clientY - touchStartRef.current.startY

    // If touch didn't start on handle, check if user is scrolling content
    if (!touchStartRef.current.isHandle) {
      const currentScrollTop = sheetContentRef.current?.scrollTop ?? 0
      if (currentScrollTop > 0) {
        touchStartRef.current = null
        sheetRef.current.style.transform = 'translateY(0)'
        return
      }
      // If user swipes upwards to scroll down into schedules, allow normal scroll
      if (deltaY < 0 && !hasDraggedRef.current) {
        return
      }
    }

    if (deltaY > 0) {
      // Direct 1:1 real-time drag following user's finger downward
      hasDraggedRef.current = true
      sheetRef.current.style.transform = `translateY(${deltaY}px)`
    } else if (touchStartRef.current.isHandle) {
      // Damped rubber-band resistance when pulling upward on handle
      const damped = Math.max(deltaY * 0.15, -20)
      sheetRef.current.style.transform = `translateY(${damped}px)`
    }
  }

  function handleSheetTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (!touchStartRef.current || !sheetRef.current) return
    const { startY, startTime } = touchStartRef.current
    const wasDragged = hasDraggedRef.current
    touchStartRef.current = null

    if (!wasDragged) {
      // Pure tap without movement: ensure clean resting position
      sheetRef.current.style.transition = 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)'
      sheetRef.current.style.transform = 'translateY(0)'
      return
    }

    // Delay resetting hasDragged so any synthetic click immediately after touchend is suppressed
    setTimeout(() => {
      hasDraggedRef.current = false
    }, 150)

    const touch = e.changedTouches[0]
    const deltaY = touch.clientY - startY
    const elapsed = performance.now() - startTime
    const velocity = deltaY / Math.max(elapsed, 1)

    // Threshold: dragged down > 65px or flicked down with velocity > 0.3
    const shouldDismiss = deltaY > 65 || (deltaY > 20 && velocity > 0.3)

    if (shouldDismiss) {
      // Smooth slide-down animation continuing off-screen
      sheetRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 240ms ease-out'
      sheetRef.current.style.transform = 'translateY(100%)'
      sheetRef.current.style.opacity = '0'

      setTimeout(() => {
        handleUnpinRoom()
        if (sheetRef.current) {
          sheetRef.current.style.transform = ''
          sheetRef.current.style.transition = ''
          sheetRef.current.style.opacity = ''
          sheetRef.current.style.animation = ''
        }
      }, 230)
    } else {
      // Snap back into place smoothly
      sheetRef.current.style.transition = 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)'
      sheetRef.current.style.transform = 'translateY(0)'
      sheetRef.current.style.opacity = '1'
    }
  }

  function handleSheetTouchCancel() {
    touchStartRef.current = null
    hasDraggedRef.current = false
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)'
      sheetRef.current.style.transform = 'translateY(0)'
      sheetRef.current.style.opacity = '1'
    }
  }

  useEffect(() => {
    if (!navSheetRef.current) return
    navSheetRef.current.style.transition = 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)'
    if (isNavCollapsed) {
      navSheetRef.current.style.transform = 'translateY(calc(100% - 68px))'
    } else {
      navSheetRef.current.style.transform = 'translateY(0)'
    }
    if (navPeekRef.current) {
      navPeekRef.current.style.transition = 'opacity 200ms ease'
      navPeekRef.current.style.opacity = isNavCollapsed ? '1' : '0'
      navPeekRef.current.style.pointerEvents = isNavCollapsed ? 'auto' : 'none'
    }
    if (navSheetContentRef.current) {
      navSheetContentRef.current.style.transition = 'opacity 200ms ease'
      navSheetContentRef.current.style.opacity = isNavCollapsed ? '0' : '1'
      navSheetContentRef.current.style.pointerEvents = isNavCollapsed ? 'none' : 'auto'
    }
  }, [isNavCollapsed])

  function handleNavTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const touch = e.touches[0]
    const target = e.target as HTMLElement
    const isHandle = Boolean(target.closest('[data-nav-handle]'))
    const isAtTop = !navSheetContentRef.current || navSheetContentRef.current.scrollTop <= 0

    navHasDraggedRef.current = false

    if (isHandle || isAtTop || isNavCollapsed) {
      const sheetHeight = navSheetRef.current?.offsetHeight || 380
      navTouchStartRef.current = {
        startY: touch.clientY,
        startTime: performance.now(),
        isHandle: isHandle || isNavCollapsed,
        sheetHeight,
        startCollapsed: isNavCollapsed,
      }
      if (navSheetRef.current) {
        navSheetRef.current.style.animation = 'none'
        navSheetRef.current.style.transition = 'none'
      }
      if (navPeekRef.current) {
        navPeekRef.current.style.transition = 'none'
      }
      if (navSheetContentRef.current) {
        navSheetContentRef.current.style.transition = 'none'
      }
    } else {
      navTouchStartRef.current = null
    }
  }

  function handleNavTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!navTouchStartRef.current || !navSheetRef.current) return
    const touch = e.touches[0]
    const { startY, sheetHeight, startCollapsed } = navTouchStartRef.current
    const deltaY = touch.clientY - startY
    const collapsedOffset = Math.max(sheetHeight - 68, 100)

    if (startCollapsed) {
      // Dragging from collapsed peek state
      if (deltaY < 0) {
        // Dragging UP towards expanded (0)
        navHasDraggedRef.current = true
        const currentY = Math.max(0, collapsedOffset + deltaY)
        navSheetRef.current.style.transform = `translateY(${currentY}px)`

        const progress = Math.min(1, Math.max(0, 1 - currentY / collapsedOffset))
        if (navPeekRef.current) {
          navPeekRef.current.style.opacity = String(Math.max(0, 1 - progress * 2))
        }
        if (navSheetContentRef.current) {
          navSheetContentRef.current.style.opacity = String(Math.min(1, progress * 1.5))
        }
      } else {
        // Dragging DOWN from collapsed: rubber-band resistance
        const damped = Math.min(deltaY * 0.15, 15)
        navSheetRef.current.style.transform = `translateY(${collapsedOffset + damped}px)`
      }
      return
    }

    // Dragging from expanded state
    if (!navTouchStartRef.current.isHandle) {
      const currentScrollTop = navSheetContentRef.current?.scrollTop ?? 0
      if (currentScrollTop > 0) {
        navTouchStartRef.current = null
        navSheetRef.current.style.transform = 'translateY(0)'
        return
      }
      if (deltaY < 0 && !navHasDraggedRef.current) {
        return
      }
    }

    if (deltaY > 0) {
      // Dragging DOWN towards collapsed (collapsedOffset)
      navHasDraggedRef.current = true
      const currentY = Math.min(collapsedOffset, deltaY)
      navSheetRef.current.style.transform = `translateY(${currentY}px)`

      const progress = Math.min(1, Math.max(0, 1 - currentY / collapsedOffset))
      if (navPeekRef.current) {
        navPeekRef.current.style.opacity = String(Math.max(0, 1 - progress * 2))
      }
      if (navSheetContentRef.current) {
        navSheetContentRef.current.style.opacity = String(Math.min(1, progress * 1.5))
      }
    } else if (navTouchStartRef.current.isHandle) {
      // Dragging UP from expanded: rubber-band resistance
      const damped = Math.max(deltaY * 0.15, -20)
      navSheetRef.current.style.transform = `translateY(${damped}px)`
    }
  }

  function handleNavTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (!navTouchStartRef.current || !navSheetRef.current) return
    const { startY, startTime, startCollapsed } = navTouchStartRef.current
    const wasDragged = navHasDraggedRef.current
    navTouchStartRef.current = null

    if (navSheetRef.current) {
      navSheetRef.current.style.transition = 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)'
    }
    if (navPeekRef.current) {
      navPeekRef.current.style.transition = 'opacity 200ms ease'
    }
    if (navSheetContentRef.current) {
      navSheetContentRef.current.style.transition = 'opacity 200ms ease'
    }

    if (!wasDragged) {
      // Tap without dragging
      if (startCollapsed) {
        setIsNavCollapsed(false)
      } else {
        navSheetRef.current.style.transform = 'translateY(0)'
      }
      return
    }

    setTimeout(() => {
      navHasDraggedRef.current = false
    }, 150)

    const touch = e.changedTouches[0]
    const deltaY = touch.clientY - startY
    const elapsed = performance.now() - startTime
    const velocity = deltaY / Math.max(elapsed, 1)

    if (startCollapsed) {
      const shouldExpand = deltaY < -40 || (deltaY < -15 && velocity < -0.3)
      if (shouldExpand) {
        setIsNavCollapsed(false)
      } else {
        navSheetRef.current.style.transform = 'translateY(calc(100% - 68px))'
        if (navPeekRef.current) navPeekRef.current.style.opacity = '1'
        if (navSheetContentRef.current) navSheetContentRef.current.style.opacity = '0'
      }
    } else {
      const shouldCollapse = deltaY > 50 || (deltaY > 15 && velocity > 0.3)
      if (shouldCollapse) {
        setIsNavCollapsed(true)
      } else {
        navSheetRef.current.style.transform = 'translateY(0)'
        if (navPeekRef.current) navPeekRef.current.style.opacity = '0'
        if (navSheetContentRef.current) navSheetContentRef.current.style.opacity = '1'
      }
    }
  }

  function handleNavTouchCancel() {
    navTouchStartRef.current = null
    navHasDraggedRef.current = false
    if (navSheetRef.current) {
      navSheetRef.current.style.transition = 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)'
      navSheetRef.current.style.transform = isNavCollapsed ? 'translateY(calc(100% - 68px))' : 'translateY(0)'
    }
    if (navPeekRef.current) {
      navPeekRef.current.style.transition = 'opacity 200ms ease'
      navPeekRef.current.style.opacity = isNavCollapsed ? '1' : '0'
    }
    if (navSheetContentRef.current) {
      navSheetContentRef.current.style.transition = 'opacity 200ms ease'
      navSheetContentRef.current.style.opacity = isNavCollapsed ? '0' : '1'
    }
  }

  if (error) return <LoadingScreen error={error} onRetry={() => reload()} />
  if (loading || !floorPlansReady) return <LoadingScreen />

  const navigationPanel = isNavigating && (
    <NavigationPanel
      rooms={rooms}
      fromId={routeFrom}
      onChangeFrom={handleChangeRouteFrom}
      destination={rooms.find((r) => r.id === routeTo)}
      routeState={routeState}
      currentFloor={currentFloor}
      onFloorChange={setCurrentFloor}
      onClose={handleClearRoute}
    />
  )

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-surface-2 select-none">
      {/* Fixed 64px top bar + desktop bottom dock */}
      <TopBar
        sidebarWidth={isDesktop ? 460 : undefined}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={isDesktop ? () => setIsSidebarCollapsed((prev) => !prev) : undefined}
        currentFloor={isDesktop ? currentFloor : undefined}
        onFloorChange={isDesktop ? setCurrentFloor : undefined}
        mapView={isDesktop ? mapView : undefined}
        onToggleMapView={
          isDesktop ? () => setMapView((prev) => (prev === '3d' ? '2d' : '3d')) : undefined
        }
      />

      {/* Map area below the top bar. `isolate` keeps every map layer (3D pins, sidebar,
          mobile search panel and backdrop, room sheet) under the top bar and the
          My Schedule drawer, whatever z-index they use inside (issue #139). */}
      <div className="absolute inset-x-0 top-16 bottom-0 isolate overflow-hidden">
        {/* Interactive map workspace, with a 2D fallback */}
        <MapContainer
          rooms={rooms}
          currentFloor={currentFloor}
          onFloorChange={setCurrentFloor}
          selectedRoomId={selectedRoomId}
          isDetailOpen={isDetailOpen}
          sidebarWidth={isSidebarCollapsed ? 0 : 460}
          onSelectRoom={handleMapRoomSelect}
          onClearSelection={handleMapBackgroundClick}
          viewMode={mapView}
          onViewModeChange={setMapView}
          hideBottomControls={isDesktop || (isNavigating && !isNavCollapsed)}
          hideFloorSwitcher={isNavigating && !isNavCollapsed}
          isNavCollapsed={isNavCollapsed}
          route={routeState.route}
          closedRoomIds={closedRoomIds}
        />

        {/* =========================================================================
            DESKTOP LEFT SIDEBAR (Docked full-height panel: >= sm)
            ========================================================================= */}
        {isDesktop ? (
          <>
            <aside
              className={`pointer-events-none absolute top-0 bottom-0 left-0 z-40 w-[460px] transition-transform duration-300 ease-in-out ${
                isSidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
              }`}
            >
              <div className="pointer-events-auto relative flex h-full flex-col border-r border-line-soft bg-white">
                {/* Search Controls (Pinned at top of sidebar); the navigation panel replaces them */}
                <div className="border-b border-line-soft p-4" hidden={isNavigating}>
                  <div className="w-full">
                    <SearchBar
                      inputRef={inputRef}
                      value={query}
                      onChange={(newQuery) => {
                        setQuery(newQuery)
                        setIsDropdownOpen(true)
                      }}
                      onClear={() => {
                        setQuery('')
                        setIsDropdownOpen(false)
                      }}
                      onFocus={() => {
                        setIsDropdownOpen(true)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsDropdownOpen(false)
                      }}
                      isFilterOpen={isFilterExpanded}
                      hasActiveFilter={hasActiveFilter}
                      onToggleFilter={() => setIsFilterExpanded((prev) => !prev)}
                    />
                  </div>

                  {/* Category Filter Pills Collapsible */}
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
                      isFilterExpanded ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <CategoryFilter
                        value={categoryKey}
                        onChange={(newCategory) => {
                          setCategoryKey(newCategory)
                          setIsDropdownOpen(true)
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Content Area: Switches between Room Detail, Search Results, and Explore State */}
                <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
                  {/* STATE 0: NAVIGATION (start, destination and route) */}
                  {navigationPanel ? (
                    navigationPanel
                  ) : /* STATE 1: ROOM DETAIL VIEW */
                  selectedRoom && isDetailOpen ? (
                    <RoomDetailContent
                      room={selectedRoom}
                      onClose={handleUnpinRoom}
                      onNavigate={() => handleNavigate(selectedRoom.id)}
                      activeScheduleTab={activeScheduleTab}
                      setActiveScheduleTab={setActiveScheduleTab}
                      classSchedules={classSchedules}
                      examSchedules={examSchedules}
                      schedulesLoading={roomSchedulesLoading}
                      schedulesError={roomSchedulesError}
                      reloadSchedules={reloadRoomSchedules}
                      closure={roomClosures.get(selectedRoom.id)}
                      onRetryClosures={retryClosures}
                      highlightExamCode={targetExamCode}
                    />
                  ) : isShowingSearchResults ? (
                    /* STATE 2: SEARCH RESULTS LIST */
                    <div>
                      <SearchResultList
                        rooms={searchResults}
                        allRooms={rooms}
                        schedules={matchedSchedules}
                        activityResults={matchedActivities}
                        roomClosures={roomClosures}
                        closureStatusUnavailable={graph === null && Boolean(graphError)}
                        examResults={examResults}
                        examSearchActive={examSearchActive}
                        pastExamsAvailable={pastExamsAvailable}
                        showPastExams={showPastExams}
                        onToggleShowPastExams={toggleShowPastExams}
                        schedulesLoading={schedulesLoading}
                        schedulesError={schedulesError}
                        loading={loading}
                        error={error}
                        onSelectRoom={handleSelectRoom}
                        onNavigateToRoom={handleNavigate}
                      />
                    </div>
                  ) : (
                    /* STATE 3: DEFAULT EMPTY / EXPLORE STATE */
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tertiary text-ink">
                        <Sparkle size={24} weight="bold" />
                      </div>
                      <h3 className="font-display text-h3-sm font-bold text-ink">สำรวจอาคารเรียนรวม 3 (LC3)</h3>
                      <p className="mt-1 max-w-xs text-button text-ink-2">
                        คลิกที่ห้องบนผัง หรือค้นหาห้องเรียนด้านบนเพื่อดูข้อมูล จุดสังเกต และตารางเวลา
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            </>
        ) : (
          <>
            {/* =========================================================================
                MOBILE FLOATING SEARCH PANEL (Mobile only: < sm), just below the top bar
                ========================================================================= */}
            <div className="pointer-events-none absolute inset-x-3 top-3 z-101 sm:hidden" hidden={isNavigating}>
              <div className="pointer-events-auto relative z-10 flex flex-col">
                <div className="w-full shadow-floating">
                  <SearchBar
                    inputRef={inputRef}
                    value={query}
                    placeholder={isDesktop ? 'ค้นหาห้องหรือรหัสวิชา เช่น 109, CS361' : 'ค้นหาห้อง เช่น 105, CS341'}
                    onChange={(newQuery) => {
                      setQuery(newQuery)
                      setIsDropdownOpen(true)
                    }}
                    onClear={() => {
                      setQuery('')
                      setIsDropdownOpen(false)
                    }}
                    onFocus={() => {
                      setIsDropdownOpen(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setIsDropdownOpen(false)
                    }}
                    isFilterOpen={isFilterExpanded}
                    hasActiveFilter={hasActiveFilter}
                    onToggleFilter={() => setIsFilterExpanded((prev) => !prev)}
                  />
                </div>

                {/* Collapsible Category Filter on Mobile */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
                    isFilterExpanded ? 'mt-2 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="card p-2 shadow-floating">
                      <CategoryFilter
                        value={categoryKey}
                        onChange={(newCategory) => {
                          setCategoryKey(newCategory)
                          setIsDropdownOpen(true)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile Search Results Floating Dropdown Sheet.
                  The wrapper above is pointer-events-none so the map stays usable around the
                  search bar. Both layers here must opt back in with pointer-events-auto:
                  otherwise a tap on a result falls through to the map underneath and selects
                  whichever room pin happens to sit under the finger (issue #91). */}
              {isShowingSearchResults && (
                <>
                  <div
                    data-testid="mobile-search-backdrop"
                    className="pointer-events-auto fixed inset-0 z-1 bg-black/25"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div
                    data-testid="mobile-search-results"
                    className="card no-scrollbar pointer-events-auto relative z-20 mt-2 max-h-[65dvh] overflow-y-auto p-3 shadow-modal animate-fade-in"
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-line-soft pb-2">
                      <span className="text-xs font-bold text-ink-2">
                        ผลการค้นหา ({examSearchActive ? examResults.length : searchResults.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(false)}
                        className="btn btn-ghost btn-sm"
                      >
                        ปิด
                      </button>
                    </div>
                    <SearchResultList
                      rooms={searchResults}
                      allRooms={rooms}
                      schedules={matchedSchedules}
                      activityResults={matchedActivities}
                      roomClosures={roomClosures}
                      closureStatusUnavailable={graph === null && Boolean(graphError)}
                      examResults={examResults}
                      examSearchActive={examSearchActive}
                      pastExamsAvailable={pastExamsAvailable}
                      showPastExams={showPastExams}
                      onToggleShowPastExams={toggleShowPastExams}
                      schedulesLoading={schedulesLoading}
                      schedulesError={schedulesError}
                      loading={loading}
                      error={error}
                      onSelectRoom={handleSelectRoom}
                      onNavigateToRoom={handleNavigate}
                    />
                  </div>
                </>
              )}
            </div>

            {/* MOBILE NAVIGATION BOTTOM SHEET (Mobile only: < sm)
                Docks cleanly at the bottom like Google Maps/Apple Maps, leaving the entire 3D route map clear above */}
            {navigationPanel && (
              <div
                ref={navSheetRef}
                data-testid="mobile-navigation"
                onAnimationEnd={() => {
                  if (navSheetRef.current) {
                    navSheetRef.current.style.animation = 'none'
                  }
                }}
                onTouchStart={handleNavTouchStart}
                onTouchMove={handleNavTouchMove}
                onTouchEnd={handleNavTouchEnd}
                onTouchCancel={handleNavTouchCancel}
                style={{
                  transform: isNavCollapsed ? 'translateY(calc(100% - 68px))' : 'translateY(0)',
                }}
                className="pointer-events-auto fixed inset-x-0 bottom-0 z-101 flex h-[50dvh] max-h-[50dvh] flex-col rounded-t-2xl border-t border-line-soft bg-white shadow-modal will-change-transform sm:hidden"
              >
                {/* Grab Handle Header Bar (Touch drag zone & tap to toggle collapse) */}
                <div
                  data-nav-handle="true"
                  className="flex w-full shrink-0 cursor-grab touch-none items-center justify-center pt-2.5 pb-1 select-none active:cursor-grabbing"
                  onClick={() => {
                    if (navHasDraggedRef.current) return
                    setIsNavCollapsed((prev) => !prev)
                  }}
                  title={isNavCollapsed ? 'เลื่อนขึ้นเพื่อดูรายละเอียด' : 'เลื่อนลงเพื่อดูแผนที่เต็ม'}
                >
                  <div className="h-1.5 w-12 rounded-full bg-line-soft transition-colors active:bg-line" />
                </div>

                {/* Relative Content Viewport */}
                <div className="relative flex-1 overflow-hidden">
                  {/* Collapsed Peek Content Bar */}
                  <div
                    ref={navPeekRef}
                    aria-hidden={!isNavCollapsed}
                    className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pb-2.5 cursor-pointer select-none transition-opacity duration-200"
                    style={{
                      opacity: isNavCollapsed ? 1 : 0,
                      pointerEvents: isNavCollapsed ? 'auto' : 'none',
                    }}
                    onClick={() => setIsNavCollapsed(false)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                        <NavigationArrow size={14} weight="fill" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-button font-bold text-ink">
                          {(() => {
                            const dest = rooms.find((r) => r.id === routeTo)
                            return dest?.roomNumber
                              ? `ห้อง ${dest.roomNumber}`
                              : dest?.nameThai || dest?.code || 'นำทาง'
                          })()}
                        </p>
                        <p className="text-[11px] text-ink-3">แตะเพื่อดูวิธีเดิน</p>
                      </div>
                    </div>
                    <div className="flex items-center shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleClearRoute()
                        }}
                        aria-label="ล้างเส้นทาง"
                        title="ล้างเส้นทาง"
                        className="btn btn-ghost btn-sm text-ink-2 hover:text-ink px-2"
                      >
                        <X size={14} weight="bold" />
                        <span>ล้างเส้นทาง</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Full Directions */}
                  <div
                    ref={navSheetContentRef}
                    aria-hidden={isNavCollapsed}
                    className="no-scrollbar h-full overflow-y-auto overscroll-contain px-4 pt-1 pb-5 transition-opacity duration-200"
                    style={{
                      opacity: isNavCollapsed ? 0 : 1,
                      pointerEvents: isNavCollapsed ? 'none' : 'auto',
                    }}
                  >
                    {navigationPanel}
                  </div>
                </div>              </div>
            )}

            {/* =========================================================================
                MOBILE ROOM DETAIL BOTTOM SHEET (Mobile only: < sm)
                ========================================================================= */}
            {selectedRoom && isDetailOpen && (
              <div
                ref={sheetRef}
                onAnimationEnd={() => {
                  if (sheetRef.current) {
                    sheetRef.current.style.animation = 'none'
                  }
                }}
                onTouchStart={handleSheetTouchStart}
                onTouchMove={handleSheetTouchMove}
                onTouchEnd={handleSheetTouchEnd}
                onTouchCancel={handleSheetTouchCancel}
                className="pointer-events-auto fixed inset-x-0 bottom-0 z-101 flex max-h-[55dvh] flex-col border-t border-line-soft bg-white shadow-modal animate-modal-mobile will-change-transform sm:hidden"
              >
                {/* Grab Handle Header Bar (Touch drag zone & tap to dismiss) */}
                <div
                  data-sheet-handle="true"
                  className="flex w-full shrink-0 cursor-grab touch-none items-center justify-center pt-3 pb-2.5 select-none active:cursor-grabbing"
                  onClick={() => {
                    if (hasDraggedRef.current) return
                    handleDismissDetailMobile()
                  }}
                  title="เลื่อนลงเพื่อปิด"
                >
                  <div className="h-1.5 w-12 rounded-full bg-line-soft transition-colors active:bg-line" />
                </div>

                {/* Scrollable Room Detail Content */}
                <div
                  ref={sheetContentRef}
                  className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-6"
                >
                  <RoomDetailContent
                    room={selectedRoom}
                    onClose={handleDismissDetailMobile}
                    onNavigate={() => handleNavigate(selectedRoom.id)}
                    activeScheduleTab={activeScheduleTab}
                    setActiveScheduleTab={setActiveScheduleTab}
                    classSchedules={classSchedules}
                    examSchedules={examSchedules}
                    schedulesLoading={roomSchedulesLoading}
                    schedulesError={roomSchedulesError}
                    reloadSchedules={reloadRoomSchedules}
                    closure={roomClosures.get(selectedRoom.id)}
                    onRetryClosures={retryClosures}
                    highlightExamCode={targetExamCode}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
