import { useState, useMemo, useRef, useId } from 'react'
import { useRooms } from '../hooks/useRooms'
import { useSchedules } from '../hooks/useSchedules'
import { usePreloadImages } from '../hooks/usePreloadImages'
import { getSession, isAdmin } from '../services/authService'
import {
  updateRoom,
  deleteRoom,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../services/adminService'
import {
  buildScheduleSlotId,
  findRoomConflicts,
  getRoomAvailabilityMap,
} from '../services/scheduleConflicts'
import { getCategoryLabel, getLandmarkText } from '../services/roomDisplay'
import { CATEGORY_FILTERS } from '../services/filterRooms'
import TopBar from './TopBar'
import LoadingScreen from './LoadingScreen'
import ClosureTab from './ClosurePanel'
import RoomCombobox from './RoomCombobox'
import MapContainer, { type MapOverlaySegment } from './map/MapContainer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import type { Room } from '../types/room'
import type { ScheduleSlot, DayOfWeek, EventType } from '../types/schedule'
import {
  Door,
  Calendar,
  PencilSimple,
  Trash,
  Plus,
  MagnifyingGlass,
  Warning,
  CaretLeft,
  CheckCircle,
  Clock,
  Users,
  X,
  Prohibit,
  SquaresFour,
  ListBullets,
  SlidersHorizontal,
  MapPin,
} from '@phosphor-icons/react'

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((c) => c.asset)

const DAY_LABELS_SHORT_TH: Record<string, string> = {
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัสฯ',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
  SUN: 'อาทิตย์',
}

const DAYS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 'MON', label: 'วันจันทร์ (MON)', short: 'จันทร์' },
  { value: 'TUE', label: 'วันอังคาร (TUE)', short: 'อังคาร' },
  { value: 'WED', label: 'วันพุธ (WED)', short: 'พุธ' },
  { value: 'THU', label: 'วันพฤหัสบดี (THU)', short: 'พฤหัสฯ' },
  { value: 'FRI', label: 'วันศุกร์ (FRI)', short: 'ศุกร์' },
  { value: 'SAT', label: 'วันเสาร์ (SAT)', short: 'เสาร์' },
  { value: 'SUN', label: 'วันอาทิตย์ (SUN)', short: 'อาทิตย์' },
]

const MINI_GRID_DAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const GRID_START_HOUR = 8
const GRID_END_HOUR = 20
const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60
const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
)

const DATE_REQUIRED_TYPES: ReadonlySet<EventType> = new Set(['exam', 'other'])
const STRICT_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const JS_DAY_TO_WEEKDAY: readonly DayOfWeek[] = [
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
]

function getWeekdayFromDateString(dateStr: string): DayOfWeek | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return JS_DAY_TO_WEEKDAY[d.getUTCDay()]
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

type LeftTab = 'rooms' | 'schedules' | 'closures'
const LEFT_TABS: LeftTab[] = ['rooms', 'schedules', 'closures']

