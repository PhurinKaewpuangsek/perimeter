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
import type { Room } from '../types/room'
import type { ScheduleSlot } from '../types/schedule'

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((config) => config.asset)

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    return window.matchMedia('(min-width: 640px)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(min-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    if (mql.addEventListener) {
      mql.addEventListener('change', handler)
    } else {
      mql.addListener(handler)
    }
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handler)
      } else {
        mql.removeListener(handler)
      }
    }
  }, [])

  return isDesktop
}

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

function RoomCategoryBadge({ category, nameThai }: { category: string; nameThai?: string }) {
  const color = getCategoryColor(category)
  const Icon = getCategoryIcon(category, nameThai)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${color.border} ${color.bg} px-2.5 py-1 text-xs font-semibold ${color.text} shadow-2xs`}
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
  selectedDayFilter: string
  setSelectedDayFilter: (day: string) => void
  classSchedules: ScheduleSlot[]
  examSchedules: ScheduleSlot[]
  groupedSchedules: [string, ScheduleSlot[]][]
  displayedGroupedSchedules: [string, ScheduleSlot[]][]
  activeSchedules: ScheduleSlot[]
}

function RoomDetailContent({
  room,
  onClose,
  activeScheduleTab,
  setActiveScheduleTab,
  selectedDayFilter,
  setSelectedDayFilter,
  classSchedules,
  examSchedules,
  groupedSchedules,
  displayedGroupedSchedules,
  activeSchedules,
}: RoomDetailContentProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ELEVATED ROOM HERO CARD (Prominent Room Number & Compact Meta) */}
      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/70 to-white p-4 shadow-sm">
        {/* Header Row: Subtle Context Breadcrumb + Close Button */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {/* Subtle Location Breadcrumb (Calm neutral tones, zero visual fight with room title) */}
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 border border-slate-200/60 px-2 py-0.5 text-[11px] font-medium text-slate-500 mb-1.5">
              <span>{getBuildingLabel(room.building)}</span>
              <span className="text-slate-300">·</span>
              <span>ชั้น {room.floor}</span>
            </div>

            {/* Main Room Identity */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                {room.roomNumber ? (
                  <>
                    <span className="text-base font-medium text-slate-400 mr-1.5">ห้อง</span>
                    <span>{room.roomNumber}</span>
                  </>
                ) : (
                  <span>{room.nameThai || room.code || '-'}</span>
                )}
              </h2>
              {room.code &&
                room.roomNumber &&
                room.code !== room.roomNumber && (
                  <span className="text-xs font-medium text-slate-400">
                    ({room.code})
                  </span>
                )}
            </div>

            {room.nameThai &&
              room.roomNumber &&
              room.nameThai !== room.roomNumber && (
                <p className="mt-1 text-sm font-medium text-slate-600 leading-relaxed">
                  {room.nameThai}
                </p>
              )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดรายละเอียดห้อง"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer -mt-0.5 -mr-0.5"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        {/* Quick Meta Chips: Category + Capacity */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RoomCategoryBadge category={room.category} nameThai={room.nameThai} />

          {room.capacity !== undefined && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-2xs">
              <Users size={14} weight="bold" className="text-slate-400" />
              <span>ความจุ {room.capacity} คน</span>
            </span>
          )}
        </div>

        {/* Compact Landmark Strip */}
        {room.landmarks && room.landmarks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-start gap-2">
            <MapPin size={15} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-700">จุดสังเกต: </span>
              {room.landmarks.map((l) => getLandmarkText(l)).join(' · ')}
            </div>
          </div>
        )}
      </div>

      {/* SCHEDULE SECTION (Chronological Day Grouping & Quick Day Filter) */}
      <div className="border-t border-slate-200/80 pt-3.5">
        {/* Schedule Tabs Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Calendar size={14} weight="bold" />
            <span>ตารางการใช้ห้อง</span>
          </h3>

          <div className="flex rounded-xl bg-slate-100 border border-slate-200/80 p-0.5 text-xs font-semibold">
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

        {/* Quick Day Filter Pills */}
        {groupedSchedules.length > 1 && (
          <div
            className="flex items-center gap-1.5 overflow-x-auto thin-scrollbar pb-2 mb-3"
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY
              }
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedDayFilter('ALL')}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                selectedDayFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100/90 border border-slate-200/80 text-slate-600 hover:bg-slate-200/70'
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
                      : 'bg-slate-100/90 border border-slate-200/80 text-slate-600 hover:bg-slate-200/70'
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

        {/* Schedule Slots Grouped by Day */}
        {displayedGroupedSchedules.length > 0 ? (
          <div className="space-y-4">
            {displayedGroupedSchedules.map(([dayKey, slots]) => {
              const dayInfo = getDayInfo(dayKey)
              return (
                <div key={dayKey} className="space-y-2">
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

                  <div className="space-y-1.5">
                    {slots.map((slot, i) => {
                      const isCodeNameDuplicate =
                        slot.eventName &&
                        slot.eventName.replace(/\s+/g, '').toLowerCase() ===
                          slot.eventCode.replace(/\s+/g, '').toLowerCase()

                      return (
                        <div
                          key={i}
                          className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold font-mono tracking-tight text-slate-900">
                              {slot.eventCode || '-'}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
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
  const [currentFloor, setCurrentFloor] = useState(targetInitialRoom?.floor ?? 1)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId)
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(Boolean(initialRoomId))
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false)
  const [query, setQuery] = useState(initialQuery)
  const [categoryKey, setCategoryKey] = useState(DEFAULT_CATEGORY_KEY)
  const [isDropdownOpen, setIsDropdownOpen] = useState(Boolean(initialQuery))
  const [isFilterExpanded, setIsFilterExpanded] = useState(false)
  const [activeScheduleTab, setActiveScheduleTab] = useState<'class' | 'exam'>('class')
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('ALL')

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
    setIsDetailOpen(true)
    setIsSidebarCollapsed(false)
    setIsDropdownOpen(false)
    setSelectedDayFilter('ALL')
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
    setSelectedDayFilter('ALL')
  }

  function handleResetMap() {
    setSelectedRoomId(null)
    setIsDetailOpen(false)
    setSelectedDayFilter('ALL')
    setQuery('')
    setIsDropdownOpen(false)
  }

  function handleMapBackgroundClick() {
    if (isDropdownOpen) {
      setIsDropdownOpen(false)
    }
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
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-slate-100 font-sans select-none">
      {/* Primary SVG Floor Plan Workspace */}
      <MapContainer
        rooms={rooms}
        currentFloor={currentFloor}
        onFloorChange={setCurrentFloor}
        selectedRoomId={selectedRoomId}
        isDetailOpen={isDetailOpen}
        onSelectRoom={handleSelectRoom}
        onClearSelection={handleMapBackgroundClick}
      />

      {/* =========================================================================
          DESKTOP LEFT SIDEBAR (Docked Panel on Desktop: >= sm)
          ========================================================================= */}
      {isDesktop ? (
        <>
          <aside
            className={`pointer-events-none absolute top-0 left-0 bottom-0 z-30 w-[400px] transition-transform duration-300 ease-in-out ${
              isSidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
            }`}
          >
            <div className="relative pointer-events-auto flex flex-col h-full bg-white shadow-2xl border-r border-slate-200">
              {/* Collapse / Expand Toggle Tab on right border of sidebar */}
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                aria-label={isSidebarCollapsed ? 'ขยายแถบเมนู' : 'ซ่อนแถบเมนู'}
                title={isSidebarCollapsed ? 'ขยายแถบเมนู' : 'ซ่อนแถบเมนู'}
                className="absolute top-3.5 -right-8 z-30 flex h-8 w-8 items-center justify-center rounded-r-xl bg-white border-y border-r border-slate-200 text-slate-500 shadow-md hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all cursor-pointer"
              >
                <CaretLeft
                  size={16}
                  weight="bold"
                  className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Header Bar with Prominently Enlarged Logo */}
              <div className="flex shrink-0 items-center px-4 py-3 sm:py-3.5 border-b border-slate-200/80 bg-white">
                <div className="flex items-center gap-3">
                  <img
                    src={perimeterLogoNoBg}
                    alt="Perimeter"
                    className="h-12 sm:h-14 w-auto object-contain cursor-pointer hover:opacity-90 transition-opacity drop-shadow-xs"
                    onClick={handleResetMap}
                    title="คลิกเพื่อรีเซ็ตแผนที่"
                  />
                </div>
              </div>

              {/* Search Controls (Pinned at top of sidebar) */}
              <div className="p-3 border-b border-slate-200/80 bg-slate-50/50">
                <SearchBar
                  inputRef={inputRef}
                  value={query}
                  onChange={(newQuery) => {
                    setQuery(newQuery)
                    setIsDropdownOpen(true)
                    if (isDetailOpen) setIsDetailOpen(false)
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
                        if (isDetailOpen) setIsDetailOpen(false)
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Content Area: Switches between Search Results and Room Detail */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
                {/* STATE 1: ROOM DETAIL VIEW (When room is selected AND detail pane is open) */}
                {selectedRoom && isDetailOpen ? (
                  <RoomDetailContent
                    room={selectedRoom}
                    onClose={handleCloseDetail}
                    activeScheduleTab={activeScheduleTab}
                    setActiveScheduleTab={setActiveScheduleTab}
                    selectedDayFilter={selectedDayFilter}
                    setSelectedDayFilter={setSelectedDayFilter}
                    classSchedules={classSchedules}
                    examSchedules={examSchedules}
                    groupedSchedules={groupedSchedules}
                    displayedGroupedSchedules={displayedGroupedSchedules}
                    activeSchedules={activeSchedules}
                  />
                ) : (
                  <>
                    {/* Pinned Room Summary Banner (When room is pinned but detail view is closed) */}
                    {selectedRoom && (
                      <div className="rounded-2xl border border-rose-200/90 bg-rose-50/70 p-3 shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-xs">
                              <MapPin size={18} weight="fill" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="font-bold text-rose-600 uppercase tracking-wide">ปักหมุดอยู่</span>
                                <span className="text-slate-300">·</span>
                                <span className="font-medium text-slate-500">ชั้น {selectedRoom.floor}</span>
                              </div>
                              <p className="truncate text-sm font-bold text-slate-800">
                                {selectedRoom.roomNumber ? `ห้อง ${selectedRoom.roomNumber}` : selectedRoom.nameThai || selectedRoom.code}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedRoom.floor !== currentFloor) {
                                setCurrentFloor(selectedRoom.floor)
                              }
                              setIsDetailOpen(true)
                            }}
                            className="rounded-xl bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-2xs border border-rose-200 hover:bg-rose-50 active:scale-95 transition-all cursor-pointer"
                          >
                            ดูข้อมูล
                          </button>
                          <button
                            type="button"
                            onClick={handleUnpinRoom}
                            aria-label="ยกเลิกการปักหมุด"
                            className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-rose-100/60 active:scale-95 transition-all cursor-pointer"
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
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 mb-3">
                        <Sparkle size={24} weight="duotone" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">สำรวจอาคารเรียนรวม 3 (LC3)</h3>
                      <p className="mt-1 text-xs text-slate-500 max-w-xs">
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
          <div className="fixed bottom-6 left-12 z-20 flex items-center gap-2 rounded-2xl bg-white/95 backdrop-blur-md px-3 py-2 shadow-xl border border-slate-200 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto">
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 active:scale-95 transition-all text-slate-800"
              onClick={() => {
                setIsSidebarCollapsed(false)
                if (selectedRoom.floor !== currentFloor) {
                  setCurrentFloor(selectedRoom.floor)
                }
                setIsDetailOpen(true)
              }}
              title="ดูรายละเอียดห้อง"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-50 text-rose-600 shadow-2xs">
                <MapPin size={16} weight="fill" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-slate-900 leading-tight">
                  {selectedRoom.roomNumber ? `ห้อง ${selectedRoom.roomNumber}` : selectedRoom.nameThai || selectedRoom.code}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">คลิกเพื่อดูข้อมูล</span>
              </div>
            </div>
            <div className="h-5 w-px bg-slate-200 mx-0.5" />
            <button
              type="button"
              onClick={handleUnpinRoom}
              aria-label="ยกเลิกการปักหมุด"
              className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-90 transition-all cursor-pointer"
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
              MOBILE FLOATING HEADER & SEARCH BAR (Mobile only: < sm)
              ========================================================================= */}
          <div className="fixed top-2.5 inset-x-2.5 z-30 pointer-events-none">
            <div className="flex flex-col rounded-2xl bg-white shadow-xl border border-slate-200 p-2 pointer-events-auto">
              <div className="flex items-center gap-2">
                <img
                  src={perimeterLogoNoBg}
                  alt="Perimeter"
                  className="h-8.5 w-auto object-contain cursor-pointer hover:opacity-90 transition-opacity drop-shadow-xs shrink-0 pl-1"
                  onClick={handleResetMap}
                  title="คลิกเพื่อรีเซ็ตแผนที่"
                />
                <div className="flex-1 min-w-0">
                  <SearchBar
                    inputRef={inputRef}
                    value={query}
                    onChange={(newQuery) => {
                      setQuery(newQuery)
                      setIsDropdownOpen(true)
                      if (isDetailOpen) setIsDetailOpen(false)
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
              </div>

              {/* Collapsible Category Filter on Mobile */}
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
                      if (isDetailOpen) setIsDetailOpen(false)
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Mobile Pinned Room Floating Pill (Directly under search bar / filter pane at top left) */}
            {selectedRoom && !isDetailOpen && (
              <div className="flex justify-start mt-2 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-white/95 backdrop-blur-md px-3 py-1.5 shadow-xl border border-slate-200/90 text-xs animate-in fade-in slide-in-from-top-2 duration-200 max-w-[calc(100vw-2.5rem)]">
                  <div
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 active:scale-95 transition-all text-slate-800 min-w-0"
                    onClick={() => {
                      if (selectedRoom.floor !== currentFloor) {
                        setCurrentFloor(selectedRoom.floor)
                      }
                      setIsDetailOpen(true)
                    }}
                    title="ดูรายละเอียดห้อง"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 shadow-2xs">
                      <MapPin size={15} weight="fill" />
                    </div>
                    <div className="flex flex-col text-left min-w-0">
                      <span className="font-bold text-slate-900 leading-tight truncate max-w-[140px]">
                        {selectedRoom.roomNumber ? `ห้อง ${selectedRoom.roomNumber}` : selectedRoom.nameThai || selectedRoom.code}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">แตะเพื่อดูข้อมูล</span>
                    </div>
                  </div>
                  <div className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" />
                  <button
                    type="button"
                    onClick={handleUnpinRoom}
                    aria-label="ยกเลิกการปักหมุด"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-90 transition-all cursor-pointer"
                    title="ยกเลิกปักหมุด"
                  >
                    <X size={13} weight="bold" />
                  </button>
                </div>
              </div>
            )}

            {/* Mobile Search Results Floating Dropdown Sheet */}
            {isDropdownOpen && hasActiveQueryOrFilter && (!isDetailOpen || !selectedRoom) && (
              <>
                <div
                  className="fixed inset-0 bg-slate-900/25 z-30"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="relative z-40 mt-2 max-h-[65dvh] overflow-y-auto no-scrollbar rounded-2xl bg-white shadow-2xl border border-slate-200/90 p-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500">
                      ผลการค้นหา ({searchResults.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(false)}
                      className="text-xs font-semibold text-slate-400 hover:text-slate-700 cursor-pointer"
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
              className="fixed inset-x-0 bottom-0 z-40 max-h-[55dvh] flex flex-col rounded-t-3xl bg-white shadow-2xl border-t border-slate-200 animate-modal-mobile pointer-events-auto will-change-transform sm:hidden"
            >
              {/* Grab Handle Header Bar (Touch drag zone & tap to dismiss) */}
              <div
                data-sheet-handle="true"
                className="w-full pt-3 pb-2.5 cursor-grab active:cursor-grabbing flex items-center justify-center shrink-0 touch-none select-none"
                onClick={() => {
                  if (hasDraggedRef.current) return
                  handleDismissDetailMobile()
                }}
                title="เลื่อนลงเพื่อปิด"
              >
                <div className="h-1.5 w-12 rounded-full bg-slate-300 active:bg-slate-500 transition-colors" />
              </div>

              {/* Scrollable Room Detail Content */}
              <div
                ref={sheetContentRef}
                className="overflow-y-auto no-scrollbar px-4 pb-6 pt-1 flex-1 overscroll-contain"
              >
                <RoomDetailContent
                  room={selectedRoom}
                  onClose={handleDismissDetailMobile}
                  activeScheduleTab={activeScheduleTab}
                  setActiveScheduleTab={setActiveScheduleTab}
                  selectedDayFilter={selectedDayFilter}
                  setSelectedDayFilter={setSelectedDayFilter}
                  classSchedules={classSchedules}
                  examSchedules={examSchedules}
                  groupedSchedules={groupedSchedules}
                  displayedGroupedSchedules={displayedGroupedSchedules}
                  activeSchedules={activeSchedules}
                />
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
