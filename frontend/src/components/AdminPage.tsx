/**
 * AdminPage — Overhauled unified admin console under the Perimeter brand.
 * Route: /admin (security by obscurity for V2).
 *
 * Refined design features:
 * 1. Perimeter Theme: light-only, Uber-inspired monochrome tokens and the
 *    recipes in src/index.css (docs/design/uber-designmd.md, #137).
 * 2. Uncluttered Room List: Removed redundant room code boxes; clear typographic
 *    hierarchy with room numbers, Thai titles, and category badges.
 * 3. Functional Horizontal Scrollbars: Category and Day filter strips now feature
 *    visible thin scrollbars (.thin-scrollbar) and mouse-wheel horizontal scrolling.
 * 4. Ergonomic Room Edit Header: Prominent room title, category, and persistent
 *    back button; removed unused "ดูบนแผนที่" button.
 * 5. Bottom-Left Collapsed Pill: Repositioned floating pinned room pill to bottom-left
 *    (bottom-6 left-6) for unobstructed map exploration.
 */
import { useState, useCallback, useMemo, useRef, useId, createElement } from 'react'
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
  Door,
  Sparkle,
} from '@phosphor-icons/react'
import { useRooms } from '../hooks/useRooms'
import { useSchedules } from '../hooks/useSchedules'
import { usePreloadImages } from '../hooks/usePreloadImages'
import MapContainer from './map/MapContainer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import LoadingScreen from './LoadingScreen'
import TopBar from './TopBar'
import type { Room } from '../types/room'
import type { ScheduleSlot } from '../types/schedule'
import {
  getSession,
  isAdmin,
} from '../services/authService'
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
  MON: { order: 1, th: 'วันจันทร์', shortTh: 'จันทร์', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  MONDAY: { order: 1, th: 'วันจันทร์', shortTh: 'จันทร์', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  TUE: { order: 2, th: 'วันอังคาร', shortTh: 'อังคาร', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  TUESDAY: { order: 2, th: 'วันอังคาร', shortTh: 'อังคาร', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  WED: { order: 3, th: 'วันพุธ', shortTh: 'พุธ', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  WEDNESDAY: { order: 3, th: 'วันพุธ', shortTh: 'พุธ', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  THU: { order: 4, th: 'วันพฤหัสบดี', shortTh: 'พฤหัสฯ', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  THURSDAY: { order: 4, th: 'วันพฤหัสบดี', shortTh: 'พฤหัสฯ', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  FRI: { order: 5, th: 'วันศุกร์', shortTh: 'ศุกร์', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  FRIDAY: { order: 5, th: 'วันศุกร์', shortTh: 'ศุกร์', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  SAT: { order: 6, th: 'วันเสาร์', shortTh: 'เสาร์', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  SATURDAY: { order: 6, th: 'วันเสาร์', shortTh: 'เสาร์', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  SUN: { order: 7, th: 'วันอาทิตย์', shortTh: 'อาทิตย์', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
  SUNDAY: { order: 7, th: 'วันอาทิตย์', shortTh: 'อาทิตย์', color: 'text-ink', dotColor: 'bg-current', bgLight: 'bg-white border-line-soft' },
}

function getDayInfo(rawDay: string): DayConfig {
  const upper = (rawDay || '').toUpperCase().trim()
  return (
    DAY_CONFIG[upper] ?? {
      order: 99,
      th: rawDay || 'ไม่ระบุวัน',
      shortTh: rawDay || 'ไม่ระบุ',
      color: 'text-ink-2',
      dotColor: 'bg-current',
      bgLight: 'bg-surface-2 border-line-soft',
    }
  )
}

function RoomCategoryBadge({ category, nameThai }: { category: string; nameThai?: string }) {
  const label = getCategoryLabel(category)
  const color = CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR
  const Icon = getCategoryIcon(category, nameThai)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${color.bg} ${color.text} border ${color.border}`}
    >
      {createElement(Icon, { size: 13, weight: 'duotone' })}
      <span>{label}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Event date (exam/event rows)
// ---------------------------------------------------------------------------

/** Event types that happen on one calendar date, so the form asks for event_date. */
const DATED_EVENT_TYPES = ['exam', 'other']

function isDatedEventType(type: string | undefined): boolean {
  return DATED_EVENT_TYPES.includes((type || '').toLowerCase())
}

function isExamEventType(type: string | undefined): boolean {
  return (type || '').toLowerCase() === 'exam'
}

/** True when value is a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
function isValidEventDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Thai error message for the date field, or null when it can be saved. Mirrors the API rules. */
function getEventDateError(type: string, date: string): string | null {
  if (!isDatedEventType(type)) return null
  if (!date) return isExamEventType(type) ? 'กรุณาเลือกวันสอบ (จำเป็นสำหรับการสอบ)' : null
  if (!isValidEventDate(date)) return 'วันที่ไม่ถูกต้อง กรุณาเลือกวันที่จากปฏิทิน'
  return null
}

/** event_date value to send: the date for dated rows, otherwise undefined. */
function eventDateForPayload(type: string, date: string): string | undefined {
  return isDatedEventType(type) && date ? date : undefined
}

interface EventDateFieldProps {
  eventType: string
  value: string
  onChange: (value: string) => void
}

/** Date picker shown only for exam/event rows. */
function EventDateField({ eventType, value, onChange }: EventDateFieldProps) {
  const inputId = useId()
  if (!isDatedEventType(eventType)) return null
  const required = isExamEventType(eventType)
  return (
    <div className="col-span-2">
      <label htmlFor={inputId} className="label">
        {required ? 'วันสอบ' : 'วันที่จัด'}
        {required && <span className="text-ink-2"> *</span>}
      </label>
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="input-boxed font-mono"
      />
    </div>
  )
}

function EventTypeBadge({ type }: { type?: string }) {
  const lower = (type || '').toLowerCase()
  if (lower === 'lab') {
    return (
      <span className="chip">
        แลป
      </span>
    )
  }
  if (lower === 'exam') {
    return (
      <span className="chip">
        สอบ
      </span>
    )
  }
  return (
    <span className="chip">
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
      <div className="pointer-events-none absolute left-3 flex items-center text-ink-3">
        <MagnifyingGlass size={16} weight="bold" />
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-search max-sm:min-h-11 pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="btn btn-ghost btn-icon-sm absolute right-1"
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
      className={`group card flex w-full flex-col gap-1.5 p-3.5 text-left cursor-pointer ${
        isSelected
          ? 'border-accent'
          : 'card-hover hover:border-line'
      }`}
    >
      {/* Header Row: Room Title + Floor Badge + Caret */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-button font-bold text-ink">
            {roomDisplayName}
          </span>
          <span className="chip shrink-0">
            ชั้น {room.floor}
          </span>
          {room.code && room.roomNumber && room.code !== room.roomNumber && (
            <span className="shrink-0 font-mono text-xs text-ink-3">
              ({room.code})
            </span>
          )}
        </div>
        <CaretRight
          size={14}
          weight="bold"
          className="shrink-0 text-ink-3 group-hover:text-ink group-hover:translate-x-0.5 transition-all ml-1"
        />
      </div>

      {/* Optional distinct Thai Subtitle */}
      {hasDistinctThaiName && (
        <p className="truncate text-xs text-ink-3 font-normal">
          {room.nameThai}
        </p>
      )}

      {/* Badges Row: Category + Capacity + Schedule Count */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <RoomCategoryBadge category={room.category} nameThai={room.nameThai} />
        {room.capacity !== undefined && (
          <span className="chip">
            <Users size={11} />
            {room.capacity} คน
          </span>
        )}
        {scheduleCount > 0 && (
          <span className="chip">
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
  onEdit: (updated: Partial<Pick<ScheduleSlot, 'dayOfWeek' | 'startTime' | 'eventCode' | 'endTime' | 'eventName' | 'eventType' | 'eventDate'>>) => Promise<void>
  isAdmin?: boolean
}

function ScheduleRow({ slot, onDelete, onEdit, isAdmin = false }: ScheduleRowProps) {
  const [editing, setEditing] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState(slot.dayOfWeek)
  const [startTime, setStartTime] = useState(slot.startTime)
  const [eventCode, setEventCode] = useState(slot.eventCode)
  const [endTime, setEndTime] = useState(slot.endTime)
  const [eventName, setEventName] = useState(slot.eventName)
  const [eventType, setEventType] = useState(slot.eventType)
  const [eventDate, setEventDate] = useState(slot.eventDate ?? '')
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
    const dateError = getEventDateError(eventType, eventDate)
    if (dateError) {
      setErr(dateError)
      return
    }
    setSaving(true)
    setErr(null)
    try {
      await onEdit({ dayOfWeek, startTime, eventCode, endTime, eventName, eventType, eventDate })
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="surface p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-button font-bold text-ink">แก้ไขข้อมูลตาราง</span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="btn btn-ghost btn-icon-sm"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        {err && <p className="card border-ink p-3 text-button text-ink">{err}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="label">วัน</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="input-boxed"
            >
              {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
                <option key={d} value={d}>
                  {getDayInfo(d).th} ({d})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">รหัสวิชา</label>
            <input
              type="text"
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value)}
              className="input-boxed font-mono"
            />
          </div>
          <div>
            <label className="label">เวลาเริ่ม (HH:MM)</label>
            <input
              type="text"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="09:00"
              className="input-boxed font-mono"
            />
          </div>
          <div>
            <label className="label">เวลาสิ้นสุด (HH:MM)</label>
            <input
              type="text"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="12:00"
              className="input-boxed font-mono"
            />
          </div>
          <div className="col-span-2">
            <label className="label">ชื่อวิชา</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="input-boxed"
            />
          </div>
          <div className="col-span-2">
            <label className="label">ประเภท</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="input-boxed"
            >
              <option value="lecture">บรรยาย (Lecture)</option>
              <option value="lab">ปฏิบัติการ (Lab)</option>
              <option value="exam">การสอบ (Exam)</option>
              <option value="other">อื่นๆ (Other)</option>
            </select>
          </div>
          <EventDateField eventType={eventType} value={eventDate} onChange={setEventDate} />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="btn btn-secondary"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group card card-hover flex items-center justify-between gap-2 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`chip ${dayInfo.bgLight} ${dayInfo.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dayInfo.dotColor}`} />
            {dayInfo.shortTh}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-ink-3">
            <Clock size={12} />
            {slot.startTime}–{slot.endTime}
          </span>
          <EventTypeBadge type={slot.eventType} />
        </div>
        <div className="mt-1">
          <span className="font-mono text-button font-bold text-ink">{slot.eventCode}</span>
          {slot.eventName && (
            <span className="text-button text-ink-2 ml-1.5 truncate">
              · {slot.eventName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-ghost btn-icon-sm"
          title="แก้ไขตาราง"
          aria-label="แก้ไขตาราง"
        >
          <PencilSimple size={14} />
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="btn btn-ghost btn-icon-sm"
            title="ลบตาราง"
            aria-label="ลบตาราง"
          >
            <Trash size={14} />
          </button>
        )}
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
  const [eventDate, setEventDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const dateError = getEventDateError(eventType, eventDate)
    if (dateError) {
      setErr(dateError)
      return
    }
    const event_date = eventDateForPayload(eventType, eventDate)
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
        ...(event_date !== undefined ? { event_date } : {}),
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
    <form onSubmit={handleSubmit} className="surface p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-button font-bold text-ink flex items-center gap-1.5">
          <Plus size={14} weight="bold" />
          เพิ่มตารางสอนใหม่
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-icon-sm"
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {err && <p className="card border-ink p-3 text-button text-ink">{err}</p>}

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="label">
            วัน <span className="text-ink-2">*</span>
          </label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            className="input-boxed"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {getDayInfo(d).th} ({d})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">
            รหัสวิชา <span className="text-ink-2">*</span>
          </label>
          <input
            type="text"
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value)}
            placeholder="CS333"
            required
            className="input-boxed font-mono"
          />
        </div>
        <div>
          <label className="label">
            เวลาเริ่ม <span className="text-ink-2">*</span>
          </label>
          <input
            type="text"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="09:00"
            required
            className="input-boxed font-mono"
          />
        </div>
        <div>
          <label className="label">เวลาสิ้นสุด</label>
          <input
            type="text"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="12:00"
            className="input-boxed font-mono"
          />
        </div>
        <div className="col-span-2">
          <label className="label">ชื่อวิชา</label>
          <input
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Computer Networks"
            className="input-boxed"
          />
        </div>
        <div className="col-span-2">
          <label className="label">ประเภท</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="input-boxed"
          >
            <option value="lecture">บรรยาย (Lecture)</option>
            <option value="lab">ปฏิบัติการ (Lab)</option>
            <option value="exam">การสอบ (Exam)</option>
            <option value="other">อื่นๆ (Other)</option>
          </select>
        </div>
        <EventDateField eventType={eventType} value={eventDate} onChange={setEventDate} />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn btn-secondary"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving}
          className="btn btn-primary"
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
  isAdmin?: boolean
}

function RoomEditPanel({
  room,
  schedules,
  onBack,
  onRoomDeleted,
  onRoomMutated,
  onSchedulesMutated,
  isAdmin = false,
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
    updated: Partial<Pick<ScheduleSlot, 'dayOfWeek' | 'startTime' | 'eventCode' | 'endTime' | 'eventName' | 'eventType' | 'eventDate'>>,
  ) {
    const finalType = updated.eventType ?? slot.eventType
    const finalDate = updated.eventDate ?? slot.eventDate ?? ''
    await updateSchedule(room.code, slot.schedule_slot, {
      day_of_week: updated.dayOfWeek,
      start_time: updated.startTime,
      event_code: updated.eventCode,
      end_time: updated.endTime,
      event_name: updated.eventName,
      event_type: updated.eventType,
      // Dated rows send their date; other rows clear any stale date (null).
      event_date: eventDateForPayload(finalType, finalDate) ?? null,
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
      <div className="card p-4 space-y-3">
        {/* Back Button & Floor */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="btn btn-secondary btn-sm"
          >
            <CaretLeft size={14} weight="bold" />
            <span>กลับไปรายการห้อง</span>
          </button>
          <span className="chip">
            อาคาร LC3 · ชั้น {room.floor}
          </span>
        </div>

        {/* Room Title */}
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-h3 font-bold text-ink">{roomDisplayName}</h2>
            <span className="font-mono text-xs text-ink-3 font-medium">({room.code})</span>
          </div>
          {room.nameThai && room.nameThai !== roomDisplayName && (
            <p className="mt-0.5 text-button text-ink-2">{room.nameThai}</p>
          )}
        </div>

        {/* Category & Landmark */}
        <div className="flex flex-wrap items-center gap-2">
          <RoomCategoryBadge category={room.category} nameThai={room.nameThai} />
          {room.capacity !== undefined && (
            <span className="chip">
              <Users size={12} weight="regular" />
              ความจุ {room.capacity} ที่นั่ง
            </span>
          )}
        </div>

        {landmarkText && (
          <div className="surface p-3 flex items-start gap-2 text-button text-ink-2">
            <MapPin size={15} weight="fill" className="text-ink shrink-0 mt-0.5" />
            <span className="leading-snug">{landmarkText}</span>
          </div>
        )}
      </div>

      {/* Section 1: Room Details Form */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-h3-sm font-bold text-ink">
            แก้ไขข้อมูลห้อง
          </h3>
          <span className="text-xs text-ink-3">ID: {room.id}</span>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {saveErr && (
            <div className="card border-ink p-3 text-button text-ink">
              {saveErr}
            </div>
          )}
          {saveOk && (
            <div className="card flex items-center gap-1.5 p-3 text-button font-medium text-ink">
              <Check size={15} weight="bold" />
              <span>บันทึกข้อมูลห้องสำเร็จเรียบร้อย</span>
            </div>
          )}

          <div>
            <label htmlFor="admin-room-name" className="label">
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
              className="input-boxed"
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="admin-room-capacity" className="label">
              ความจุที่นั่ง (คน)
            </label>
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute left-3 flex items-center text-ink-3">
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
                className="input-boxed pl-9"
                disabled={saving}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary w-full"
          >
            <FloppyDisk size={15} weight="bold" />
            <span>{saving ? 'กำลังบันทึกข้อมูล...' : 'บันทึกข้อมูลห้อง'}</span>
          </button>
        </form>
      </div>

      {/* Section 2: Room Schedule Management */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-h3-sm font-bold text-ink">
              ตารางการใช้ห้อง
            </h3>
            <p className="text-xs text-ink-3">มีทั้งหมด {roomSchedules.length} คาบ</p>
          </div>

          {!isAddingSchedule && (
            <button
              type="button"
              onClick={() => setIsAddingSchedule(true)}
              className="btn btn-tertiary btn-sm"
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
              className={`btn btn-sm shrink-0 ${
                selectedDayFilter === 'all'
                  ? 'btn-primary'
                  : 'btn-tertiary'
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
                  className={`btn btn-sm shrink-0 ${
                    isActive
                      ? 'btn-primary'
                      : 'btn-tertiary'
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
          <div className="card border-dashed p-6 text-center">
            <p className="text-button text-ink-3">ยังไม่มีตารางสอนสำหรับห้องนี้</p>
            {!isAddingSchedule && (
              <button
                type="button"
                onClick={() => setIsAddingSchedule(true)}
                className="btn btn-ghost btn-sm mt-2"
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
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Danger Zone (Admin Only) */}
      {isAdmin && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 text-ink">
            <Warning size={16} weight="bold" />
            <h3 className="font-display text-h3-sm font-bold">Danger Zone</h3>
          </div>
          <p className="text-button text-ink-2">
            การลบห้องจะลบข้อมูลออกจากระบบผังอาคารและฐานข้อมูลอย่างถาวร
          </p>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn btn-secondary"
            >
              ลบห้องนี้…
            </button>
          ) : (
            <div className="card p-3 space-y-2">
              <p className="text-button font-bold text-ink">
                ยืนยันการลบห้อง <span className="font-mono">{room.code}</span>?
              </p>
              <p className="text-xs text-ink-3">ข้อมูลที่ถูกลบไม่สามารถกู้คืนได้</p>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="btn btn-ghost"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn btn-secondary"
                >
                  {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
        <h2 className="font-display text-h3-sm font-bold text-ink">
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
          className={`btn btn-sm shrink-0 ${
            dayFilter === 'all'
              ? 'btn-primary'
              : 'btn-tertiary'
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
              className={`btn btn-sm shrink-0 ${
                isActive
                  ? 'btn-primary'
                  : 'btn-tertiary'
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
              className="group card card-hover p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`chip ${dayInfo.bgLight} ${dayInfo.color}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${dayInfo.dotColor}`} />
                    {dayInfo.shortTh}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-ink-3">
                    <Clock size={12} />
                    {s.startTime}–{s.endTime}
                  </span>
                  <EventTypeBadge type={s.eventType} />
                </div>
                <div className="mt-1">
                  <span className="font-mono text-button font-bold text-ink">{s.eventCode}</span>
                  {s.eventName && (
                    <span className="text-button text-ink-2 ml-1.5 truncate">
                      · {s.eventName}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-ink-3 flex items-center gap-1">
                  <Door size={12} />
                  <span>
                    ห้อง <strong className="text-ink">{s.roomCode}</strong>
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
                  className="btn btn-tertiary btn-sm"
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
          <div className="card border-dashed p-8 text-center">
            <p className="text-button text-ink-3">ไม่พบตารางที่ตรงกับเงื่อนไขการค้นหา</p>
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
  const session = getSession()

  const isUserAdmin = useMemo(() => isAdmin(session), [session])

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
  const [mapView, setMapView] = useState<'2d' | '3d'>('3d')
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
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-surface-2 select-none">
      {/* Shared Figma-Style Spatial TopBar */}
      <TopBar
        sidebarWidth={460}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        currentFloor={currentFloor}
        onFloorChange={setCurrentFloor}
        mapView={mapView}
        onToggleMapView={() => setMapView((prev) => (prev === '3d' ? '2d' : '3d'))}
      />

      {/* Map area below the fixed 64px TopBar: map, sidebar and floating panels */}
      <div className="absolute inset-x-0 top-16 bottom-0 overflow-hidden">
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
          sidebarWidth={isSidebarCollapsed ? 0 : 460}
          viewMode={mapView}
          onViewModeChange={setMapView}
          hideBottomControls
        />

        {/* ------------------------------------------------------------------ */}
        {/* Docked Full-Height Left Sidebar                                     */}
        {/* ------------------------------------------------------------------ */}
        <aside
          className={`pointer-events-none absolute top-0 left-0 bottom-0 z-2 w-full sm:w-[440px] md:w-[460px] transition-transform duration-300 ease-in-out ${
            isSidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
          }`}
        >
          <div className="relative pointer-events-auto flex flex-col h-full bg-white border-r border-line-soft">
            {/* View Tab Switcher: ห้องและพื้นที่ vs ตารางเวลาทั้งหมด */}
            <div className="shrink-0 p-3 border-b border-line-soft bg-white">
              <div className="flex gap-1 rounded-full bg-surface-2 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setLeftTab('rooms')
                    setPanelMode('list')
                    setSelectedRoomId(null)
                  }}
                  className={`btn btn-sm flex-1 ${
                    leftTab === 'rooms'
                      ? 'btn-primary'
                      : 'btn-ghost'
                  }`}
                >
                  <Door size={14} weight="duotone" />
                  <span>ห้องและพื้นที่</span>
                  <span className="ml-0.5 rounded-full bg-white px-1.5 py-0.5 text-xs font-medium text-ink">
                    {rooms.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLeftTab('schedules')}
                  className={`btn btn-sm flex-1 ${
                    leftTab === 'schedules'
                      ? 'btn-primary'
                      : 'btn-ghost'
                  }`}
                >
                  <Calendar size={14} weight="duotone" />
                  <span>ตารางเวลาทั้งหมด</span>
                  <span className="ml-0.5 rounded-full bg-white px-1.5 py-0.5 text-xs font-medium text-ink">
                    {schedules.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Sticky Search & Filter Header (Only in Room List mode — never scrolls away or clips!) */}
            {leftTab === 'rooms' && !(panelMode === 'room' && selectedRoom) && (
              <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-line-soft bg-white space-y-2.5">
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
                    className={`btn btn-sm ${
                      floorFilter === 'all'
                        ? 'btn-primary'
                        : 'btn-tertiary'
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
                    className={`btn btn-sm ${
                      floorFilter === '1'
                        ? 'btn-primary'
                        : 'btn-tertiary'
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
                    className={`btn btn-sm ${
                      floorFilter === '2'
                        ? 'btn-primary'
                        : 'btn-tertiary'
                    }`}
                  >
                    ชั้น 2 ({floor2Count})
                  </button>
                </div>

                {/* Category Filters Pills Horizontal Strip (with visible thin-scrollbar and mouse-wheel horizontal scrolling) */}
                <div
                  className="flex items-center gap-1.5 overflow-x-auto thin-scrollbar pb-1.5 pt-0.5"
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
                        className={`btn btn-sm shrink-0 ${
                          isActive
                            ? 'btn-primary'
                            : 'btn-tertiary'
                        }`}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>

                {/* Count indicator */}
                <div className="flex items-center justify-between text-xs text-ink-3 font-medium px-0.5">
                  <span>แสดง {filteredRooms.length} ห้อง</span>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="btn btn-ghost btn-sm"
                    >
                      ล้างคำค้น
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Main Sidebar Scrollable Content */}
            <div ref={sidebarScrollRef} className="flex-1 overflow-y-auto thin-scrollbar p-4 space-y-4">
              {leftTab === 'schedules' ? (
                schedulesLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-ink-3">
                    <div className="h-6 w-6 border-2 border-ink border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-xs">กำลังโหลดตารางสอน...</p>
                  </div>
                ) : schedulesError ? (
                  <div className="card border-ink p-3 text-button text-ink">
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
                  isAdmin={isUserAdmin}
                />
              ) : (
                /* ROOM LIST MODE */
                <div className="space-y-2.5">
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
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tertiary text-ink-3 mb-2">
                          <Sparkle size={20} />
                        </div>
                        <p className="text-button font-medium text-ink">ไม่พบห้องที่ตรงกับการค้นหา</p>
                        <p className="text-xs text-ink-3 mt-0.5">
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
          <div className="card absolute bottom-6 left-6 z-2 flex items-center gap-3 px-3.5 py-2.5 shadow-floating animate-fade-in">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white">
              <Door size={16} weight="duotone" />
            </div>
            <div className="min-w-0 pr-2">
              <span className="block text-xs font-medium text-ink-3">
                กำลังเลือก · ชั้น {selectedRoom.floor}
              </span>
              <span className="block truncate text-button font-bold text-ink">
                {selectedRoom.roomNumber ? `ห้อง ${selectedRoom.roomNumber}` : selectedRoom.nameThai || selectedRoom.code}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="btn btn-primary btn-sm"
            >
              เปิดแผงแก้ไข
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