export default function AdminPage() {
  const session = getSession()
  const userIsAdmin = useMemo(() => isAdmin(session), [session])

  const {
    rooms,
    loading: roomsLoading,
    error: roomsError,
    reload: reloadRooms,
  } = useRooms()
  const { schedules, reload: reloadSchedules } = useSchedules()
  const floorPlansReady = usePreloadImages(FLOOR_PLAN_ASSETS)
  const dateInputId = useId()
  const roomComboboxId = useId()

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<LeftTab>('rooms')
  const [currentFloor, setCurrentFloor] = useState(1)
  const [floorFilter, setFloorFilter] = useState<number | null>(null)
  const [categoryFilterKey, setCategoryFilterKey] = useState<string>('all')
  const [mapView, setMapView] = useState<'2d' | '3d'>('3d')
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [closureOverlay, setClosureOverlay] = useState<MapOverlaySegment[]>([])

  // Inline availability filter inside the Left Room Directory
  const [timeFilterActive, setTimeFilterActive] = useState(false)
  const [filterDay, setFilterDay] = useState<DayOfWeek>('MON')
  const [filterStart, setFilterStart] = useState('09:00')
  const [filterEnd, setFilterEnd] = useState('12:00')

  // Progressive disclosure for room metadata editing & Danger Zone
  const [isEditingRoom, setIsEditingRoom] = useState(false)
  const [editNameTh, setEditNameTh] = useState('')
  const [editCapacity, setEditCapacity] = useState('')
  const [roomSaving, setRoomSaving] = useState(false)
  const [roomFeedback, setRoomFeedback] = useState<string | null>(null)

  // Right Inspector schedule display mode ('grid' = 5-day mini timetable, 'list' = card list)
  const [inspectorScheduleView, setInspectorScheduleView] = useState<
    'grid' | 'list'
  >('grid')

  // 2-Column Conflict-Aware Schedule & Room Picker Modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [modalSourceRoomCode, setModalSourceRoomCode] = useState<string>('')
  const [targetRoomCode, setTargetRoomCode] = useState<string>('')
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [formDay, setFormDay] = useState<DayOfWeek>('MON')
  const [formStart, setFormStart] = useState('09:00')
  const [formEnd, setFormEnd] = useState('12:00')
  const [formType, setFormType] = useState<EventType>('lecture')
  const [formDate, setFormDate] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [pickerFloorFilter, setPickerFloorFilter] = useState<number | 'ALL'>(
    'ALL',
  )
  const [pickerMinCapacity, setPickerMinCapacity] = useState<string>('')

  // Post-move confirmation banner
  const [moveNotice, setMoveNotice] = useState<{
    eventCode: string
    toRoom: string
    refreshFailed?: boolean
  } | null>(null)

  // Master Timetable filter state
  const [scheduleFloorFilter, setScheduleFloorFilter] = useState<number | null>(
    null,
  )
  const [scheduleDayFilter, setScheduleDayFilter] = useState<'ALL' | DayOfWeek>(
    'ALL',
  )
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState('')

  const sidebarScrollRef = useRef<HTMLDivElement>(null)

  const selectedRoom = useMemo(
    () =>
      rooms.find((r) => r.id === selectedRoomId || r.code === selectedRoomId) ??
      null,
    [rooms, selectedRoomId],
  )

  const floors = useMemo(() => {
    const set = new Set(rooms.map((r) => r.floor))
    return Array.from(set).sort((a, b) => a - b)
  }, [rooms])

  const roomCountByFloor = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const r of rooms) {
      counts[r.floor] = (counts[r.floor] || 0) + 1
    }
    return counts
  }, [rooms])

  const scheduleCountByRoom = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of schedules) {
      counts[s.roomCode] = (counts[s.roomCode] || 0) + 1
    }
    return counts
  }, [schedules])

  const directoryConflictMap = useMemo(() => {
    if (!timeFilterActive) return new Map<string, ScheduleSlot[]>()
    return getRoomAvailabilityMap(schedules, {
      dayOfWeek: filterDay,
      startTime: filterStart,
      endTime: filterEnd,
    })
  }, [schedules, timeFilterActive, filterDay, filterStart, filterEnd])

  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const activeCategory = CATEGORY_FILTERS.find(
      (c) => c.key === categoryFilterKey,
    )
    return rooms.filter((r) => {
      if (floorFilter !== null && r.floor !== floorFilter) return false
      if (activeCategory && activeCategory.matchCategories.length > 0) {
        if (!activeCategory.matchCategories.includes(r.category)) return false
      }
      if (!q) return true
      return (
        r.roomNumber.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.nameThai && r.nameThai.toLowerCase().includes(q))
      )
    })
  }, [rooms, floorFilter, categoryFilterKey, searchQuery])

  const roomSchedules = useMemo(() => {
    if (!selectedRoom) return []
    return schedules
      .filter((s) => s.roomCode === selectedRoom.code)
      .sort((a, b) => {
        const dayOrder =
          DAYS.findIndex((d) => d.value === a.dayOfWeek) -
          DAYS.findIndex((d) => d.value === b.dayOfWeek)
        if (dayOrder !== 0) return dayOrder
        return a.startTime.localeCompare(b.startTime)
      })
  }, [schedules, selectedRoom])

  const masterTimetableRooms = useMemo(() => {
    const q = scheduleSearchQuery.trim().toLowerCase()
    return rooms.filter((r) => {
      if (scheduleFloorFilter !== null && r.floor !== scheduleFloorFilter) {
        return false
      }
      if (!q) return true
      const roomMatches =
        r.code.toLowerCase().includes(q) ||
        r.roomNumber.toLowerCase().includes(q) ||
        (r.nameThai && r.nameThai.toLowerCase().includes(q))
      if (roomMatches) return true
      return schedules.some(
        (s) =>
          s.roomCode === r.code &&
          (s.eventCode.toLowerCase().includes(q) ||
            s.eventName.toLowerCase().includes(q)),
      )
    })
  }, [rooms, schedules, scheduleFloorFilter, scheduleSearchQuery])

  const filteredMasterSchedules = useMemo(() => {
    const q = scheduleSearchQuery.trim().toLowerCase()
    const roomFloorMap = new Map(rooms.map((r) => [r.code, r.floor]))
    return schedules.filter((s) => {
      if (
        scheduleFloorFilter !== null &&
        roomFloorMap.get(s.roomCode) !== scheduleFloorFilter
      ) {
        return false
      }
      if (!q) return true
      return (
        s.eventCode.toLowerCase().includes(q) ||
        s.eventName.toLowerCase().includes(q) ||
        s.roomCode.toLowerCase().includes(q)
      )
    })
  }, [schedules, rooms, scheduleFloorFilter, scheduleSearchQuery])

  const candidateRoomConflictsMap = useMemo(() => {
    if (!scheduleModalOpen) return new Map<string, ScheduleSlot[]>()
    return getRoomAvailabilityMap(schedules, {
      dayOfWeek: formDay,
      startTime: formStart,
      endTime: formEnd,
      eventType: formType,
      eventDate: DATE_REQUIRED_TYPES.has(formType) ? formDate || null : null,
      excludeSlotId: editingSlotId,
    })
  }, [
    schedules,
    scheduleModalOpen,
    formDay,
    formStart,
    formEnd,
    formType,
    formDate,
    editingSlotId,
  ])

  const targetRoomConflicts = useMemo(() => {
    if (!scheduleModalOpen || !targetRoomCode) return []
    return findRoomConflicts(schedules, targetRoomCode, {
      dayOfWeek: formDay,
      startTime: formStart,
      endTime: formEnd,
      eventType: formType,
      eventDate: DATE_REQUIRED_TYPES.has(formType) ? formDate || null : null,
      excludeSlotId: editingSlotId,
    })
  }, [
    schedules,
    scheduleModalOpen,
    targetRoomCode,
    formDay,
    formStart,
    formEnd,
    formType,
    formDate,
    editingSlotId,
  ])

  const pickerRooms = useMemo(() => {
    const minCap = Number(pickerMinCapacity) || 0
    return rooms.filter((r) => {
      if (pickerFloorFilter !== 'ALL' && r.floor !== pickerFloorFilter) {
        return false
      }
      if (minCap > 0 && (r.capacity ?? 0) < minCap) return false
      return true
    })
  }, [rooms, pickerFloorFilter, pickerMinCapacity])

  function selectRoom(room: Room | null) {
    setSelectedRoomId(room ? room.id : null)
    setRoomFeedback(null)
    setMoveNotice(null)
    setIsEditingRoom(false)
    if (room) {
      setEditNameTh(room.nameThai || '')
      setEditCapacity(room.capacity?.toString() || '')
      if (room.floor !== currentFloor) {
        setCurrentFloor(room.floor)
      }
    }
  }

  function handleSelectRoomById(roomId: string) {
    const room = rooms.find((r) => r.id === roomId || r.code === roomId)
    if (room) {
      setActiveTab('rooms')
      selectRoom(room)
    }
  }

  function openAddScheduleModal(prefill?: {
    roomCode?: string
    dayOfWeek?: DayOfWeek
    startTime?: string
    endTime?: string
  }) {
    const defaultRoom =
      prefill?.roomCode || selectedRoom?.code || rooms[0]?.code || ''
    setEditingSlotId(null)
    setModalSourceRoomCode(defaultRoom)
    setTargetRoomCode(defaultRoom)
    setFormCode('')
    setFormName('')
    setFormDay(prefill?.dayOfWeek || 'MON')
    setFormStart(prefill?.startTime || '')
    setFormEnd(prefill?.endTime || '')
    setFormType('lecture')
    setFormDate('')
    setScheduleError(null)
    setMoveNotice(null)
    setScheduleModalOpen(true)
  }

  function openEditScheduleModal(slot: ScheduleSlot) {
    const slotId = buildScheduleSlotId(slot)
    setEditingSlotId(slotId)
    setModalSourceRoomCode(slot.roomCode)
    setTargetRoomCode(slot.roomCode)
    setFormCode(slot.eventCode)
    setFormName(slot.eventName)
    setFormDay((slot.dayOfWeek as DayOfWeek) || 'MON')
    setFormStart(slot.startTime)
    setFormEnd(slot.endTime)
    setFormType((slot.eventType as EventType) || 'lecture')
    setFormDate(slot.eventDate ?? '')
    setScheduleError(null)
    setMoveNotice(null)
    setScheduleModalOpen(true)
  }

  function closeScheduleModal() {
    setScheduleModalOpen(false)
    setEditingSlotId(null)
    setScheduleError(null)
  }

  async function handleSaveRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRoom) return
    setRoomSaving(true)
    setRoomFeedback(null)
    try {
      const updates: { name_th: string; capacity?: number } = {
        name_th: editNameTh,
      }
      if (editCapacity.trim() !== '') {
        updates.capacity = Number(editCapacity)
      }
      await updateRoom(selectedRoom.id, updates)
      reloadRooms()
      setRoomFeedback('บันทึกข้อมูลห้องสำเร็จเรียบร้อย')
      setIsEditingRoom(false)
    } catch (err) {
      setRoomFeedback(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก',
      )
    } finally {
      setRoomSaving(false)
    }
  }

  async function handleDeleteRoom() {
    if (!selectedRoom) return
    if (!window.confirm(`ยืนยันการลบห้อง ${selectedRoom.code} หรือไม่?`)) return
    setRoomSaving(true)
    try {
      await deleteRoom(selectedRoom.id)
      selectRoom(null)
      reloadRooms(true)
    } catch (err) {
      setRoomFeedback(err instanceof Error ? err.message : 'ลบห้องไม่สำเร็จ')
    } finally {
      setRoomSaving(false)
    }
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault()
    const sourceRoomCode = modalSourceRoomCode || selectedRoom?.code
    if (!sourceRoomCode) return

    const dateRequired = DATE_REQUIRED_TYPES.has(formType)
    const trimmedDate = formDate.trim()
    if (formType === 'exam' && !trimmedDate) {
      setScheduleError('กรุณาเลือกวันสอบ (จำเป็นสำหรับการสอบ)')
      return
    }
    const startTrimmed = formStart.trim()
    const endTrimmed = formEnd.trim()
    if (!STRICT_TIME_RE.test(startTrimmed) || !STRICT_TIME_RE.test(endTrimmed)) {
      setScheduleError('กรุณาระบุเวลาเป็นรูปแบบ HH:MM (00:00–23:59)')
      return
    }
    if (endTrimmed <= startTrimmed) {
      setScheduleError('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม')
      return
    }
    let effectiveDay: DayOfWeek = formDay
    if (dateRequired && trimmedDate) {
      const derivedDay = getWeekdayFromDateString(trimmedDate)
      if (!derivedDay) {
        setScheduleError('วันที่ไม่ถูกต้อง กรุณาเลือกวันที่จากปฏิทิน')
        return
      }
      effectiveDay = derivedDay
      if (derivedDay !== formDay) {
        setFormDay(derivedDay)
      }
    }

    setScheduleSaving(true)
    setScheduleError(null)
    try {
      if (editingSlotId) {
        const destinationRoomCode = (targetRoomCode || sourceRoomCode).trim()
        const movedRoom = destinationRoomCode !== sourceRoomCode
        const destRoomObj = rooms.find((r) => r.code === destinationRoomCode)
        await updateSchedule(sourceRoomCode, editingSlotId, {
          day_of_week: effectiveDay,
          start_time: startTrimmed,
          end_time: endTrimmed,
          event_code: formCode.trim(),
          event_name: formName.trim(),
          event_type: formType,
          event_date: dateRequired && trimmedDate ? trimmedDate : null,
          ...(movedRoom
            ? {
                room_code: destinationRoomCode,
                location_id: destRoomObj?.id ?? destinationRoomCode,
              }
            : {}),
        })
        const movedNotice = movedRoom
          ? { eventCode: formCode.trim(), toRoom: destinationRoomCode }
          : null
        closeScheduleModal()
        try {
          await reloadSchedules(true)
          if (movedNotice) setMoveNotice(movedNotice)
        } catch {
          if (movedNotice) {
            setMoveNotice({ ...movedNotice, refreshFailed: true })
          }
        }
      } else {
        const createRoom = (targetRoomCode || sourceRoomCode).trim()
        await createSchedule({
          room_code: createRoom,
          day_of_week: effectiveDay,
          start_time: startTrimmed,
          end_time: endTrimmed,
          event_code: formCode.trim(),
          event_name: formName.trim(),
          event_type: formType,
          ...(dateRequired && trimmedDate ? { event_date: trimmedDate } : {}),
        })
        closeScheduleModal()
        await reloadSchedules(true)
      }
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : 'บันทึกตารางไม่สำเร็จ',
      )
    } finally {
      setScheduleSaving(false)
    }
  }

  async function handleDeleteSchedule(slot: ScheduleSlot) {
    const slotId = buildScheduleSlotId(slot)
    if (
      !window.confirm(
        `ลบตาราง ${slot.eventCode} (${slot.dayOfWeek} ${slot.startTime}) หรือไม่?`,
      )
    ) {
      return
    }
    try {
      await deleteSchedule(slot.roomCode, slotId)
      await reloadSchedules(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ลบไม่สำเร็จ')
    }
  }

  if (roomsError) {
    return <LoadingScreen error={roomsError} onRetry={reloadRooms} />
  }
  if (roomsLoading || !floorPlansReady) return <LoadingScreen />

  const activeTabIdx = LEFT_TABS.indexOf(activeTab)
  const blobTransform = `translateX(${activeTabIdx * 100}%)`

  const dockModeSwitcher = (
    <div
      role="group"
      aria-label="โหมดจัดการอาคาร"
      className="gooey-switch-group-3 rounded-full bg-surface-2 p-0.5"
    >
      <div aria-hidden="true" className="gooey-switch-blobs inset-0.5">
        <span
          className="gooey-pill-lead"
          style={{
            width: `${100 / LEFT_TABS.length}%`,
            transform: blobTransform,
          }}
        />
        <span
          className="gooey-pill-drop"
          style={{
            width: `${100 / LEFT_TABS.length}%`,
            transform: blobTransform,
          }}
        />
        <span
          className="gooey-pill-trail"
          style={{
            width: `${100 / LEFT_TABS.length}%`,
            transform: blobTransform,
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => setActiveTab('rooms')}
        title="ห้องและพื้นที่"
        className={`btn btn-sm gooey-switch-btn gap-1 px-2.5 text-xs ${
          activeTab === 'rooms' ? 'text-white' : 'text-ink-2 hover:text-ink'
        }`}
      >
        <Door size={14} weight="duotone" className="shrink-0" />
        <span aria-hidden="true">ห้อง</span>
        <span className="sr-only">ห้องและพื้นที่</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab('schedules')}
        title="ตารางเวลาทั้งหมด"
        className={`btn btn-sm gooey-switch-btn gap-1 px-2.5 text-xs ${
          activeTab === 'schedules' ? 'text-white' : 'text-ink-2 hover:text-ink'
        }`}
      >
        <Calendar size={14} weight="duotone" className="shrink-0" />
        <span aria-hidden="true">ตารางเวลา</span>
        <span className="sr-only">ตารางเวลาทั้งหมด</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setActiveTab('closures')
          setMapView('2d')
        }}
        title="ทางปิดชั่วคราว"
        className={`btn btn-sm gooey-switch-btn gap-1 px-2.5 text-xs ${
          activeTab === 'closures' ? 'text-white' : 'text-ink-2 hover:text-ink'
        }`}
      >
        <Prohibit size={14} weight="duotone" className="shrink-0" />
        <span aria-hidden="true">ทางปิด</span>
        <span className="sr-only">ทางปิดชั่วคราว</span>
      </button>
    </div>
  )

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-surface-2 select-none">
      {/* Shared TopBar + Bottom Dock with merged mode switcher */}
      <TopBar
        sidebarWidth={activeTab === 'schedules' ? 0 : 380}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        currentFloor={activeTab === 'schedules' ? undefined : currentFloor}
        onFloorChange={activeTab === 'schedules' ? undefined : setCurrentFloor}
        mapView={activeTab === 'schedules' ? undefined : mapView}
        onToggleMapView={
          activeTab === 'schedules'
            ? undefined
            : () => setMapView((prev) => (prev === '3d' ? '2d' : '3d'))
        }
        dockExtra={dockModeSwitcher}
      />

      {/* Workspace below fixed 64px TopBar */}
      <div className="absolute inset-x-0 top-16 bottom-0 flex overflow-hidden">
        {/* LEFT SIDEBAR: Dedicated Room Directory ('rooms') or Closure Editor ('closures') */}
        {activeTab !== 'schedules' && (
          <aside
            aria-label="แผงจัดการข้อมูลอาคาร"
            className={`relative z-20 flex flex-col bg-surface border-r border-line transition-all duration-300 ease-out overflow-hidden shrink-0 ${
              isSidebarCollapsed ? 'w-0 border-r-0' : 'w-full sm:w-[380px]'
            }`}
          >
            {/* Sidebar Header */}
            <div className="px-4 pt-3.5 pb-3 border-b border-line-soft bg-surface shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-ink tracking-tight">
                    {activeTab === 'rooms'
                      ? `เลือกห้องเรียน (${rooms.length})`
                      : 'ทางปิดชั่วคราว'}
                  </h2>
                  <p className="text-[11px] text-ink-2 mt-0.5">
                    {activeTab === 'rooms'
                      ? 'คลิกเลือกห้องเพื่อดูตารางเรียนหรือแก้ไขข้อมูล'
                      : 'จัดการจุดปิดซ่อมบำรุงและทางเดินชั่วคราว'}
                  </p>
                </div>
                {activeTab === 'rooms' && (
                  <button
                    type="button"
                    aria-expanded={timeFilterActive}
                    onClick={() => setTimeFilterActive((v) => !v)}
                    className={`chip text-[11px] py-1 px-2.5 shrink-0 ${
                      timeFilterActive ? 'chip-active' : ''
                    }`}
                  >
                    <SlidersHorizontal size={13} weight="bold" />
                    เช็คเวลาว่าง
                  </button>
                )}
              </div>

              {/* Inline collapsible availability filter */}
              {activeTab === 'rooms' && timeFilterActive && (
                <div className="mt-3 p-2.5 bg-surface-2 border border-line-soft space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink flex items-center gap-1">
                      <Clock size={13} weight="bold" className="text-accent" />
                      กรองห้องว่างตามช่วงเวลา
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700">
                      ว่าง{' '}
                      {
                        filteredRooms.filter(
                          (r) => !(directoryConflictMap.get(r.code)?.length),
                        ).length
                      }
                      /{filteredRooms.length} ห้อง
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      aria-label="วันตรวจสอบห้องว่าง"
                      value={filterDay}
                      onChange={(e) =>
                        setFilterDay(e.target.value as DayOfWeek)
                      }
                      className="input-boxed text-xs py-1 px-2"
                    >
                      {DAYS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.short}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      aria-label="เวลาเริ่มตรวจสอบห้องว่าง"
                      value={filterStart}
                      onChange={(e) => setFilterStart(e.target.value)}
                      placeholder="09:00"
                      className="input-boxed text-xs py-1 px-2 font-mono"
                    />
                    <input
                      type="text"
                      aria-label="เวลาสิ้นสุดตรวจสอบห้องว่าง"
                      value={filterEnd}
                      onChange={(e) => setFilterEnd(e.target.value)}
                      placeholder="12:00"
                      className="input-boxed text-xs py-1 px-2 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {activeTab === 'closures' ? (
              <div
                ref={sidebarScrollRef}
                className="flex-1 overflow-y-auto thin-scrollbar p-4"
              >
                <ClosureTab
                  rooms={rooms}
                  floor={currentFloor}
                  onFloorChange={setCurrentFloor}
                  onOverlayChange={setClosureOverlay}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Floor Pills + Category Select + Search Input */}
                <div className="px-4 py-3 border-b border-line-soft space-y-2.5 shrink-0 bg-surface">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() => setFloorFilter(null)}
                      className={`chip text-xs py-1 px-2.5 shrink-0 ${
                        floorFilter === null ? 'chip-active' : ''
                      }`}
                    >
                      ทั้งหมด ({rooms.length})
                    </button>
                    {floors.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setFloorFilter(f)
                          setCurrentFloor(f)
                        }}
                        className={`chip text-xs py-1 px-2.5 shrink-0 ${
                          floorFilter === f ? 'chip-active' : ''
                        }`}
                      >
                        ชั้น {f} ({roomCountByFloor[f] || 0})
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <select
                      aria-label="กรองตามประเภทห้อง"
                      value={categoryFilterKey}
                      onChange={(e) => setCategoryFilterKey(e.target.value)}
                      className="input-boxed text-xs py-1.5 px-2.5"
                    >
                      {CATEGORY_FILTERS.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label}
                        </option>
                      ))}
                    </select>

                    <div className="relative">
                      <MagnifyingGlass
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ค้นหาเลขห้อง หรือ ชื่อห้อง..."
                        className="input-boxed pl-9 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Scrollable Room Directory Cards */}
                <div
                  ref={sidebarScrollRef}
                  className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
                >
                  {filteredRooms.length === 0 ? (
                    <div className="py-12 text-center text-xs text-ink-3">
                      ไม่พบห้องที่ตรงกับเงื่อนไข
                    </div>
                  ) : (
                    filteredRooms.map((room) => {
                      const count = scheduleCountByRoom[room.code] || 0
                      const isSelected = selectedRoom?.code === room.code
                      const roomConflicts =
                        directoryConflictMap.get(room.code) || []
                      const isBusy =
                        timeFilterActive && roomConflicts.length > 0
                      const roomDisplayName = room.roomNumber
                        ? `ห้อง ${room.roomNumber}`
                        : room.nameThai || room.code

                      return (
                        <button
                          key={room.code}
                          type="button"
                          onClick={() => selectRoom(room)}
                          className={`w-full text-left card card-interactive p-3 transition-colors ${
                            isSelected
                              ? 'border-ink ring-1 ring-ink bg-surface-2'
                              : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-ink">
                                  {roomDisplayName}
                                </span>
                                <span className="text-[11px] font-mono text-ink-3">
                                  {room.code}
                                </span>
                              </div>
                              <p className="text-xs text-ink-2 truncate mt-0.5">
                                {room.nameThai || '—'}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {timeFilterActive ? (
                                isBusy ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                    ไม่ว่าง: {roomConflicts[0].eventCode}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ว่าง
                                  </span>
                                )
                              ) : (
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                    count > 0
                                      ? 'bg-ink text-white'
                                      : 'bg-surface-2 text-ink-3'
                                  }`}
                                >
                                  {count} คาบ
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-ink-3">
                            <span>ชั้น {room.floor}</span>
                            <span>·</span>
                            <span>{getCategoryLabel(room.category)}</span>
                            {room.capacity !== undefined && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1">
                                  <Users size={11} weight="bold" />
                                  {room.capacity} ที่นั่ง
                                </span>
                              </>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* CENTER WORKSPACE: Full-Viewport Master Timetable ('schedules') OR Interactive Map */}
        {activeTab === 'schedules' ? (
          <section
            aria-label="ตารางเวลาแม่บททั้งอาคาร"
            className="flex-1 flex flex-col bg-surface overflow-hidden"
          >
            {/* Master Timetable Toolbar */}
            <div className="px-6 py-3.5 border-b border-line bg-surface flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-base font-bold text-ink tracking-tight">
                  สำรวจตารางเวลาทั้งหมด ({filteredMasterSchedules.length}/
                  {schedules.length})
                </h2>
                <p className="text-xs text-ink-2">
                  เปรียบเทียบห้องว่างและคาบเรียนรายชั่วโมง (คลิกช่องว่างเพื่อเพิ่มตาราง หรือคลิกวิชาเพื่อแก้ไข)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Day Pills */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setScheduleDayFilter('ALL')}
                    className={`chip text-xs py-1 px-2.5 ${
                      scheduleDayFilter === 'ALL' ? 'chip-active' : ''
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {DAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setScheduleDayFilter(d.value)}
                      className={`chip text-xs py-1 px-2.5 ${
                        scheduleDayFilter === d.value ? 'chip-active' : ''
                      }`}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>

                {/* Floor Filter */}
                <select
                  aria-label="กรองชั้นตารางเวลา"
                  value={scheduleFloorFilter ?? 'ALL'}
                  onChange={(e) =>
                    setScheduleFloorFilter(
                      e.target.value === 'ALL' ? null : Number(e.target.value),
                    )
                  }
                  className="input-boxed text-xs py-1.5 px-2.5 w-auto"
                >
                  <option value="ALL">ทุกชั้น</option>
                  {floors.map((f) => (
                    <option key={f} value={f}>
                      ชั้น {f}
                    </option>
                  ))}
                </select>

                {/* Search Input */}
                <div className="relative w-56">
                  <MagnifyingGlass
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                  />
                  <input
                    type="text"
                    value={scheduleSearchQuery}
                    onChange={(e) => setScheduleSearchQuery(e.target.value)}
                    placeholder="ค้นหารหัสวิชา, ชื่อวิชา หรือเลขห้อง..."
                    className="input-boxed pl-8 py-1.5 text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    openAddScheduleModal({
                      dayOfWeek:
                        scheduleDayFilter === 'ALL' ? 'MON' : scheduleDayFilter,
                    })
                  }
                  className="btn btn-primary btn-sm"
                >
                  <Plus size={14} weight="bold" />
                  เพิ่มตาราง
                </button>
              </div>
            </div>

            {/* Room x Hour Matrix Grid */}
            <div className="flex-1 overflow-auto bg-surface-2">
              <div className="min-w-[1100px]">
                {/* Sticky Hour Header */}
                <div className="sticky top-0 z-20 flex bg-surface border-b border-line">
                  <div className="w-[220px] shrink-0 px-4 py-2.5 border-r border-line text-xs font-bold text-ink bg-surface sticky left-0 z-30">
                    ห้องเรียน ({masterTimetableRooms.length})
                  </div>
                  <div className="flex-1 grid grid-cols-12">
                    {HOURS.map((hr) => (
                      <div
                        key={hr}
                        className="px-2 py-2.5 border-r border-line-soft text-[11px] font-mono font-semibold text-ink-2 text-center"
                      >
                        {String(hr).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>
                </div>

                {/* Room Rows */}
                {masterTimetableRooms.map((room) => {
                  const rowSlots = filteredMasterSchedules.filter(
                    (s) =>
                      s.roomCode === room.code &&
                      (scheduleDayFilter === 'ALL' ||
                        s.dayOfWeek === scheduleDayFilter),
                  )
                  return (
                    <div
                      key={room.code}
                      className="flex border-b border-line-soft bg-surface hover:bg-surface-2/40 transition-colors"
                    >
                      {/* Sticky Left Room Cell */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('rooms')
                          selectRoom(room)
                        }}
                        className="w-[220px] shrink-0 px-4 py-3 border-r border-line text-left bg-surface sticky left-0 z-10 hover:bg-surface-2 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-ink">
                            {room.code}
                          </span>
                          <span className="text-[10px] text-ink-3">
                            ชั้น {room.floor}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-2 truncate">
                          {room.nameThai || getCategoryLabel(room.category)}
                        </p>
                      </button>

                      {/* 12-Hour Timeline Track */}
                      <div className="relative flex-1 h-16 grid grid-cols-12">
                        {HOURS.map((hr) => {
                          const startStr = `${String(hr).padStart(2, '0')}:00`
                          const endStr = `${String(hr + 1).padStart(2, '0')}:00`
                          return (
                            <button
                              key={hr}
                              type="button"
                              aria-label={`เพิ่มตาราง ${room.code} เวลา ${startStr}`}
                              onClick={() =>
                                openAddScheduleModal({
                                  roomCode: room.code,
                                  dayOfWeek:
                                    scheduleDayFilter === 'ALL'
                                      ? 'MON'
                                      : scheduleDayFilter,
                                  startTime: startStr,
                                  endTime: endStr,
                                })
                              }
                              className="border-r border-line-soft hover:bg-accent/5 transition-colors"
                            />
                          )
                        })}

                        {/* Positioned Schedule Blocks */}
                        {rowSlots.map((slot) => {
                          const startMins = Math.max(
                            0,
                            parseMinutes(slot.startTime) - GRID_START_HOUR * 60,
                          )
                          const endMins = Math.min(
                            GRID_TOTAL_MINUTES,
                            parseMinutes(slot.endTime) - GRID_START_HOUR * 60,
                          )
                          const leftPct = (startMins / GRID_TOTAL_MINUTES) * 100
                          const widthPct = Math.max(
                            ((endMins - startMins) / GRID_TOTAL_MINUTES) * 100,
                            4,
                          )
                          const isExam = slot.eventType === 'exam'

                          return (
                            <div
                              key={buildScheduleSlotId(slot)}
                              onClick={() => openEditScheduleModal(slot)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  openEditScheduleModal(slot)
                                }
                              }}
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                              }}
                              className={`group absolute top-1.5 bottom-1.5 z-10 px-2 py-1 overflow-hidden border text-left transition-shadow hover:shadow-md cursor-pointer ${
                                isExam
                                  ? 'bg-tertiary border-line text-ink border-l-4 border-l-ink'
                                  : 'bg-surface-2 border-line-soft text-ink border-l-4 border-l-accent'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-bold truncate">
                                  {slot.eventCode}
                                </span>
                                <span className="text-[10px] font-mono text-ink-3 shrink-0">
                                  {slot.startTime}–{slot.endTime}
                                </span>
                              </div>
                              <p className="text-[10px] text-ink-2 truncate">
                                {slot.eventName}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        ) : (
          <div className="relative flex-1 h-full overflow-hidden">
            <MapContainer
              rooms={rooms}
              currentFloor={currentFloor}
              onFloorChange={setCurrentFloor}
              selectedRoomId={selectedRoomId}
              onSelectRoom={handleSelectRoomById}
              onClearSelection={() => {}}
              mode="admin"
              sidebarWidth={isSidebarCollapsed ? 0 : 380}
              viewMode={mapView}
              onViewModeChange={setMapView}
              hideBottomControls
              overlaySegments={
                activeTab === 'closures' ? closureOverlay : undefined
              }
            />
          </div>
        )}

        {/* SLIDE-OVER RIGHT ROOM INSPECTOR (440px Desktop Drawer / Mobile Sheet) */}
        {activeTab === 'rooms' && selectedRoom && (
          <aside
            aria-label={`ข้อมูลห้อง ${selectedRoom.code}`}
            className="fixed right-0 bottom-0 top-16 z-30 w-full sm:w-[440px] bg-surface border-l border-line shadow-floating flex flex-col overflow-hidden"
          >
            {/* Inspector Top Bar */}
            <div className="px-4 py-3 border-b border-line-soft flex items-center justify-between gap-2 bg-surface shrink-0">
              <button
                type="button"
                onClick={() => selectRoom(null)}
                className="flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink transition-colors"
              >
                <CaretLeft size={14} weight="bold" />
                กลับไปรายการห้อง
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-expanded={isEditingRoom}
                  onClick={() => setIsEditingRoom((v) => !v)}
                  className={`chip text-xs py-1 px-2.5 ${
                    isEditingRoom ? 'chip-active' : ''
                  }`}
                >
                  <PencilSimple size={13} weight="bold" />
                  แก้ไขข้อมูลห้อง
                </button>
                <button
                  type="button"
                  aria-label="ปิดแผงข้อมูลห้อง"
                  onClick={() => selectRoom(null)}
                  className="p-1.5 text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>
            </div>

            {/* Scrollable Inspector Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Read-Only Room Summary Card */}
              <div className="card p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-ink leading-tight">
                        {selectedRoom.roomNumber
                          ? `ห้อง ${selectedRoom.roomNumber}`
                          : selectedRoom.nameThai || selectedRoom.code}
                      </h3>
                      <span className="text-xs font-mono text-ink-3">
                        {selectedRoom.code}
                      </span>
                    </div>
                    <p className="text-xs text-ink-2 mt-0.5">
                      {selectedRoom.nameThai || 'ไม่มีชื่อภาษาไทย'}
                    </p>
                  </div>
                  <span className="chip text-[11px] py-0.5 px-2.5 pointer-events-none">
                    ชั้น {selectedRoom.floor}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2 pt-1">
                  <span className="px-2 py-0.5 bg-surface-2 border border-line-soft font-medium">
                    {getCategoryLabel(selectedRoom.category)}
                  </span>
                  <span className="px-2 py-0.5 bg-surface-2 border border-line-soft font-medium inline-flex items-center gap-1">
                    <Users size={12} weight="bold" />
                    {selectedRoom.capacity
                      ? `${selectedRoom.capacity} ที่นั่ง`
                      : 'ไม่ระบุความจุ'}
                  </span>
                </div>

                {/* Preserved Room Landmarks */}
                {selectedRoom.landmarks && selectedRoom.landmarks.length > 0 && (
                  <div className="pt-2 border-t border-line-soft flex items-start gap-1.5 text-xs text-ink-2">
                    <MapPin
                      size={14}
                      weight="fill"
                      className="text-ink shrink-0 mt-0.5"
                    />
                    <span>
                      {selectedRoom.landmarks
                        .map((l) => getLandmarkText(l))
                        .join(' · ')}
                    </span>
                  </div>
                )}

                {roomFeedback && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium pt-1">
                    <CheckCircle size={14} weight="fill" />
                    {roomFeedback}
                  </div>
                )}
              </div>

              {/* Progressive Disclosure: Room Edit Form + Admin Danger Zone */}
              {isEditingRoom && (
                <div className="card p-4 space-y-4 bg-surface-2/50">
                  <form onSubmit={handleSaveRoom} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                        แก้ไขข้อมูลห้อง {selectedRoom.code}
                      </h4>
                    </div>

                    <div>
                      <label
                        htmlFor="admin-room-name"
                        className="block text-xs font-medium text-ink-2 mb-1"
                      >
                        ชื่อห้องภาษาไทย (name_th)
                      </label>
                      <input
                        id="admin-room-name"
                        type="text"
                        value={editNameTh}
                        onChange={(e) => setEditNameTh(e.target.value)}
                        className="input-boxed text-sm py-2"
                        placeholder="เช่น ห้องบรรยาย 101"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="admin-room-capacity"
                        className="block text-xs font-medium text-ink-2 mb-1"
                      >
                        ความจุที่นั่ง (คน)
                      </label>
                      <input
                        id="admin-room-capacity"
                        type="number"
                        value={editCapacity}
                        onChange={(e) => setEditCapacity(e.target.value)}
                        className="input-boxed text-sm py-2"
                        placeholder="เช่น 50"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={roomSaving}
                        className="btn btn-primary flex-1 py-2 text-xs"
                      >
                        <PencilSimple size={14} weight="bold" />
                        {roomSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลห้อง'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingRoom(false)}
                        className="btn btn-secondary py-2 px-4 text-xs"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </form>

                  {/* Admin-Only Tucked Danger Zone */}
                  {userIsAdmin && (
                    <div className="pt-3 border-t border-red-200 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                        <Warning size={14} weight="bold" />
                        Danger Zone
                      </div>
                      <p className="text-[11px] text-red-600">
                        การลบห้องจะลบข้อมูลห้องออกจากฐานข้อมูลอย่างถาวร (เฉพาะ Admin)
                      </p>
                      <button
                        type="button"
                        onClick={handleDeleteRoom}
                        disabled={roomSaving}
                        className="w-full py-2 px-3 rounded-full border border-red-300 bg-white text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Trash size={14} weight="bold" />
                        ลบห้องนี้…
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Post-Move Confirmation Banner */}
              {moveNotice && (
                <div
                  role="status"
                  className={`p-3 border text-xs flex items-center justify-between gap-2 ${
                    moveNotice.refreshFailed
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  }`}
                >
                  <span>
                    ย้าย <span className="font-mono font-bold">{moveNotice.eventCode}</span> ไปห้อง {moveNotice.toRoom} แล้ว
                    {moveNotice.refreshFailed &&
                      ' แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้า'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const dest = rooms.find(
                        (r) => r.code === moveNotice.toRoom,
                      )
                      if (dest) selectRoom(dest)
                    }}
                    className="font-semibold underline shrink-0"
                  >
                    ไปที่ห้อง {moveNotice.toRoom}
                  </button>
                </div>
              )}

              {/* Room Timetable Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5">
                    <Calendar size={14} weight="bold" />
                    ตารางการใช้ห้อง ({roomSchedules.length})
                  </h4>

                  <div className="flex items-center gap-1.5">
                    <div className="inline-flex border border-line bg-surface-2 p-0.5">
                      <button
                        type="button"
                        onClick={() => setInspectorScheduleView('grid')}
                        className={`px-2 py-1 text-[11px] font-semibold flex items-center gap-1 ${
                          inspectorScheduleView === 'grid'
                            ? 'bg-ink text-white'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <SquaresFour size={12} weight="bold" />
                        ตาราง 5 วัน
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectorScheduleView('list')}
                        className={`px-2 py-1 text-[11px] font-semibold flex items-center gap-1 ${
                          inspectorScheduleView === 'list'
                            ? 'bg-ink text-white'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <ListBullets size={12} weight="bold" />
                        รายการ
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openAddScheduleModal({ roomCode: selectedRoom.code })
                      }
                      className="btn btn-primary btn-sm text-xs"
                    >
                      <Plus size={12} weight="bold" />
                      เพิ่มตาราง
                    </button>
                  </div>
                </div>

                {/* 5-Day Mini Timetable Grid View */}
                {inspectorScheduleView === 'grid' && (
                  <div className="card p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-ink-3 pl-12 pr-1">
                      <span>08:00</span>
                      <span>11:00</span>
                      <span>14:00</span>
                      <span>17:00</span>
                      <span>20:00</span>
                    </div>

                    <div className="space-y-1.5">
                      {MINI_GRID_DAYS.map((day) => {
                        const daySlots = roomSchedules.filter(
                          (s) => s.dayOfWeek === day,
                        )
                        return (
                          <div key={day} className="flex items-center gap-2">
                            <span className="w-10 shrink-0 text-[11px] font-bold text-ink-2">
                              {DAY_LABELS_SHORT_TH[day]}
                            </span>
                            <div
                              onClick={() =>
                                openAddScheduleModal({
                                  roomCode: selectedRoom.code,
                                  dayOfWeek: day,
                                  startTime: '09:00',
                                  endTime: '12:00',
                                })
                              }
                              className="relative flex-1 h-12 bg-surface-2/60 border border-line-soft cursor-pointer hover:bg-surface-2 transition-colors"
                            >
                              {daySlots.map((slot) => {
                                const startMins = Math.max(
                                  0,
                                  parseMinutes(slot.startTime) -
                                    GRID_START_HOUR * 60,
                                )
                                const endMins = Math.min(
                                  GRID_TOTAL_MINUTES,
                                  parseMinutes(slot.endTime) -
                                    GRID_START_HOUR * 60,
                                )
                                const leftPct =
                                  (startMins / GRID_TOTAL_MINUTES) * 100
                                const widthPct = Math.max(
                                  ((endMins - startMins) / GRID_TOTAL_MINUTES) *
                                    100,
                                  12,
                                )
                                const isExam = slot.eventType === 'exam'

                                return (
                                  <div
                                    key={buildScheduleSlotId(slot)}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openEditScheduleModal(slot)
                                    }}
                                    style={{
                                      left: `${leftPct}%`,
                                      width: `${widthPct}%`,
                                    }}
                                    className={`group absolute top-1 bottom-1 z-10 px-1.5 py-0.5 overflow-hidden border flex items-center justify-between gap-1 ${
                                      isExam
                                        ? 'bg-tertiary border-line text-ink border-l-4 border-l-ink'
                                        : 'bg-surface-2 border-line-soft text-ink border-l-4 border-l-accent'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-bold truncate leading-tight">
                                        {slot.eventCode}
                                      </p>
                                      <p className="text-[9px] font-mono text-ink-3 truncate leading-tight">
                                        {slot.startTime}–{slot.endTime}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        aria-label="แก้ไขตาราง"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openEditScheduleModal(slot)
                                        }}
                                        className="p-0.5 text-ink-3 hover:text-ink"
                                      >
                                        <PencilSimple size={12} weight="bold" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="ลบตาราง"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteSchedule(slot)
                                        }}
                                        className="p-0.5 text-ink-3 hover:text-red-600"
                                      >
                                        <Trash size={12} weight="bold" />
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Detailed Schedule List Cards */}
                {inspectorScheduleView === 'list' && (
                  <div className="space-y-2">
                    {roomSchedules.length === 0 ? (
                      <div className="py-8 text-center text-xs text-ink-3 bg-surface-2 border border-line-soft">
                        ไม่มีตารางเรียนในห้องนี้
                      </div>
                    ) : (
                      roomSchedules.map((slot) => {
                        const isExam = slot.eventType === 'exam'
                        return (
                          <div
                            key={buildScheduleSlotId(slot)}
                            className={`group p-3 border flex items-start justify-between gap-2 ${
                              isExam
                                ? 'bg-tertiary border-line text-ink border-l-4 border-l-ink'
                                : 'bg-surface-2 border-line-soft text-ink border-l-4 border-l-accent'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-ink">
                                  {slot.eventCode}
                                </span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface text-ink-2 border border-line-soft">
                                  {DAY_LABELS_SHORT_TH[slot.dayOfWeek] ??
                                    slot.dayOfWeek}{' '}
                                  {slot.startTime}–{slot.endTime}
                                </span>
                                {slot.eventDate && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                                    {slot.eventDate}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-ink-2 mt-1 truncate">
                                {slot.eventName}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                aria-label="แก้ไขตาราง"
                                onClick={() => openEditScheduleModal(slot)}
                                className="p-1.5 text-ink-3 hover:text-ink transition-colors"
                              >
                                <PencilSimple size={14} weight="bold" />
                              </button>
                              <button
                                type="button"
                                aria-label="ลบตาราง"
                                onClick={() => handleDeleteSchedule(slot)}
                                className="p-1.5 text-ink-3 hover:text-red-600 transition-colors"
                              >
                                <Trash size={14} weight="bold" />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* 2-COLUMN CONFLICT-AWARE SCHEDULE & ROOM PICKER MODAL */}
        {scheduleModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              editingSlotId ? 'แก้ไขข้อมูลตาราง' : 'เพิ่มตารางสอนใหม่'
            }
            className="fixed inset-0 z-110 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <form
              onSubmit={handleSaveSchedule}
              className="w-full max-w-[780px] max-h-[90vh] bg-surface border border-line shadow-floating flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface shrink-0">
                <div>
                  <h3 className="text-base font-bold text-ink">
                    {editingSlotId ? 'แก้ไขข้อมูลตาราง' : 'เพิ่มตารางสอนใหม่'}
                  </h3>
                  <p className="text-xs text-ink-2 mt-0.5">
                    ห้องที่เลือก:{' '}
                    <span className="font-mono font-semibold text-ink">
                      {targetRoomCode}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="ปิดหน้าต่างตารางสอน"
                  onClick={closeScheduleModal}
                  className="p-1.5 text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              {/* 2-Column Modal Body */}
              <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line">
                {/* LEFT COLUMN: Schedule Details Form */}
                <div className="p-6 space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-ink-2 mb-1">
                        รหัสวิชา *
                      </label>
                      <input
                        type="text"
                        required
                        value={formCode}
                        onChange={(e) => setFormCode(e.target.value)}
                        className="input-boxed py-2 text-xs"
                        placeholder="CS333"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-ink-2 mb-1">
                        วัน *
                      </label>
                      <select
                        value={formDay}
                        onChange={(e) =>
                          setFormDay(e.target.value as DayOfWeek)
                        }
                        className="input-boxed py-2 text-xs"
                      >
                        {DAYS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-ink-2 mb-1">
                      ชื่อวิชา / กิจกรรม
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="input-boxed py-2 text-xs"
                      placeholder="Computer Science"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-ink-2 mb-1">
                        เวลาเริ่ม *
                      </label>
                      <input
                        type="text"
                        required
                        value={formStart}
                        onChange={(e) => setFormStart(e.target.value)}
                        className="input-boxed py-2 text-xs font-mono"
                        placeholder="09:00"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-ink-2 mb-1">
                        เวลาสิ้นสุด *
                      </label>
                      <input
                        type="text"
                        required
                        value={formEnd}
                        onChange={(e) => setFormEnd(e.target.value)}
                        className="input-boxed py-2 text-xs font-mono"
                        placeholder="12:00"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-ink-2 mb-1">
                        ประเภท
                      </label>
                      <select
                        value={formType}
                        onChange={(e) => {
                          const next = e.target.value as EventType
                          setFormType(next)
                          if (!DATE_REQUIRED_TYPES.has(next)) setFormDate('')
                        }}
                        className="input-boxed py-2 text-xs"
                      >
                        <option value="lecture">บรรยาย (Lecture)</option>
                        <option value="lab">ปฏิบัติการ (Lab)</option>
                        <option value="exam">การสอบ (Exam)</option>
                        <option value="other">อื่นๆ (Other)</option>
                      </select>
                    </div>
                  </div>

                  {DATE_REQUIRED_TYPES.has(formType) && (
                    <div>
                      <label
                        htmlFor={dateInputId}
                        className="block text-[11px] font-medium text-ink-2 mb-1"
                      >
                        {formType === 'exam' ? 'วันสอบ *' : 'วันที่จัด'}
                      </label>
                      <input
                        id={dateInputId}
                        type="date"
                        required={!editingSlotId && formType === 'exam'}
                        value={formDate}
                        onChange={(e) => {
                          const nextDate = e.target.value
                          setFormDate(nextDate)
                          const derived = getWeekdayFromDateString(nextDate)
                          if (derived) setFormDay(derived)
                        }}
                        className="input-boxed py-2 text-xs font-mono"
                      />
                    </div>
                  )}

                  {/* Conflict Warning Banner for Selected Target Room */}
                  {targetRoomConflicts.length > 0 && (
                    <div
                      role="alert"
                      className="p-3 border border-red-300 bg-red-50 text-red-800 text-xs space-y-1"
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        <Warning size={14} weight="bold" />
                        คำเตือน: ห้อง {targetRoomCode} มีตารางชน
                      </div>
                      <p className="text-[11px]">
                        ชนกับวิชา:{' '}
                        {targetRoomConflicts
                          .map(
                            (c) =>
                              `${c.eventCode} (${c.startTime}–${c.endTime})`,
                          )
                          .join(', ')}
                      </p>
                    </div>
                  )}

                  {scheduleError && (
                    <p
                      role="alert"
                      className="text-xs text-red-600 font-medium"
                    >
                      {scheduleError}
                    </p>
                  )}
                </div>

                {/* RIGHT COLUMN: Conflict-Aware Room Picker */}
                <div className="p-6 bg-surface-2/40 flex flex-col space-y-3 overflow-hidden">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                      เลือกห้องเรียน (ตรวจสอบเวลาว่างอัตโนมัติ)
                    </h4>
                    <p className="text-[11px] text-ink-3 mt-0.5">
                      แสดงสถานะห้องว่างตามวันและเวลาที่เลือกด้านซ้ายแบบเรียลไทม์
                    </p>
                  </div>

                  {/* Accessible RoomCombobox for keyboard search & quick jump when editing */}
                  {editingSlotId && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor={roomComboboxId}
                        className="block text-[11px] font-medium text-ink-2"
                      >
                        ย้ายไปห้อง
                      </label>
                      <RoomCombobox
                        id={roomComboboxId}
                        rooms={rooms}
                        currentRoomCode={modalSourceRoomCode}
                        value={targetRoomCode}
                        onChange={setTargetRoomCode}
                      />
                      {targetRoomCode !== modalSourceRoomCode && (
                        <p className="text-xs font-medium text-amber-800">
                          จะถูกย้ายจาก {modalSourceRoomCode} ไป {targetRoomCode}{' '}
                          เมื่อบันทึก
                        </p>
                      )}
                    </div>
                  )}

                  {/* Floor & Capacity Quick Filters */}
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="กรองชั้นในหน้าต่างเลือกห้อง"
                      value={pickerFloorFilter}
                      onChange={(e) =>
                        setPickerFloorFilter(
                          e.target.value === 'ALL'
                            ? 'ALL'
                            : Number(e.target.value),
                        )
                      }
                      className="input-boxed py-1.5 px-2 text-xs bg-surface"
                    >
                      <option value="ALL">ทุกชั้น</option>
                      {floors.map((f) => (
                        <option key={f} value={f}>
                          ชั้น {f}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      aria-label="ความจุขั้นต่ำ"
                      value={pickerMinCapacity}
                      onChange={(e) => setPickerMinCapacity(e.target.value)}
                      placeholder="ความจุขั้นต่ำ (ที่นั่ง)"
                      className="input-boxed py-1.5 px-2 text-xs bg-surface"
                    />
                  </div>

                  {/* Interactive Conflict-Aware Candidate Room Cards */}
                  <div className="flex-1 max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {pickerRooms.map((room) => {
                      const conflicts =
                        candidateRoomConflictsMap.get(room.code) || []
                      const hasConflict = conflicts.length > 0
                      const isSelected = targetRoomCode === room.code

                      return (
                        <button
                          key={room.code}
                          type="button"
                          onClick={() => setTargetRoomCode(room.code)}
                          className={`w-full text-left p-2.5 border transition-colors flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'border-ink ring-1 ring-ink bg-surface'
                              : 'border-line-soft bg-surface hover:bg-surface-2'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-ink">
                                {room.code}
                              </span>
                              <span className="text-[10px] text-ink-3">
                                ชั้น {room.floor}
                              </span>
                              {room.capacity !== undefined && (
                                <span className="text-[10px] text-ink-2">
                                  · {room.capacity} ที่นั่ง
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-ink-2 truncate">
                              {room.nameThai || getCategoryLabel(room.category)}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {hasConflict ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                ชน: {conflicts[0].eventCode} (
                                {conflicts[0].startTime}–{conflicts[0].endTime})
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ว่าง
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3.5 border-t border-line bg-surface flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={closeScheduleModal}
                  className="btn btn-secondary py-2 px-5 text-xs"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={scheduleSaving}
                  className="btn btn-primary py-2 px-6 text-xs"
                >
                  {scheduleSaving
                    ? 'กำลังบันทึก...'
                    : editingSlotId
                      ? 'บันทึกการแก้ไข'
                      : 'บันทึกตารางสอน'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
