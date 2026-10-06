/**
 * AdminPage — Overhauled unified admin console under the Perimeter brand.
 * Route: /admin (security by obscurity for V2).
 *
 * Refined design features:
 * 1. Perimeter Brand Theme: Soft slate pill with pulsing rose dot matching
 *    the Perimeter logo palette.
 * 2. Uncluttered Room List: Removed redundant room code boxes; clear typographic
 *    hierarchy with room numbers, Thai titles, and category badges.
 * 3. Functional Horizontal Scrollbars: Category and Day filter strips now feature
 *    visible thin scrollbars (.thin-scrollbar) and mouse-wheel horizontal scrolling.
 * 4. Ergonomic Room Edit Header: Prominent room title, category, and persistent
 *    back button; removed unused "ดูบนแผนที่" button.
 * 5. Bottom-Left Collapsed Pill: Repositioned floating pinned room pill to bottom-left
 *    (bottom-6 left-6) for unobstructed map exploration.
 */
import { useState, useCallback, useMemo, useRef, createElement } from 'react'
import { Link } from 'react-router-dom'
import {
  CaretLeft,
  CaretRight,
  X,
  MapPin,
  Calendar,
  Clock,
  Users,
  Check,
  PencilSimple,
  Trash,
  Plus,
  Warning,
  FloppyDisk,
  MagnifyingGlass,
  ArrowSquareOut,
  Door,
  Sparkle,
} from '@phosphor-icons/react'
import { useRooms } from '../hooks/useRooms'
import { useSchedules } from '../hooks/useSchedules'
import { usePreloadImages } from '../hooks/usePreloadImages'
import MapContainer from './map/MapContainer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import LoadingScreen from './LoadingScreen'
import type { Room } from '../types/room'
import type { ScheduleSlot } from '../types/schedule'
import {
  updateRoom,
  deleteRoom,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../services/adminService'
import {
  getCategoryLabel,
  getLandmarkText,
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
} from '../services/roomDisplay'
import { CATEGORY_FILTERS } from '../services/filterRooms'
import { getCategoryIcon } from './categoryIcon'
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'

// ---------------------------------------------------------------------------
// Constants & Day Color Configurations (mirrors /map standard)
// ---------------------------------------------------------------------------

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((c) => c.asset)

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
  const label = getCategoryLabel(category)
  const color = CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR
  const Icon = getCategoryIcon(category, nameThai)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${color.bg} ${color.text} border ${color.border} shadow-2xs`}
    >
      {createElement(Icon, { size: 13, weight: 'duotone' })}
      <span>{label}</span>
    </span>
  )
}

function EventTypeBadge({ type }: { type?: string }) {
  const lower = (type || '').toLowerCase()
  if (lower === 'lab') {
    return (
      <span className="inline-flex items-center rounded-md bg-lime-50 px-2 py-0.5 text-[10px] font-medium text-lime-700 border border-lime-200/70">
        แลป
      </span>
    )
  }
  if (lower === 'exam') {
    return (
      <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 border border-rose-200/70">
        สอบ
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 border border-violet-200/70">
      บรรยาย
    </span>
  )
}

// ---------------------------------------------------------------------------
// Search Box Subcomponent
// ---------------------------------------------------------------------------

function AdminSearchBox({
  value,
  onChange,
  placeholder = 'ค้นหาห้อง...',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative flex items-center w-full">
      <div className="pointer-events-none absolute left-3 flex items-center text-slate-400">
        <MagnifyingGlass size={16} weight="bold" />
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200/90 bg-white py-2 pl-9 pr-8 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-2xs transition-all [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          aria-label="ล้างคำค้นหา"
        >
          <X size={12} weight="bold" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Room List Item Row (Uncluttered, crisp hierarchy)
// ---------------------------------------------------------------------------

function RoomListItem({
  room,
  scheduleCount,
  isSelected,
  onSelect,
}: {
  room: Room
  scheduleCount: number
  isSelected: boolean
  onSelect: (roomId: string) => void
}) {
  const roomDisplayName = room.roomNumber ? `ห้อง ${room.roomNumber}` : room.nameThai || room.code
  const hasDistinctThaiName = room.nameThai && room.nameThai !== roomDisplayName

  return (
    <button
      type="button"
      onClick={() => onSelect(room.id)}
      className={`group flex w-full flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
        isSelected
          ? 'border-slate-900 bg-slate-50/90 shadow-xs ring-1 ring-slate-900/10'
          : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
      }`}
    >
      {/* Header Row: Room Title + Floor Badge + Caret */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-xs font-bold text-slate-900 group-hover:text-rose-600 transition-colors">
            {roomDisplayName}
          </span>
          <span className="shrink-0 rounded-md bg-slate-100 border border-slate-200/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            ชั้น {room.floor}
          </span>
          {room.code && room.roomNumber && room.code !== room.roomNumber && (
            <span className="shrink-0 font-mono text-[11px] text-slate-400">
              ({room.code})
            </span>
          )}
        </div>
        <CaretRight
          size={14}
          weight="bold"
          className="shrink-0 text-slate-300 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all ml-1"
        />
      </div>

      {/* Optional distinct Thai Subtitle */}
      {hasDistinctThaiName && (
        <p className="truncate text-xs text-slate-500 font-normal">
          {room.nameThai}
        </p>
      )}

      {/* Badges Row: Category + Capacity + Schedule Count */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <RoomCategoryBadge category={room.category} nameThai={room.nameThai} />
        {room.capacity !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200/60 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            <Users size={11} />
            {room.capacity} คน
          </span>
        )}
        {scheduleCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200/60 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            <Calendar size={11} />
            {scheduleCount} คาบ
          </span>
        )}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Schedule Row Subcomponent (with inline editor)
// ---------------------------------------------------------------------------

interface ScheduleRowProps {
  slot: ScheduleSlot & { schedule_slot: string }
  onDelete: () => Promise<void>
  onEdit: (updated: Partial<Pick<ScheduleSlot, 'dayOfWeek' | 'startTime' | 'eventCode' | 'endTime' | 'eventName' | 'eventType'>>) => Promise<void>
}

function ScheduleRow({ slot, onDelete, onEdit }: ScheduleRowProps) {
  const [editing, setEditing] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState(slot.dayOfWeek)
  const [startTime, setStartTime] = useState(slot.startTime)
  const [eventCode, setEventCode] = useState(slot.eventCode)
  const [endTime, setEndTime] = useState(slot.endTime)
  const [eventName, setEventName] = useState(slot.eventName)
  const [eventType, setEventType] = useState(slot.eventType)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const dayInfo = getDayInfo(slot.dayOfWeek)

  async function handleDelete() {
    if (!window.confirm(`ยืนยันการลบตาราง ${slot.eventCode} (${slot.dayOfWeek} ${slot.startTime})?`)) {
      return
    }
    setSaving(true)
    setErr(null)
    try {
      await onDelete()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
      setSaving(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setErr(null)
    try {
      await onEdit({ dayOfWeek, startTime, eventCode, endTime, eventName, eventType })
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-slate-300 bg-slate-50/70 p-3.5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900">แก้ไขข้อมูลตาราง</span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        {err && <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">{err}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">วัน</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
                <option key={d} value={d}>
                  {getDayInfo(d).th} ({d})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">รหัสวิชา</label>
            <input
              type="text"
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">เวลาเริ่ม (HH:MM)</label>
            <input
              type="text"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="09:00"
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">เวลาสิ้นสุด (HH:MM)</label>
            <input
              type="text"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="12:00"
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">ชื่อวิชา</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">ประเภท</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="lecture">บรรยาย (Lecture)</option>
              <option value="lab">ปฏิบัติการ (Lab)</option>
              <option value="exam">การสอบ (Exam)</option>
              <option value="other">อื่นๆ (Other)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs hover:border-slate-300 transition-all">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${dayInfo.bgLight} ${dayInfo.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dayInfo.dotColor}`} />
            {dayInfo.shortTh}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-slate-500">
            <Clock size={12} />
            {slot.startTime}–{slot.endTime}
          </span>
          <EventTypeBadge type={slot.eventType} />
        </div>
        <div className="mt-1">
          <span className="font-mono text-xs font-bold text-slate-900">{slot.eventCode}</span>
          {slot.eventName && (
            <span className="text-xs text-slate-600 ml-1.5 truncate">
              · {slot.eventName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer transition-colors"
          title="แก้ไขตาราง"
          aria-label="แก้ไขตาราง"
        >
          <PencilSimple size={14} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors disabled:opacity-50"
          title="ลบตาราง"
          aria-label="ลบตาราง"
        >
          <Trash size={14} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Schedule Form Subcomponent
// ---------------------------------------------------------------------------

interface CreateScheduleFormProps {
  roomCode: string
  onCreated: () => void
  onCancel: () => void
}

function CreateScheduleForm({ roomCode, onCreated, onCancel }: CreateScheduleFormProps) {
  const [dayOfWeek, setDayOfWeek] = useState('MON')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [eventCode, setEventCode] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState('lecture')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      await createSchedule({
        room_code: roomCode,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        event_code: eventCode,
        event_name: eventName,
        event_type: eventType,
      })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาดในการสร้างตาราง')
    } finally {
      setSaving(false)
    }
  }

  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 bg-slate-50/70 p-3.5 space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Plus size={14} weight="bold" />
          เพิ่มตารางสอนใหม่
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {err && <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">{err}</p>}

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            วัน <span className="text-rose-500">*</span>
          </label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {getDayInfo(d).th} ({d})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            รหัสวิชา <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value)}
            placeholder="CS333"
            required
            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            เวลาเริ่ม <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="09:00"
            required
            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">เวลาสิ้นสุด</label>
          <input
            type="text"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="12:00"
            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">ชื่อวิชา</label>
          <input
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Computer Networks"
            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">ประเภท</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="lecture">บรรยาย (Lecture)</option>
            <option value="lab">ปฏิบัติการ (Lab)</option>
            <option value="exam">การสอบ (Exam)</option>
            <option value="other">อื่นๆ (Other)</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer disabled:opacity-50"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 cursor-pointer disabled:opacity-50"
        >
          {saving ? 'กำลังเพิ่ม...' : '+ บันทึกตารางสอน'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Room Edit Panel (Left Panel when room is selected)
// ---------------------------------------------------------------------------

interface RoomEditPanelProps {
  room: Room
  schedules: ScheduleSlot[]
  onBack: () => void
  onRoomDeleted: () => void
  onRoomMutated: () => void
  onSchedulesMutated: () => void
}

function RoomEditPanel({
  room,
  schedules,
  onBack,
  onRoomDeleted,
  onRoomMutated,
  onSchedulesMutated,
}: RoomEditPanelProps) {
  const [nameInput, setNameInput] = useState(room.nameThai)
  const [capacityInput, setCapacityInput] = useState(
    room.capacity !== undefined ? String(room.capacity) : '',
  )
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isAddingSchedule, setIsAddingSchedule] = useState(false)
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all')

  // Filter schedule slots for this room
  const roomSchedules = useMemo(() => {
    return schedules
      .filter((s) => s.roomCode === room.code)
      .map((s) => ({
        ...s,
        schedule_slot: `${s.dayOfWeek}#${s.startTime}#${s.eventCode}`,
      }))
  }, [schedules, room.code])

  // Filtered schedules for day pill selection
  const displayedSchedules = useMemo(() => {
    if (selectedDayFilter === 'all') return roomSchedules
    return roomSchedules.filter((s) => s.dayOfWeek.toUpperCase() === selectedDayFilter.toUpperCase())
  }, [roomSchedules, selectedDayFilter])

  // Unique days that exist in this room's schedules
  const availableDays = useMemo(() => {
    const set = new Set<string>()
    roomSchedules.forEach((s) => set.add(s.dayOfWeek.toUpperCase()))
    return Array.from(set).sort((a, b) => getDayInfo(a).order - getDayInfo(b).order)
  }, [roomSchedules])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveErr(null)
    setSaveOk(false)
    try {
      const parsed = capacityInput.trim() !== '' ? Number(capacityInput) : undefined
      await updateRoom(room.id, {
        name_th: nameInput,
        ...(parsed !== undefined && !isNaN(parsed) ? { capacity: parsed } : {}),
      })
      setSaveOk(true)
      onRoomMutated()
      setTimeout(() => setSaveOk(false), 4000)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาดในการบันทึก')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteRoom(room.id)
      onRoomDeleted()
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'ลบห้องไม่สำเร็จ')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleScheduleEdit(
    slot: ScheduleSlot & { schedule_slot: string },
    updated: Partial<Pick<ScheduleSlot, 'dayOfWeek' | 'startTime' | 'eventCode' | 'endTime' | 'eventName' | 'eventType'>>,
  ) {
    await updateSchedule(room.code, slot.schedule_slot, {
      day_of_week: updated.dayOfWeek,
      start_time: updated.startTime,
      event_code: updated.eventCode,
      end_time: updated.endTime,
      event_name: updated.eventName,
      event_type: updated.eventType,
    })
    onSchedulesMutated()
  }

  async function handleScheduleDelete(slot: ScheduleSlot & { schedule_slot: string }) {
    await deleteSchedule(room.code, slot.schedule_slot)
    onSchedulesMutated()
  }

  const landmarkText =
    room.landmarks && room.landmarks.length > 0
      ? room.landmarks.map((l) => getLandmarkText(l)).join(' · ')
      : ''
  const roomDisplayName = room.roomNumber ? `ห้อง ${room.roomNumber}` : room.nameThai || room.code

  return (
    <div className="space-y-4">
      {/* Room Hero Header with Persistent Back Button */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
        {/* Back Button & Floor */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
          >
            <CaretLeft size={14} weight="bold" />
            <span>กลับไปรายการห้อง</span>
          </button>
          <span className="rounded-md bg-slate-100 border border-slate-200/60 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
            อาคาร LC3 · ชั้น {room.floor}
          </span>
        </div>

        {/* Room Title */}
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{roomDisplayName}</h2>
            <span className="font-mono text-xs text-slate-400 font-semibold">({room.code})</span>
          </div>
          {room.nameThai && room.nameThai !== roomDisplayName && (
            <p className="mt-0.5 text-xs font-medium text-slate-500">{room.nameThai}</p>
          )}
        </div>

        {/* Category & Landmark */}
        <div className="flex flex-wrap items-center gap-2">
          <RoomCategoryBadge category={room.category} nameThai={room.nameThai} />
          {room.capacity !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200/60 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
              <Users size={12} weight="regular" />
              ความจุ {room.capacity} ที่นั่ง
            </span>
          )}
        </div>

        {landmarkText && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 flex items-start gap-2 text-xs text-slate-600">
            <MapPin size={15} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />
            <span className="leading-snug">{landmarkText}</span>
          </div>
        )}
      </div>

      {/* Section 1: Room Details Form */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            แก้ไขข้อมูลห้อง
          </h3>
          <span className="text-[11px] text-slate-400">ID: {room.id}</span>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {saveErr && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
              {saveErr}
            </div>
          )}
          {saveOk && (
            <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-semibold text-emerald-700">
              <Check size={15} weight="bold" />
              <span>บันทึกข้อมูลห้องสำเร็จเรียบร้อย</span>
            </div>
          )}

          <div>
            <label htmlFor="admin-room-name" className="block text-xs font-semibold text-slate-700 mb-1">
              ชื่อห้องภาษาไทย (name_th)
            </label>
            <input
              id="admin-room-name"
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value)
                setSaveOk(false)
              }}
              placeholder="เช่น ห้องบรรยายเรียนรวม"
              className="w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-2xs transition-all"
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="admin-room-capacity" className="block text-xs font-semibold text-slate-700 mb-1">
              ความจุที่นั่ง (คน)
            </label>
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute left-3 flex items-center text-slate-400">
                <Users size={15} />
              </div>
              <input
                id="admin-room-capacity"
                type="number"
                min="0"
                value={capacityInput}
                onChange={(e) => {
                  setCapacityInput(e.target.value)
                  setSaveOk(false)
                }}
                placeholder="ไม่ระบุความจุ"
                className="w-full rounded-xl border border-slate-200/90 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-2xs transition-all"
                disabled={saving}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            <FloppyDisk size={15} weight="bold" />
            <span>{saving ? 'กำลังบันทึกข้อมูล...' : 'บันทึกข้อมูลห้อง'}</span>
          </button>
        </form>
      </div>

      {/* Section 2: Room Schedule Management */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              ตารางการใช้ห้อง
            </h3>
            <p className="text-[11px] text-slate-500">มีทั้งหมด {roomSchedules.length} คาบ</p>
          </div>

          {!isAddingSchedule && (
            <button
              type="button"
              onClick={() => setIsAddingSchedule(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-100 border border-slate-200/80 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Plus size={14} weight="bold" />
              <span>เพิ่มตาราง</span>
            </button>
          )}
        </div>

        {/* Add schedule inline form */}
        {isAddingSchedule && (
          <CreateScheduleForm
            roomCode={room.code}
            onCreated={() => {
              setIsAddingSchedule(false)
              onSchedulesMutated()
            }}
            onCancel={() => setIsAddingSchedule(false)}
          />
        )}

        {/* Day filter pills for room (with visible thin-scrollbar and mouse-wheel horizontal scrolling) */}
        {availableDays.length > 1 && (
          <div
            className="flex items-center gap-1.5 overflow-x-auto thin-scrollbar pb-2 pt-0.5"
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY
              }
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedDayFilter('all')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                selectedDayFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ทั้งหมด ({roomSchedules.length})
            </button>
            {availableDays.map((d) => {
              const info = getDayInfo(d)
              const count = roomSchedules.filter((s) => s.dayOfWeek.toUpperCase() === d).length
              const isActive = selectedDayFilter.toUpperCase() === d
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDayFilter(d)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${info.dotColor}`} />
                  <span>
                    {info.shortTh} ({count})
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Schedules list */}
        {displayedSchedules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-xs text-slate-400">ยังไม่มีตารางสอนสำหรับห้องนี้</p>
            {!isAddingSchedule && (
              <button
                type="button"
                onClick={() => setIsAddingSchedule(true)}
                className="mt-2 text-xs font-semibold text-slate-700 hover:underline cursor-pointer"
              >
                + เพิ่มตารางสอนแรก
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {displayedSchedules.map((slot) => (
              <ScheduleRow
                key={slot.schedule_slot}
                slot={slot}
                onDelete={() => handleScheduleDelete(slot)}
                onEdit={(updated) => handleScheduleEdit(slot, updated)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Danger Zone */}
      <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-rose-800">
          <Warning size={16} weight="bold" />
          <h3 className="text-xs font-bold uppercase tracking-wide">Danger Zone</h3>
        </div>
        <p className="text-xs text-slate-600">
          การลบห้องจะลบข้อมูลออกจากระบบผังอาคารและฐานข้อมูลอย่างถาวร
        </p>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-xl border border-rose-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 shadow-2xs cursor-pointer transition-colors"
          >
            ลบห้องนี้…
          </button>
        ) : (
          <div className="rounded-xl border border-rose-200 bg-white p-3 space-y-2 shadow-xs">
            <p className="text-xs font-bold text-rose-800">
              ยืนยันการลบห้อง <span className="font-mono">{room.code}</span>?
            </p>
            <p className="text-[11px] text-rose-600">ข้อมูลที่ถูกลบไม่สามารถกู้คืนได้</p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-xl px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// All Schedules Explorer View
// ---------------------------------------------------------------------------

function AllSchedulesView({
  schedules,
  rooms,
  onSelectRoom,
}: {
  schedules: ScheduleSlot[]
  rooms: Room[]
  onSelectRoom: (roomId: string) => void
}) {
  const [search, setSearch] = useState('')
  const [dayFilter, setDayFilter] = useState('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return schedules.filter((s) => {
      const matchSearch =
        !q ||
        s.roomCode.toLowerCase().includes(q) ||
        s.eventCode.toLowerCase().includes(q) ||
        s.eventName.toLowerCase().includes(q)

      const matchDay = dayFilter === 'all' || s.dayOfWeek.toUpperCase() === dayFilter.toUpperCase()

      return matchSearch && matchDay
    })
  }, [schedules, search, dayFilter])

  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          สำรวจตารางเวลาทั้งหมด ({filtered.length} / {schedules.length})
        </h2>
      </div>

      <AdminSearchBox
        value={search}
        onChange={setSearch}
        placeholder="ค้นหารหัสวิชา, ชื่อวิชา, หรือห้อง เช่น CS333..."
      />

      {/* Day quick-filters (with visible thin-scrollbar and mouse-wheel horizontal scrolling) */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto thin-scrollbar pb-2 pt-0.5"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY
          }
        }}
      >
        <button
          type="button"
          onClick={() => setDayFilter('all')}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
            dayFilter === 'all'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          ทั้งหมด
        </button>
        {DAYS.map((d) => {
          const info = getDayInfo(d)
          const count = schedules.filter((s) => s.dayOfWeek.toUpperCase() === d).length
          if (count === 0) return null
          const isActive = dayFilter === d
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDayFilter(d)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${info.dotColor}`} />
              <span>
                {info.shortTh} ({count})
              </span>
            </button>
          )
        })}
      </div>

      {/* Card list of schedules */}
      <div className="space-y-2">
        {filtered.map((s, idx) => {
          const room = rooms.find((r) => r.code === s.roomCode)
          const dayInfo = getDayInfo(s.dayOfWeek)
          return (
            <div
              key={`${s.roomCode}-${s.dayOfWeek}-${s.startTime}-${s.eventCode}-${idx}`}
              className="group rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs hover:border-slate-300 transition-all flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${dayInfo.bgLight} ${dayInfo.color}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${dayInfo.dotColor}`} />
                    {dayInfo.shortTh}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-slate-500">
                    <Clock size={12} />
                    {s.startTime}–{s.endTime}
                  </span>
                  <EventTypeBadge type={s.eventType} />
                </div>
                <div className="mt-1">
                  <span className="font-mono text-xs font-bold text-slate-900">{s.eventCode}</span>
                  {s.eventName && (
                    <span className="text-xs text-slate-600 ml-1.5 truncate">
                      · {s.eventName}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                  <Door size={12} />
                  <span>
                    ห้อง <strong className="text-slate-700">{s.roomCode}</strong>
                    {room?.floor && ` · ชั้น ${room.floor}`}
                    {room?.nameThai && ` (${room.nameThai})`}
                  </span>
                </div>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => room && onSelectRoom(room.id)}
                  disabled={!room}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition-colors cursor-pointer disabled:opacity-40"
                  title="เปิดหน้าแก้ไขห้องนี้"
                >
                  <span>จัดการ</span>
                  <CaretRight size={13} weight="bold" />
                </button>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <p className="text-xs text-slate-400">ไม่พบตารางที่ตรงกับเงื่อนไขการค้นหา</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main AdminPage Component
// ---------------------------------------------------------------------------

type LeftPanelMode = 'list' | 'room'
type LeftTab = 'rooms' | 'schedules'

export default function AdminPage() {
  const { rooms, loading: roomsLoading, error: roomsError, reload: reloadRooms } = useRooms()
  const {
    schedules,
    loading: schedulesLoading,
    error: schedulesError,
    reload: reloadSchedules,
  } = useSchedules()
  const floorPlansReady = usePreloadImages(FLOOR_PLAN_ASSETS)

  const [panelMode, setPanelMode] = useState<LeftPanelMode>('list')
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [currentFloor, setCurrentFloor] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [leftTab, setLeftTab] = useState<LeftTab>('rooms')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [floorFilter, setFloorFilter] = useState<'all' | '1' | '2'>('all')
  const [categoryFilterKey, setCategoryFilterKey] = useState<string>('all')

  const sidebarScrollRef = useRef<HTMLDivElement>(null)

  const selectedRoom = useMemo(() => {
    return rooms.find((r) => r.id === selectedRoomId) ?? null
  }, [rooms, selectedRoomId])

  // Count schedules per room
  const scheduleCountByRoom = useMemo(() => {
    const map = new Map<string, number>()
    schedules.forEach((s) => {
      map.set(s.roomCode, (map.get(s.roomCode) ?? 0) + 1)
    })
    return map
  }, [schedules])

  const handleAdminSelectRoom = useCallback(
    (roomId: string) => {
      setSelectedRoomId(roomId)
      setPanelMode('room')
      setIsSidebarCollapsed(false)
      const room = rooms.find((r) => r.id === roomId)
      if (room && room.floor !== currentFloor) {
        setCurrentFloor(room.floor)
      }
      if (sidebarScrollRef.current) {
        sidebarScrollRef.current.scrollTop = 0
      }
    },
    [rooms, currentFloor],
  )

  function handleBack() {
    setPanelMode('list')
    setSelectedRoomId(null)
    if (sidebarScrollRef.current) {
      sidebarScrollRef.current.scrollTop = 0
    }
  }

  function handleRoomDeleted() {
    setPanelMode('list')
    setSelectedRoomId(null)
    reloadRooms(true)
  }

  // Filtered rooms logic
  const filteredRooms = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const activeCategory = CATEGORY_FILTERS.find((c) => c.key === categoryFilterKey)

    return rooms.filter((r) => {
      // 1. Search query
      const matchSearch =
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.nameThai.toLowerCase().includes(q) ||
        r.roomNumber.toLowerCase().includes(q)

      // 2. Floor filter
      const matchFloor = floorFilter === 'all' || String(r.floor) === floorFilter

      // 3. Category filter
      let matchCat = true
      if (activeCategory && activeCategory.matchCategories.length > 0) {
        matchCat = activeCategory.matchCategories.includes(r.category)
      }

      return matchSearch && matchFloor && matchCat
    })
  }, [rooms, searchQuery, floorFilter, categoryFilterKey])

  const floor1Count = useMemo(() => rooms.filter((r) => r.floor === 1).length, [rooms])
  const floor2Count = useMemo(() => rooms.filter((r) => r.floor === 2).length, [rooms])

  if (roomsError) {
    return <LoadingScreen error={roomsError} onRetry={reloadRooms} />
  }
  if (roomsLoading || !floorPlansReady) return <LoadingScreen />

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-slate-100 font-sans select-none">
      {/* ------------------------------------------------------------------ */}
      {/* Background Interactive Floor Plan Workspace                        */}
      {/* ------------------------------------------------------------------ */}
      <MapContainer
        rooms={rooms}
        currentFloor={currentFloor}
        onFloorChange={setCurrentFloor}
        selectedRoomId={selectedRoomId}
        onSelectRoom={handleAdminSelectRoom}
        onClearSelection={() => {
          // Keep selection stable in admin mode unless back button is explicitly clicked
        }}
        mode="admin"
      />

      {/* ------------------------------------------------------------------ */}
      {/* Floating Collapsible Left Sidebar (Docked Panel standard)          */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={`pointer-events-none absolute top-0 left-0 bottom-0 z-30 w-full sm:w-[440px] md:w-[460px] transition-transform duration-300 ease-in-out ${
          isSidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        <div className="relative pointer-events-auto flex flex-col h-full bg-white shadow-2xl border-r border-slate-200/90">
          {/* Collapse / Expand Toggle Tab on right border of sidebar */}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            aria-label={isSidebarCollapsed ? 'ขยายแผงจัดการ' : 'ซ่อนแผงจัดการ'}
            title={isSidebarCollapsed ? 'ขยายแผงจัดการ' : 'ซ่อนแผงจัดการ'}
            className="absolute top-3.5 -right-8 z-30 flex h-8 w-8 items-center justify-center rounded-r-xl bg-white border-y border-r border-slate-200 text-slate-500 shadow-md hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all cursor-pointer"
          >
            <CaretLeft
              size={16}
              weight="bold"
              className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Header Bar with Perimeter Logo & Subtle Admin Badge */}
          <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-slate-200/80 bg-white">
            <div className="flex items-center gap-2">
              <img
                src={perimeterLogoNoBg}
                alt="Perimeter"
                className="h-10 sm:h-11 w-auto object-contain cursor-pointer hover:opacity-90 transition-opacity drop-shadow-xs"
                onClick={() => {
                  setPanelMode('list')
                  setSelectedRoomId(null)
                  setLeftTab('rooms')
                }}
                title="คลิกเพื่อรีเซ็ตหน้าจอ"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-extrabold tracking-tight text-rose-600 select-none">
                Admin Console
              </span>
              <Link
                to="/map"
                title="ไปยังหน้าแผนที่ผู้ใช้ทั่วไป (Public Map)"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <ArrowSquareOut size={16} weight="bold" />
              </Link>
            </div>
          </div>

          {/* View Tab Switcher: ห้องและพื้นที่ vs ตารางเวลาทั้งหมด */}
          <div className="p-3 border-b border-slate-200/80 bg-slate-50/60">
            <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1">
              <button
                type="button"
                onClick={() => {
                  setLeftTab('rooms')
                  setPanelMode('list')
                  setSelectedRoomId(null)
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  leftTab === 'rooms'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Door size={14} weight="duotone" />
                <span>ห้องและพื้นที่</span>
                <span className="ml-0.5 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                  {rooms.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setLeftTab('schedules')}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  leftTab === 'schedules'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Calendar size={14} weight="duotone" />
                <span>ตารางเวลาทั้งหมด</span>
                <span className="ml-0.5 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                  {schedules.length}
                </span>
              </button>
            </div>
          </div>

          {/* Main Sidebar Scrollable Content */}
          <div ref={sidebarScrollRef} className="flex-1 overflow-y-auto thin-scrollbar p-4 space-y-4">
            {leftTab === 'schedules' ? (
              schedulesLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                  <div className="h-6 w-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-xs">กำลังโหลดตารางสอน...</p>
                </div>
              ) : schedulesError ? (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  โหลดตารางไม่สำเร็จ: {schedulesError.message}
                </div>
              ) : (
                <AllSchedulesView
                  schedules={schedules}
                  rooms={rooms}
                  onSelectRoom={(roomId) => {
                    handleAdminSelectRoom(roomId)
                    setLeftTab('rooms')
                  }}
                />
              )
            ) : panelMode === 'room' && selectedRoom ? (
              <RoomEditPanel
                key={selectedRoom.id}
                room={selectedRoom}
                schedules={schedules}
                onBack={handleBack}
                onRoomDeleted={handleRoomDeleted}
                onRoomMutated={() => reloadRooms(true)}
                onSchedulesMutated={() => reloadSchedules(true)}
              />
            ) : (
              /* ROOM LIST MODE */
              <div className="space-y-3.5">
                {/* Search Bar */}
                <AdminSearchBox
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="ค้นหาด้วยเลขห้อง, ชื่อ หรือรหัส เช่น 110, ELEC..."
                />

                {/* Floor Filter Quick Pills (syncs with map floor) */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFloorFilter('all')}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                      floorFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ทั้งหมด ({rooms.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFloorFilter('1')
                      if (currentFloor !== 1) setCurrentFloor(1)
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                      floorFilter === '1'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ชั้น 1 ({floor1Count})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFloorFilter('2')
                      if (currentFloor !== 2) setCurrentFloor(2)
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                      floorFilter === '2'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ชั้น 2 ({floor2Count})
                  </button>
                </div>

                {/* Category Filters Pills Horizontal Strip (with visible thin-scrollbar and mouse-wheel horizontal scrolling) */}
                <div
                  className="flex items-center gap-1.5 overflow-x-auto thin-scrollbar pb-2 pt-0.5"
                  onWheel={(e) => {
                    if (e.deltaY !== 0) {
                      e.currentTarget.scrollLeft += e.deltaY
                    }
                  }}
                >
                  {CATEGORY_FILTERS.map((cat) => {
                    const isActive = categoryFilterKey === cat.key
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setCategoryFilterKey(cat.key)}
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-all cursor-pointer shrink-0 border ${
                          isActive
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>

                {/* Count indicator */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-0.5">
                  <span>แสดง {filteredRooms.length} ห้อง</span>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-slate-700 font-semibold hover:underline cursor-pointer"
                    >
                      ล้างคำค้น
                    </button>
                  )}
                </div>

                {/* Rooms List */}
                <div className="space-y-2">
                  {filteredRooms.map((room) => (
                    <RoomListItem
                      key={room.id}
                      room={room}
                      scheduleCount={scheduleCountByRoom.get(room.code) ?? 0}
                      isSelected={room.id === selectedRoomId}
                      onSelect={handleAdminSelectRoom}
                    />
                  ))}

                  {filteredRooms.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-2">
                        <Sparkle size={20} />
                      </div>
                      <p className="text-xs font-semibold text-slate-700">ไม่พบห้องที่ตรงกับการค้นหา</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองชั้นและหมวดหมู่
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Floating Pinned Room Pill when sidebar is collapsed (positioned at bottom-left) */}
      {isSidebarCollapsed && selectedRoom && (
        <div className="absolute bottom-6 left-6 z-20 flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md px-3.5 py-2.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
            <Door size={16} weight="duotone" />
          </div>
          <div className="min-w-0 pr-2">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              กำลังเลือก · ชั้น {selectedRoom.floor}
            </span>
            <span className="block truncate text-xs font-bold text-slate-900">
              {selectedRoom.roomNumber ? `ห้อง ${selectedRoom.roomNumber}` : selectedRoom.nameThai || selectedRoom.code}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors cursor-pointer shadow-xs active:scale-95"
          >
            เปิดแผงแก้ไข
          </button>
        </div>
      )}
    </main>
  )
}
