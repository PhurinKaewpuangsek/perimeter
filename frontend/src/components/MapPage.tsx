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
import { useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CaretLeft,
  X,
  MapPin,
  Calendar,
  Clock,
  BookOpen,
  GraduationCap,
  Sparkle,
  Users,
} from '@phosphor-icons/react'
import { useRooms } from '../hooks/useRooms'
import { useSchedules } from '../hooks/useSchedules'
import { usePreloadImages } from '../hooks/usePreloadImages'
import MapContainer from './map/MapContainer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import LoadingScreen from './LoadingScreen'
import SearchBar from './SearchBar'
import CategoryFilter from './CategoryFilter'
import SearchResultList from './SearchResultList'
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
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'
import type { ScheduleSlot } from '../types/schedule'

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((config) => config.asset)

interface DayConfig {
  order: number
  th: string
  shortTh: string
  color: string
  dotColor: string
  bgLight: string
}

const DAY_CONFIG: Record<string, DayConfig> = {
  MON: { order: 1, th: 'วันจันทร์', shortTh: 'จันทร์', color: 'text-amber-800', dotColor: 'bg-amber-500', bgLight: 'bg-amber-50 border-amber-200' },
  MONDAY: { order: 1, th: 'วันจันทร์', shortTh: 'จันทร์', color: 'text-amber-800', dotColor: 'bg-amber-500', bgLight: 'bg-amber-50 border-amber-200' },
  TUE: { order: 2, th: 'วันอังคาร', shortTh: 'อังคาร', color: 'text-pink-800', dotColor: 'bg-pink-500', bgLight: 'bg-pink-50 border-pink-200' },
  TUESDAY: { order: 2, th: 'วันอังคาร', shortTh: 'อังคาร', color: 'text-pink-800', dotColor: 'bg-pink-500', bgLight: 'bg-pink-50 border-pink-200' },
  WED: { order: 3, th: 'วันพุธ', shortTh: 'พุธ', color: 'text-emerald-800', dotColor: 'bg-emerald-500', bgLight: 'bg-emerald-50 border-emerald-200' },
  WEDNESDAY: { order: 3, th: 'วันพุธ', shortTh: 'พุธ', color: 'text-emerald-800', dotColor: 'bg-emerald-500', bgLight: 'bg-emerald-50 border-emerald-200' },
  THU: { order: 4, th: 'วันพฤหัสบดี', shortTh: 'พฤหัสฯ', color: 'text-orange-800', dotColor: 'bg-orange-500', bgLight: 'bg-orange-50 border-orange-200' },
  THURSDAY: { order: 4, th: 'วันพฤหัสบดี', shortTh: 'พฤหัสฯ', color: 'text-orange-800', dotColor: 'bg-orange-500', bgLight: 'bg-orange-50 border-orange-200' },
  FRI: { order: 5, th: 'วันศุกร์', shortTh: 'ศุกร์', color: 'text-sky-800', dotColor: 'bg-sky-500', bgLight: 'bg-sky-50 border-sky-200' },
  FRIDAY: { order: 5, th: 'วันศุกร์', shortTh: 'ศุกร์', color: 'text-sky-800', dotColor: 'bg-sky-500', bgLight: 'bg-sky-50 border-sky-200' },
  SAT: { order: 6, th: 'วันเสาร์', shortTh: 'เสาร์', color: 'text-purple-800', dotColor: 'bg-purple-500', bgLight: 'bg-purple-50 border-purple-200' },
  SATURDAY: { order: 6, th: 'วันเสาร์', shortTh: 'เสาร์', color: 'text-purple-800', dotColor: 'bg-purple-500', bgLight: 'bg-purple-50 border-purple-200' },
  SUN: { order: 7, th: 'วันอาทิตย์', shortTh: 'อาทิตย์', color: 'text-rose-800', dotColor: 'bg-rose-500', bgLight: 'bg-rose-50 border-rose-200' },
  SUNDAY: { order: 7, th: 'วันอาทิตย์', shortTh: 'อาทิตย์', color: 'text-rose-800', dotColor: 'bg-rose-500', bgLight: 'bg-rose-50 border-rose-200' },
}

