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
import { useState, useMemo, useRef, createElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  X,
  MapPin,
  Calendar,
  CalendarPlus,
  ArrowCounterClockwise,
  BookOpen,
  GraduationCap,
  Sparkle,
  Users,
} from '@phosphor-icons/react'
import { useRooms } from '../hooks/useRooms'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useSchedules } from '../hooks/useSchedules'
import { usePreloadImages } from '../hooks/usePreloadImages'
import MapContainer from './map/MapContainer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import LoadingScreen from './LoadingScreen'
import TopBar from './TopBar'
import SearchBar from './SearchBar'
import CategoryFilter from './CategoryFilter'
import SearchResultList from './SearchResultList'
import PinButton from './PinButton'
import WeeklyTimetable from './WeeklyTimetable'
import {
  filterRooms,
  getExpandedSearchTerms,
  scheduleMatchesQuery,
  DEFAULT_CATEGORY_KEY,
} from '../services/filterRooms'
import {
  getBuildingLabel,
  getCategoryLabel,
  getLandmarkText,
  getCategoryColor,
} from '../services/roomDisplay'
import { getCategoryIcon } from './categoryIcon'
import { buildGoogleCalendarUrl } from '../services/calendarExport'
import { computeScheduleSlot } from '../hooks/usePins'
import { isExamSchedule } from '../services/scheduleDisplay'
import { useRoomSchedules } from '../hooks/useRoomSchedules'
import type { Room } from '../types/room'
import type { ScheduleSlot } from '../types/schedule'
import type { PinnedSchedule } from '../types/pin'

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((config) => config.asset)

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
  activeScheduleTab: 'class' | 'exam'
  setActiveScheduleTab: (tab: 'class' | 'exam') => void
  classSchedules: ScheduleSlot[]
  examSchedules: ScheduleSlot[]
  schedulesLoading: boolean
  schedulesError: Error | null
  reloadSchedules: () => void
}

function RoomDetailContent({
  room,
  onClose,
  activeScheduleTab,
  setActiveScheduleTab,
  classSchedules,
  examSchedules,
  schedulesLoading,
  schedulesError,
  reloadSchedules,
}: RoomDetailContentProps) {
  const activeSchedules = activeScheduleTab === 'class' ? classSchedules : examSchedules

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
      {/* ROOM HERO CARD (square white card, room number as the heading) */}
      <div className="card p-4">
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
      </div>

      {/* SCHEDULE SECTION */}
      <div className="border-t border-line-soft pt-4">
        {/* Schedule Tabs Header */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-1.5 font-display text-h3-sm font-bold text-ink">
            <Calendar size={16} weight="bold" />
            <span>ตารางการใช้ห้อง</span>
          </h3>

          <div role="group" aria-label="ประเภทตาราง" className="flex gap-1">
            <button
              type="button"
              onClick={() => setActiveScheduleTab('class')}
              aria-pressed={activeScheduleTab === 'class'}
              className={`btn btn-sm ${activeScheduleTab === 'class' ? 'btn-primary' : 'btn-tertiary'}`}
            >
              <BookOpen size={13} weight="bold" />
              <span>ตารางเรียน</span>
              <span className="text-xs">({classSchedules.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveScheduleTab('exam')}
              aria-pressed={activeScheduleTab === 'exam'}
              className={`btn btn-sm ${activeScheduleTab === 'exam' ? 'btn-primary' : 'btn-tertiary'}`}
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
          <WeeklyTimetable
            key={activeScheduleTab}
            slots={activeSchedules}
            renderActions={renderScheduleActions}
          />
        )}
      </div>
    </div>
  )
}

export default function MapPage() {
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const initialRoomId = searchParams.get('room') ?? null

  const isDesktop = useIsDesktop()

  const { rooms, loading, error, reload } = useRooms()
  const { schedules, loading: schedulesLoading, error: schedulesError } = useSchedules()
  const floorPlansReady = usePreloadImages(FLOOR_PLAN_ASSETS)

  const targetInitialRoom = initialRoomId ? rooms.find((rm) => rm.id === initialRoomId) : null
  // Resolve a cold deep link after the room response arrives, until the user
  // explicitly chooses a floor. useState(initialRoom.floor) misses async data.
  const [floorOverride, setCurrentFloor] = useState<number | null>(null)
  const currentFloor = floorOverride ?? targetInitialRoom?.floor ?? 1
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId)
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(Boolean(initialRoomId))
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false)
  const [mapView, setMapView] = useState<'2d' | '3d'>('3d')
  const [query, setQuery] = useState(initialQuery)
  const [categoryKey, setCategoryKey] = useState(DEFAULT_CATEGORY_KEY)
  const [isDropdownOpen, setIsDropdownOpen] = useState(Boolean(initialQuery))
  const [isFilterExpanded, setIsFilterExpanded] = useState(false)
  const [activeScheduleTab, setActiveScheduleTab] = useState<'class' | 'exam'>('class')

  const inputRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const sheetContentRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{
    startY: number
    startTime: number
    isHandle: boolean
  } | null>(null)
  const hasDraggedRef = useRef<boolean>(false)

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
    () => roomSchedules.filter((s) => s.eventType.toLowerCase() === 'class' || !s.eventType),
    [roomSchedules]
  )
  const examSchedules = useMemo(
    () => roomSchedules.filter(isExamSchedule),
    [roomSchedules]
  )

  const hasActiveFilter = categoryKey !== DEFAULT_CATEGORY_KEY
  const hasActiveQueryOrFilter = query.trim() !== '' || hasActiveFilter

  const searchResults = useMemo(
    () => (hasActiveQueryOrFilter ? filterRooms(rooms, query, categoryKey, schedules) : []),
    [rooms, query, categoryKey, schedules, hasActiveQueryOrFilter]
  )

  const matchedSchedules = useMemo(() => {
    const searchTerms = getExpandedSearchTerms(query)
    return schedules.filter((schedule) => scheduleMatchesQuery(schedule, searchTerms))
  }, [query, schedules])

  function handleSelectRoom(roomId: string) {
    setSelectedRoomId(roomId)
    setIsDetailOpen(true)
    setIsSidebarCollapsed(false)
    setIsDropdownOpen(false)
    // On phones the open filter chips cover the map once a room is found; the pinned-room pill replaces them.
    if (!isDesktop) setIsFilterExpanded(false)
    const targetRoom = rooms.find((r) => r.id === roomId)
    if (targetRoom && targetRoom.floor !== currentFloor) {
      setCurrentFloor(targetRoom.floor)
    }
  }

  function handleCloseDetail() {
    setIsDetailOpen(false)
  }

  function handleUnpinRoom() {
    setSelectedRoomId(null)
    setIsDetailOpen(false)
  }

  function handleResetMap() {
    setSelectedRoomId(null)
    setIsDetailOpen(false)
    setQuery('')
    setIsDropdownOpen(false)
  }

  function handleMapBackgroundClick() {
    if (isDropdownOpen) {
      setIsDropdownOpen(false)
    }
    if (!isDesktop) setIsFilterExpanded(false)
    if (isDetailOpen) {
      setIsDetailOpen(false)
    }
  }

  function handleDismissDetailMobile() {
    if (sheetRef.current && window.innerWidth < 640) {
      sheetRef.current.style.animation = 'none'
      sheetRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 240ms ease-out'
      sheetRef.current.style.transform = 'translateY(100%)'
      sheetRef.current.style.opacity = '0'
      setTimeout(() => {
        handleCloseDetail()
        if (sheetRef.current) {
          sheetRef.current.style.transform = ''
          sheetRef.current.style.transition = ''
          sheetRef.current.style.opacity = ''
          sheetRef.current.style.animation = ''
        }
      }, 230)
    } else {
      handleCloseDetail()
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
        handleCloseDetail()
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

  if (error) return <LoadingScreen error={error} onRetry={() => reload()} />
  if (loading || !floorPlansReady) return <LoadingScreen />

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

      {/* Map area below the top bar */}
      <div className="absolute inset-x-0 top-16 bottom-0 overflow-hidden">
        {/* Interactive map workspace, with a 2D fallback */}
        <MapContainer
          rooms={rooms}
          currentFloor={currentFloor}
          onFloorChange={setCurrentFloor}
          selectedRoomId={selectedRoomId}
          isDetailOpen={isDetailOpen}
          sidebarWidth={isSidebarCollapsed ? 0 : 460}
          onSelectRoom={handleSelectRoom}
          onClearSelection={handleMapBackgroundClick}
          viewMode={mapView}
          onViewModeChange={setMapView}
          hideBottomControls={isDesktop}
        />

        {/* =========================================================================
            DESKTOP LEFT SIDEBAR (Docked full-height panel: >= sm)
            ========================================================================= */}
        {isDesktop ? (
          <>
            <aside
              className={`pointer-events-none absolute top-0 bottom-0 left-0 z-2 w-[460px] transition-transform duration-300 ease-in-out ${
                isSidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
              }`}
            >
              <div className="pointer-events-auto relative flex h-full flex-col border-r border-line-soft bg-white">
                {/* Search Controls (Pinned at top of sidebar) */}
                <div className="border-b border-line-soft p-4">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <SearchBar
                        inputRef={inputRef}
                        value={query}
                        onChange={(newQuery) => {
                          setQuery(newQuery)
                          setIsDropdownOpen(true)
                          if (isDetailOpen) setIsDetailOpen(false)
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
                    <button
                      type="button"
                      onClick={handleResetMap}
                      aria-label="รีเซ็ตแผนที่"
                      title="รีเซ็ตแผนที่"
                      className="btn btn-tertiary btn-icon h-11 w-11"
                    >
                      <ArrowCounterClockwise size={16} weight="bold" />
                    </button>
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
                          if (isDetailOpen) setIsDetailOpen(false)
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Content Area: Switches between Search Results and Room Detail */}
                <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
                  {/* STATE 1: ROOM DETAIL VIEW (When room is selected AND detail pane is open) */}
                  {selectedRoom && isDetailOpen ? (
                    <RoomDetailContent
                      room={selectedRoom}
                      onClose={handleCloseDetail}
                      activeScheduleTab={activeScheduleTab}
                      setActiveScheduleTab={setActiveScheduleTab}
                      classSchedules={classSchedules}
                      examSchedules={examSchedules}
                      schedulesLoading={roomSchedulesLoading}
                      schedulesError={roomSchedulesError}
                      reloadSchedules={reloadRoomSchedules}
                    />
                  ) : (
                    <>
                      {/* Pinned Room Summary Banner (When room is pinned but detail view is closed) */}
                      {selectedRoom && (
                        <div className="card border-ink p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                                <MapPin size={18} weight="fill" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="font-bold text-accent uppercase">ปักหมุดอยู่</span>
                                  <span className="text-ink-3">·</span>
                                  <span className="font-medium text-ink-3">ชั้น {selectedRoom.floor}</span>
                                </div>
                                <p className="truncate text-button font-bold text-ink">
                                  {selectedRoom.roomNumber ? `ห้อง ${selectedRoom.roomNumber}` : selectedRoom.nameThai || selectedRoom.code}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (selectedRoom.floor !== currentFloor) {
                                    setCurrentFloor(selectedRoom.floor)
                                  }
                                  setIsDetailOpen(true)
                                }}
                                className="btn btn-secondary btn-sm"
                              >
                                ดูข้อมูล
                              </button>
                              <button
                                type="button"
                                onClick={handleUnpinRoom}
                                aria-label="ยกเลิกการปักหมุด"
                                className="btn btn-ghost btn-icon-sm"
                                title="ยกเลิกปักหมุด"
                              >
                                <X size={14} weight="bold" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* STATE 2: SEARCH RESULTS LIST */}
                      {isDropdownOpen && hasActiveQueryOrFilter ? (
                        <div>
                          <SearchResultList
                            rooms={searchResults}
                            schedules={matchedSchedules}
                            schedulesLoading={schedulesLoading}
                            schedulesError={schedulesError}
                            loading={loading}
                            error={error}
                            onSelectRoom={handleSelectRoom}
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
                    </>
                  )}
                </div>
              </div>
            </aside>

            {/* Desktop floating pill when sidebar is collapsed but a room is pinned */}
            {isSidebarCollapsed && selectedRoom && (
              <div className="pointer-events-auto absolute bottom-6 left-6 z-2 flex items-center gap-2 border border-line-soft bg-white px-3 py-2 text-xs shadow-floating animate-fade-in">
                <div
                  className="flex cursor-pointer items-center gap-2 text-ink transition-opacity hover:opacity-80"
                  onClick={() => {
                    setIsSidebarCollapsed(false)
                    if (selectedRoom.floor !== currentFloor) {
                      setCurrentFloor(selectedRoom.floor)
                    }
                    setIsDetailOpen(true)
                  }}
                  title="ดูรายละเอียดห้อง"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white">
                    <MapPin size={16} weight="fill" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-button leading-tight font-bold text-ink">
                      {selectedRoom.roomNumber ? `ห้อง ${selectedRoom.roomNumber}` : selectedRoom.nameThai || selectedRoom.code}
                    </span>
                    <span className="text-xs font-medium text-ink-3">คลิกเพื่อดูข้อมูล</span>
                  </div>
                </div>
                <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line-soft" />
                <button
                  type="button"
                  onClick={handleUnpinRoom}
                  aria-label="ยกเลิกการปักหมุด"
                  className="btn btn-ghost btn-icon-sm"
                  title="ยกเลิกปักหมุด"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* =========================================================================
                MOBILE FLOATING SEARCH PANEL (Mobile only: < sm), just below the top bar
                ========================================================================= */}
            <div className="pointer-events-none absolute inset-x-3 top-3 z-101 sm:hidden">
              <div className="pointer-events-auto relative z-2 flex flex-col">
                <div className="flex w-full items-center gap-2">
                  <div className="min-w-0 flex-1 shadow-floating">
                    <SearchBar
                      inputRef={inputRef}
                      value={query}
                      onChange={(newQuery) => {
                        setQuery(newQuery)
                        setIsDropdownOpen(true)
                        if (isDetailOpen) setIsDetailOpen(false)
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
                  <button
                    type="button"
                    onClick={handleResetMap}
                    aria-label="รีเซ็ตแผนที่"
                    title="รีเซ็ตแผนที่"
                    className="btn btn-tertiary btn-icon h-11 w-11 shadow-floating"
                  >
                    <ArrowCounterClockwise size={16} weight="bold" />
                  </button>
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
                          if (isDetailOpen) setIsDetailOpen(false)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile Pinned Room Floating Pill (Directly under search bar / filter pane at top left) */}
              {selectedRoom && !isDetailOpen && (
                <div className="pointer-events-none mt-2 flex justify-start">
                  <div className="pointer-events-auto flex max-w-[calc(100vw-2.5rem)] items-center gap-2 border border-line-soft bg-white px-3 py-1.5 text-xs shadow-floating animate-fade-in">
                    <div
                      className="flex min-w-0 cursor-pointer items-center gap-2 text-ink transition-opacity active:opacity-80"
                      onClick={() => {
                        if (selectedRoom.floor !== currentFloor) {
                          setCurrentFloor(selectedRoom.floor)
                        }
                        setIsDetailOpen(true)
                      }}
                      title="ดูรายละเอียดห้อง"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                        <MapPin size={15} weight="fill" />
                      </div>
                      <div className="flex min-w-0 flex-col text-left">
                        <span className="max-w-[140px] truncate text-button leading-tight font-bold text-ink">
                          {selectedRoom.roomNumber ? `ห้อง ${selectedRoom.roomNumber}` : selectedRoom.nameThai || selectedRoom.code}
                        </span>
                        <span className="text-xs font-medium text-ink-3">แตะเพื่อดูข้อมูล</span>
                      </div>
                    </div>
                    <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-line-soft" />
                    <button
                      type="button"
                      onClick={handleUnpinRoom}
                      aria-label="ยกเลิกการปักหมุด"
                      className="btn btn-ghost btn-icon-sm"
                      title="ยกเลิกปักหมุด"
                    >
                      <X size={13} weight="bold" />
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile Search Results Floating Dropdown Sheet.
                  The wrapper above is pointer-events-none so the map stays usable around the
                  search bar. Both layers here must opt back in with pointer-events-auto:
                  otherwise a tap on a result falls through to the map underneath and selects
                  whichever room pin happens to sit under the finger (issue #91). */}
              {isDropdownOpen && hasActiveQueryOrFilter && (!isDetailOpen || !selectedRoom) && (
                <>
                  <div
                    data-testid="mobile-search-backdrop"
                    className="pointer-events-auto fixed inset-0 z-1 bg-black/25"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div
                    data-testid="mobile-search-results"
                    className="card no-scrollbar pointer-events-auto relative z-2 mt-2 max-h-[65dvh] overflow-y-auto p-3 shadow-modal animate-fade-in"
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-line-soft pb-2">
                      <span className="text-xs font-bold text-ink-2">
                        ผลการค้นหา ({searchResults.length})
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
                      schedules={matchedSchedules}
                      schedulesLoading={schedulesLoading}
                      schedulesError={schedulesError}
                      loading={loading}
                      error={error}
                      onSelectRoom={handleSelectRoom}
                    />
                  </div>
                </>
              )}
            </div>

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
                    activeScheduleTab={activeScheduleTab}
                    setActiveScheduleTab={setActiveScheduleTab}
                    classSchedules={classSchedules}
                    examSchedules={examSchedules}
                    schedulesLoading={roomSchedulesLoading}
                    schedulesError={roomSchedulesError}
                    reloadSchedules={reloadRoomSchedules}
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