function getDayInfo(rawDay: string): DayConfig {
  const upper = (rawDay || '').toUpperCase().trim()
  return (
    DAY_CONFIG[upper] ?? {
      order: 99,
      th: rawDay || 'ไม่ระบุวัน',
      shortTh: rawDay || 'ไม่ระบุ',
      color: 'text-slate-800',
      dotColor: 'bg-slate-400',
      bgLight: 'bg-slate-50 border-slate-200',
    }
  )
}

export default function MapPage() {
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const initialRoomId = searchParams.get('room') ?? null

  const { rooms, loading, error, reload } = useRooms()
  const { schedules, loading: schedulesLoading, error: schedulesError } = useSchedules()
  const floorPlansReady = usePreloadImages(FLOOR_PLAN_ASSETS)

  const targetInitialRoom = initialRoomId ? rooms.find((rm) => rm.id === initialRoomId) : null
  const [currentFloor, setCurrentFloor] = useState(targetInitialRoom?.floor ?? 1)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId)
  const [query, setQuery] = useState(initialQuery)
  const [categoryKey, setCategoryKey] = useState(DEFAULT_CATEGORY_KEY)
  const [isDropdownOpen, setIsDropdownOpen] = useState(Boolean(initialQuery))
  const [isFilterExpanded, setIsFilterExpanded] = useState(false)
  const [activeScheduleTab, setActiveScheduleTab] = useState<'class' | 'exam'>('class')
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('ALL')

  const inputRef = useRef<HTMLInputElement>(null)

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId),
    [rooms, selectedRoomId]
  )

  // Schedules matching the selected room
  const roomSchedules = useMemo(() => {
    if (!selectedRoom?.code) return []
    return schedules.filter((s) => s.roomCode.toLowerCase() === selectedRoom.code.toLowerCase())
  }, [schedules, selectedRoom])

  // Split schedules into class and exam
  const classSchedules = useMemo(
    () => roomSchedules.filter((s) => s.eventType.toLowerCase() === 'class' || !s.eventType),
    [roomSchedules]
  )
  const examSchedules = useMemo(
    () => roomSchedules.filter((s) => s.eventType.toLowerCase() === 'exam'),
    [roomSchedules]
  )

  const activeSchedules = activeScheduleTab === 'class' ? classSchedules : examSchedules

  // Group active schedules by dayOfWeek (sorted chronologically Mon -> Sun)
  const groupedSchedules = useMemo(() => {
    const groups: Record<string, ScheduleSlot[]> = {}
    for (const slot of activeSchedules) {
      const day = (slot.dayOfWeek || 'MON').toUpperCase().trim()
      if (!groups[day]) groups[day] = []
      groups[day].push(slot)
    }
    for (const day in groups) {
      groups[day].sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return Object.entries(groups).sort(
      ([dayA], [dayB]) => getDayInfo(dayA).order - getDayInfo(dayB).order
    )
  }, [activeSchedules])

  // Filter grouped schedules by selected day pill
  const displayedGroupedSchedules = useMemo(() => {
    if (selectedDayFilter === 'ALL') return groupedSchedules
    return groupedSchedules.filter(([dayKey]) => dayKey === selectedDayFilter)
  }, [groupedSchedules, selectedDayFilter])

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
    setIsDropdownOpen(false)
    setSelectedDayFilter('ALL')
    const targetRoom = rooms.find((r) => r.id === roomId)
    if (targetRoom && targetRoom.floor !== currentFloor) {
      setCurrentFloor(targetRoom.floor)
    }
  }

  function handleBackToSearch() {
    setSelectedRoomId(null)
    setSelectedDayFilter('ALL')
  }

  function handleClearSelection() {
    setSelectedRoomId(null)
    setSelectedDayFilter('ALL')
  }

  if (error) return <LoadingScreen error={error} onRetry={() => reload()} />
  if (loading || !floorPlansReady) return <LoadingScreen />

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-slate-100 font-sans select-none">
      {/* Primary SVG Floor Plan Workspace */}
      <MapContainer
        rooms={rooms}
        currentFloor={currentFloor}
        onFloorChange={setCurrentFloor}
        selectedRoomId={selectedRoomId}
        onSelectRoom={handleSelectRoom}
        onClearSelection={handleClearSelection}
      />

      {/* =========================================================================
          UNIFIED LEFT SIDEBAR (Full Docked Panel on Desktop, Full Overlay on Mobile)
          ========================================================================= */}
      <aside className="pointer-events-none absolute top-0 left-0 bottom-0 z-30 w-full sm:w-[400px]">
        <div className="pointer-events-auto flex flex-col h-full bg-white/95 shadow-2xl backdrop-blur-xl border-r border-slate-200/80">
          {/* Header Bar with Prominently Enlarged Logo */}
          <div className="flex shrink-0 items-center justify-between px-4 py-3 sm:py-3.5 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-3">
              <img
                src={perimeterLogoNoBg}
                alt="Perimeter"
                className="h-12 sm:h-14 w-auto object-contain cursor-pointer hover:opacity-90 transition-opacity drop-shadow-xs"
                onClick={() => {
                  handleClearSelection()
                  setQuery('')
                }}
                title="คลิกเพื่อรีเซ็ตแผนที่"
              />
              <span className="text-xs font-medium text-slate-400 border-l border-slate-200 pl-3">
                แผนที่อาคาร
              </span>
            </div>

            {selectedRoomId && (
              <button
                type="button"
                onClick={handleBackToSearch}
                className="flex items-center gap-1 rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer active:scale-95 shrink-0"
              >
                <CaretLeft size={14} weight="bold" />
                <span>กลับ</span>
              </button>
            )}
          </div>

          {/* Search Controls (Pinned at top of sidebar) */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <SearchBar
              inputRef={inputRef}
              value={query}
              onChange={(newQuery) => {
                setQuery(newQuery)
                setIsDropdownOpen(true)
                setSelectedRoomId(null)
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

            {/* Category Filter Pills Collapsible */}
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
                isFilterExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <CategoryFilter
                  value={categoryKey}
                  onChange={(newCategory) => {
                    setCategoryKey(newCategory)
                    setIsDropdownOpen(true)
                    setSelectedRoomId(null)
                  }}
                />
              </div>
            </div>
          </div>

          {/* Content Area: Switches between Search Results and Room Detail */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* STATE 1: ROOM DETAIL VIEW (When room is selected) */}
            {selectedRoom ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* =========================================================================
                    ELEVATED ROOM HERO CARD (Prominent Room Number & Compact Meta)
                    ========================================================================= */}
                <div className="rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/70 to-white p-4 shadow-xs">
                  {/* Top Meta Bar: Building/Floor Pill + Close Button */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100/80">
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600 uppercase tracking-wide">
                      {getBuildingLabel(selectedRoom.building)} · ชั้น {selectedRoom.floor}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      aria-label="ปิดรายละเอียดห้อง"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                    >
                      <X size={15} weight="bold" />
                    </button>
                  </div>

                  {/* Main Room Identity */}
                  <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-xl font-extrabold text-slate-900 leading-tight">
                        ห้อง {selectedRoom.roomNumber || selectedRoom.code || '-'}
                      </h2>
                      {selectedRoom.code &&
                        selectedRoom.roomNumber &&
                        selectedRoom.code !== selectedRoom.roomNumber && (
                          <span className="text-xs font-semibold text-slate-400">
                            ({selectedRoom.code})
                          </span>
                        )}
                    </div>

                    {selectedRoom.nameThai && (
                      <p className="mt-0.5 text-sm font-semibold text-slate-700 leading-snug">
                        {selectedRoom.nameThai}
                      </p>
                    )}
                  </div>

                  {/* Quick Meta Chips: Category + Capacity */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/* Category Badge */}
                    {(() => {
                      const color = getCategoryColor(selectedRoom.category)
                      const Icon = getCategoryIcon(selectedRoom.category, selectedRoom.nameThai)
                      return (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border ${color.border} ${color.bg} px-2.5 py-1 text-xs font-semibold ${color.text} shadow-2xs`}
                        >
                          <Icon size={14} weight="duotone" />
                          <span>{getCategoryLabel(selectedRoom.category)}</span>
                        </span>
                      )
                    })()}

                    {/* Capacity Chip */}
                    {selectedRoom.capacity !== undefined && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-2xs">
                        <Users size={14} weight="bold" className="text-slate-400" />
                        <span>ความจุ {selectedRoom.capacity} คน</span>
                      </span>
                    )}
                  </div>

                  {/* Compact Landmark Strip */}
                  {selectedRoom.landmarks && selectedRoom.landmarks.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2">
                      <MapPin size={15} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />
                      <div className="text-xs text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-700">จุดสังเกต: </span>
                        {selectedRoom.landmarks.map((l) => getLandmarkText(l)).join(' · ')}
                      </div>
                    </div>
                  )}
                </div>

                {/* =========================================================================
                    SCHEDULE SECTION (Chronological Day Grouping & Quick Day Filter)
                    ========================================================================= */}
                <div className="border-t border-slate-100 pt-3">
                  {/* Schedule Tabs Header */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Calendar size={14} weight="bold" />
                      <span>ตารางการใช้ห้อง</span>
                    </h3>

                    {/* Tab Switcher Pills: [ตารางเรียน] / [ตารางสอบ] */}
                    <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveScheduleTab('class')
                          setSelectedDayFilter('ALL')
                        }}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                          activeScheduleTab === 'class'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <BookOpen size={13} weight="bold" />
                        <span>ตารางเรียน</span>
                        <span className="text-[10px] opacity-70">({classSchedules.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveScheduleTab('exam')
                          setSelectedDayFilter('ALL')
                        }}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                          activeScheduleTab === 'exam'
                            ? 'bg-white text-rose-600 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <GraduationCap size={13} weight="bold" />
                        <span>ตารางสอบ</span>
                        <span className="text-[10px] opacity-70">({examSchedules.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Day Filter Pills: Only shown if classes exist on multiple days */}
                  {groupedSchedules.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3">
                      <button
                        type="button"
                        onClick={() => setSelectedDayFilter('ALL')}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                          selectedDayFilter === 'ALL'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        ทั้งหมด ({activeSchedules.length})
                      </button>
                      {groupedSchedules.map(([dayKey, slots]) => {
                        const dayInfo = getDayInfo(dayKey)
                        const isSelected = selectedDayFilter === dayKey
                        return (
                          <button
                            key={dayKey}
                            type="button"
                            onClick={() => setSelectedDayFilter(isSelected ? 'ALL' : dayKey)}
                            className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isSelected ? 'bg-white' : dayInfo.dotColor
                              }`}
                            />
                            <span>{dayInfo.shortTh}</span>
                            <span className="opacity-70 text-[10px]">({slots.length})</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Schedule Slots Grouped by Day (Chronological Order) */}
                  {displayedGroupedSchedules.length > 0 ? (
                    <div className="space-y-4">
                      {displayedGroupedSchedules.map(([dayKey, slots]) => {
                        const dayInfo = getDayInfo(dayKey)
                        return (
                          <div key={dayKey} className="space-y-2">
                            {/* Day Header Badge */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${dayInfo.dotColor}`} />
                                <h4 className="text-xs font-bold text-slate-800 tracking-wide">
                                  {dayInfo.th}
                                </h4>
                              </div>
                              <span className="text-[11px] font-medium text-slate-400">
                                {slots.length} คาบ
                              </span>
                            </div>

                            {/* Class Cards */}
                            <div className="space-y-1.5">
                              {slots.map((slot, i) => {
                                const isCodeNameDuplicate =
                                  slot.eventName &&
                                  slot.eventName.replace(/\s+/g, '').toLowerCase() ===
                                    slot.eventCode.replace(/\s+/g, '').toLowerCase()

                                return (
                                  <div
                                    key={i}
                                    className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-2xs hover:border-slate-200 hover:shadow-xs transition-all"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold font-mono tracking-tight text-slate-900">
                                        {slot.eventCode || '-'}
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-100/80 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                        <Clock size={12} weight="bold" className="text-slate-400" />
                                        {slot.startTime} - {slot.endTime}
                                      </span>
                                    </div>
                                    {slot.eventName && !isCodeNameDuplicate && (
                                      <p className="mt-1 text-xs text-slate-600 line-clamp-1 font-medium">
                                        {slot.eventName}
                                      </p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                      {activeScheduleTab === 'class'
                        ? 'ไม่มีข้อมูลตารางเรียนในห้องนี้'
                        : 'ไม่มีข้อมูลตารางสอบในห้องนี้'}
                    </div>
                  )}
                </div>
              </div>
            ) : isDropdownOpen && hasActiveQueryOrFilter ? (
              /* STATE 2: SEARCH RESULTS LIST */
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
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 mb-3">
                  <Sparkle size={24} weight="duotone" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">สำรวจอาคารเรียนรวม 3 (LC3)</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-xs">
                  คลิกที่ห้องบนผัง หรือค้นหาห้องเรียนด้านบนเพื่อดูข้อมูล จุดสังเกต และตารางเวลา
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </main>
  )
}
