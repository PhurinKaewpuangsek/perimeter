import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, Table, X } from '@phosphor-icons/react'
import type { ScheduleSlot } from '../types/schedule'
import {
  TIMETABLE_DAYS,
  type TimetableDay,
  buildTimetableLayout,
  formatMinutes,
} from '../services/timetableLayout'
import {
  THAI_DAY_COLORS,
  buildClassColorMap,
  entryColors,
  getSlotClassKey,
  slotKey,
} from '../services/timetableColors'
import { getExamDateLabel } from '../services/scheduleDisplay'

export interface TuRegTimetableProps {
  slots: ScheduleSlot[]
  renderActions?: (slot: ScheduleSlot) => ReactNode
  colorMap?: Map<string, string>
  selectedSlot?: ScheduleSlot | null
  onSelectSlot?: (slot: ScheduleSlot | null) => void
}

export interface TuRegTimetableModalProps {
  isOpen: boolean
  onClose: () => void
  slots: ScheduleSlot[]
  title?: string
  roomCode?: string
  renderActions?: (slot: ScheduleSlot) => ReactNode
}

export interface TuGreatTimetableProps {
  slots: ScheduleSlot[]
  renderActions?: (slot: ScheduleSlot) => ReactNode
  colorMap?: Map<string, string>
  title?: string
  roomCode?: string
  isModal?: boolean
}

/** Standard reg.tu.ac.th schedule starts at 07:00 and ends at 21:00 (14 hours) */
const DEFAULT_START_HOUR = 7
const DEFAULT_END_HOUR = 21

/** TU Great 7-Day Order (Sunday to Saturday, authentic TU Great order) */
const TU_GREAT_DAYS: { key: TimetableDay; name: string }[] = [
  { key: 'SUN', name: 'อาทิตย์' },
  { key: 'MON', name: 'จันทร์' },
  { key: 'TUE', name: 'อังคาร' },
  { key: 'WED', name: 'พุธ' },
  { key: 'THU', name: 'พฤหัส' },
  { key: 'FRI', name: 'ศุกร์' },
  { key: 'SAT', name: 'เสาร์' },
]

/** 5 Major time marks (every 3 hours) to eliminate mobile text collisions: 08:00, 11:00, 14:00, 17:00, 20:00 */
const TU_GREAT_TIME_MARKS = [
  { time: '08:00', percent: 0, transform: 'translateX(0)' },
  { time: '11:00', percent: 25, transform: 'translateX(-50%)' },
  { time: '14:00', percent: 50, transform: 'translateX(-50%)' },
  { time: '17:00', percent: 75, transform: 'translateX(-50%)' },
  { time: '20:00', percent: 100, transform: 'translateX(-100%)' },
]

/** Compact Thai Day abbreviations */
const COMPACT_DAY_LABELS: Record<TimetableDay, string> = {
  MON: 'จ',
  TUE: 'อ',
  WED: 'พ',
  THU: 'พฤ',
  FRI: 'ศ',
  SAT: 'ส',
  SUN: 'อา',
}

/** Parse "HH:MM" into total minutes from midnight */
function parseTimeToMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(/[:.]/).map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Exam line for details card */
function examText(slot: ScheduleSlot): string | null {
  const label = getExamDateLabel(slot)
  if (!label) return null
  return slot.eventDate ? `วันสอบ: ${slot.eventDate}` : label
}

interface CourseGroup {
  classKey: string
  eventCode: string
  eventName: string
  roomCode?: string
  slots: ScheduleSlot[]
  colorClass: string
}

/**
 * Mobile-first Timetable matching the official "TU Great" app:
 * 1. Mini Week Overview Grid at top:
 *    - 08:00 to 20:00 (8 columns) with Sunday to Saturday rows
 *    - Colored pill bars showing course scheduled times without horizontal scrolling
 * 2. Grouped Course Cards below:
 *    - Thick left accent bar with matching course color
 *    - Course code, course name, section / room
 *    - Multiple meeting times grouped cleanly with Day, Time, and 📍 Location Pin
 */
export function TuGreatTimetable({
  slots,
  renderActions,
  colorMap: externalColorMap,
  title,
  roomCode,
  isModal,
}: TuGreatTimetableProps) {
  const [selectedClassKey, setSelectedClassKey] = useState<string | null>(null)

  const colorMap = useMemo(
    () => externalColorMap ?? buildClassColorMap(slots),
    [externalColorMap, slots]
  )

  // Map slots by day of week
  const slotsByDay = useMemo(() => {
    const map: Record<TimetableDay, ScheduleSlot[]> = {
      SUN: [],
      MON: [],
      TUE: [],
      WED: [],
      THU: [],
      FRI: [],
      SAT: [],
    }

    for (const slot of slots) {
      const day = slot.dayOfWeek as TimetableDay
      if (TIMETABLE_DAYS.includes(day)) {
        map[day].push(slot)
      }
    }
    return map
  }, [slots])

  // Group slots by course / event
  const courseGroups = useMemo(() => {
    const map = new Map<string, CourseGroup>()

    for (const slot of slots) {
      const key = getSlotClassKey(slot)
      if (!map.has(key)) {
        map.set(key, {
          classKey: key,
          eventCode: slot.eventCode || key,
          eventName: slot.eventName || slot.eventCode || key,
          roomCode: slot.roomCode,
          slots: [],
          colorClass: entryColors(slot, colorMap),
        })
      }
      const group = map.get(key)!
      group.slots.push(slot)
      if (!group.roomCode && slot.roomCode) {
        group.roomCode = slot.roomCode
      }
    }

    const dayOrder: Record<string, number> = {
      SUN: 0,
      MON: 1,
      TUE: 2,
      WED: 3,
      THU: 4,
      FRI: 5,
      SAT: 6,
    }

    const groups = Array.from(map.values())
    for (const g of groups) {
      g.slots.sort((a, b) => {
        const dDiff = (dayOrder[a.dayOfWeek] ?? 99) - (dayOrder[b.dayOfWeek] ?? 99)
        if (dDiff !== 0) return dDiff
        return a.startTime.localeCompare(b.startTime)
      })
    }

    // Sort groups by earliest meeting day & time
    groups.sort((a, b) => {
      const aFirst = a.slots[0]
      const bFirst = b.slots[0]
      if (!aFirst || !bFirst) return 0
      const dDiff = (dayOrder[aFirst.dayOfWeek] ?? 99) - (dayOrder[bFirst.dayOfWeek] ?? 99)
      if (dDiff !== 0) return dDiff
      return aFirst.startTime.localeCompare(bFirst.startTime)
    })

    return groups
  }, [slots, colorMap])

  // Fixed 08:00 to 20:00 timeline (480 min to 1200 min = 720 min total)
  const timelineStart = 480
  const timelineEnd = 1200
  const totalMinutes = timelineEnd - timelineStart

  function handleSelectCourse(classKey: string) {
    setSelectedClassKey((prev) => (prev === classKey ? null : classKey))
    const el = document.getElementById(`tu-course-${classKey}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  const displaySubtitle = roomCode ? `ห้อง ${roomCode}` : title || 'LC3, Thammasat Rangsit'

  return (
    <div data-testid="tu-great-timetable" className="space-y-4 max-w-2xl mx-auto">
      {/* Header section in TU Great style: only shown when standalone, omitted inside modal */}
      {!isModal && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl sm:text-2xl font-bold text-ink">
              ตารางเรียน
            </h3>
            <p className="text-xs text-ink-3 mt-0.5">
              {displaySubtitle} · {slots.length} คาบ
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-surface-2 px-3 py-1 font-mono text-xs sm:text-sm font-bold text-ink border border-line-soft select-none">
              1/2569
            </span>
          </div>
        </div>
      )}

      {/* Mini Visual Week Overview Grid (TU Great style, zero horizontal scroll!) */}
      <div className="space-y-1">
        {/* Time Marks Header (08:00 to 20:00, 5 collision-free intervals) */}
        <div className="flex items-center text-[10px] sm:text-[11px] font-mono text-ink-3 pb-0.5 select-none">
          <div className="w-12 sm:w-14 shrink-0" />
          <div className="relative flex-1 h-4">
            {TU_GREAT_TIME_MARKS.map(({ time, percent, transform }) => (
              <span
                key={time}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${percent}%`,
                  transform,
                }}
              >
                {time}
              </span>
            ))}
          </div>
        </div>

        {/* 7 Day Matrix */}
        <div className="rounded-xl border border-line-soft bg-white overflow-hidden divide-y divide-line-soft/80 shadow-xs">
          {TU_GREAT_DAYS.map(({ key, name }) => {
            const daySlots = slotsByDay[key] || []

            return (
              <div key={key} className="flex items-center h-7 sm:h-8">
                {/* Day Label */}
                <div className="w-12 sm:w-14 shrink-0 px-1 text-[11px] sm:text-xs font-medium text-ink-2 text-center select-none">
                  {name}
                </div>

                {/* 8-column visual timeline */}
                <div className="relative flex-1 h-full border-l border-line-soft">
                  {/* Background grid vertical lines */}
                  <div
                    className="absolute inset-0 grid grid-cols-8 pointer-events-none"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="border-r border-line-soft/50 last:border-r-0 h-full"
                      />
                    ))}
                  </div>

                  {/* Course Colored Pills */}
                  {daySlots.map((slot) => {
                    const startMin = parseTimeToMinutes(slot.startTime)
                    const endMin = parseTimeToMinutes(slot.endTime)
                    const leftPercent = Math.max(
                      0,
                      Math.min(100, ((startMin - timelineStart) / totalMinutes) * 100)
                    )
                    const widthPercent = Math.max(
                      3.5,
                      Math.min(100 - leftPercent, ((endMin - startMin) / totalMinutes) * 100)
                    )
                    const classKey = getSlotClassKey(slot)
                    const isSelected = selectedClassKey === classKey

                    return (
                      <button
                        key={slotKey(slot)}
                        type="button"
                        onClick={() => handleSelectCourse(classKey)}
                        aria-label={`${slot.eventCode} ${slot.startTime}–${slot.endTime}`}
                        className={`absolute top-1/2 -translate-y-1/2 h-2.5 sm:h-3 rounded-full cursor-pointer transition-all hover:scale-110 active:scale-95 ${entryColors(
                          slot,
                          colorMap
                        )} ${
                          isSelected
                            ? 'ring-2 ring-ink ring-offset-1 scale-105 z-20 shadow-md'
                            : 'z-10'
                        }`}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                        title={`${slot.eventCode} (${slot.startTime}–${slot.endTime})`}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Course Cards List (grouped by subject in TU Great layout) */}
      <div className="space-y-2 sm:space-y-3 pt-1 sm:pt-2">
        {courseGroups.length > 0 ? (
          courseGroups.map((group) => {
            const isSelected = selectedClassKey === group.classKey

            return (
              <div
                key={group.classKey}
                id={`tu-course-${group.classKey}`}
                onClick={() => setSelectedClassKey(isSelected ? null : group.classKey)}
                className={`rounded-xl border bg-white p-2.5 sm:p-3 shadow-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'border-ink/40 ring-2 ring-ink/10 shadow-md'
                    : 'border-line-soft hover:border-line'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Thick Vertical Accent Color Stripe */}
                  <div
                    className={`w-1 self-stretch rounded-full shrink-0 min-h-[36px] ${group.colorClass}`}
                    aria-hidden="true"
                  />

                  {/* Course Information */}
                  <div className="flex-1 min-w-0">
                    {/* Header Row: Course Code & Section/Room */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm sm:text-base font-bold text-ink">
                        {group.eventCode}
                      </span>
                      <span className="text-[11px] sm:text-xs font-medium text-ink-3">
                        {group.roomCode ? `ห้อง ${group.roomCode}` : 'กลุ่มเรียน'}
                      </span>
                    </div>

                    {/* Course Title: only display if genuinely distinct from event code */}
                    {group.eventName &&
                      group.eventName.replace(/[\s\-_.]+/g, '').toUpperCase() !==
                        group.eventCode.replace(/[\s\-_.]+/g, '').toUpperCase() && (
                        <p className="text-xs font-medium text-ink-2 mt-0.5 line-clamp-1">
                          {group.eventName}
                        </p>
                      )}

                    {/* Meeting Sessions */}
                    <div className="mt-2 divide-y divide-line-soft/60 space-y-1.5">
                      {group.slots.map((slot, idx) => {
                        const dayMeta = THAI_DAY_COLORS[slot.dayOfWeek as TimetableDay]
                        const exam = examText(slot)

                        return (
                          <div key={idx} className={idx > 0 ? 'pt-1.5' : ''}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* Day & Time */}
                                <span className="font-bold text-xs text-ink shrink-0">
                                  {dayMeta?.name || slot.dayOfWeek}
                                </span>
                                <span className="font-mono text-xs text-ink-2 shrink-0">
                                  {slot.startTime} – {slot.endTime}
                                </span>
                                {slot.roomCode && slot.roomCode !== roomCode && (
                                  <span className="truncate text-[11px] text-ink-3">
                                    ห้อง {slot.roomCode}
                                  </span>
                                )}
                              </div>

                              {/* Action buttons (Pin, Google Calendar) */}
                              {renderActions && (
                                <div
                                  className="shrink-0 flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {renderActions(slot)}
                                </div>
                              )}
                            </div>

                            {/* Exam Date Badge */}
                            {exam && (
                              <div className="mt-1 inline-block rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink">
                                {exam}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-line-soft bg-white p-6 text-center text-xs text-ink-3">
            ไม่มีคาบเรียนในสัปดาห์นี้
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Full Weekly Timetable rendered in official reg.tu.ac.th wide table style:
 * - Days as rows (Monday to Sunday) with official Thai day color bars
 * - Time as horizontal columns (07:00 to 21:00)
 * - Multi-lane sub-rows when classes on the same day overlap
 */
export function TuRegTimetable({
  slots,
  renderActions,
  colorMap: externalColorMap,
  selectedSlot: externalSelectedSlot,
  onSelectSlot: externalOnSelectSlot,
}: TuRegTimetableProps) {
  const [userDismissed, setUserDismissed] = useState(false)
  const [internalSelectedSlot, setInternalSelectedSlot] = useState<ScheduleSlot | null>(null)
  const selectedSlot =
    externalSelectedSlot !== undefined
      ? externalSelectedSlot
      : internalSelectedSlot ?? (slots.length === 1 && !userDismissed ? slots[0] : null)
  const handleSelectSlot = (slot: ScheduleSlot | null) => {
    if (slot === null) {
      setUserDismissed(true)
    } else {
      setUserDismissed(false)
    }
    if (externalOnSelectSlot) {
      externalOnSelectSlot(slot)
    } else {
      setInternalSelectedSlot(slot)
    }
  }
  const selectedCardRef = useRef<HTMLDivElement>(null)

  const layout = useMemo(() => buildTimetableLayout(slots), [slots])
  const colorMap = useMemo(
    () => externalColorMap ?? buildClassColorMap(slots),
    [externalColorMap, slots]
  )

  // Automatically scroll down smoothly to bring the selected slot details card into view
  useEffect(() => {
    if (selectedSlot) {
      const timer = setTimeout(() => {
        selectedCardRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [selectedSlot])

  // Calculate dynamic start/end hours bounded by standard 07:00 - 21:00
  const startHour = Math.min(
    DEFAULT_START_HOUR,
    layout.startMinute > 0 ? Math.floor(layout.startMinute / 60) : DEFAULT_START_HOUR
  )
  const endHour = Math.max(
    DEFAULT_END_HOUR,
    layout.endMinute > 0 ? Math.ceil(layout.endMinute / 60) : DEFAULT_END_HOUR
  )

  const timelineStart = startHour * 60
  const timelineEnd = endHour * 60
  const totalMinutes = timelineEnd - timelineStart
  const totalHours = endHour - startHour

  const hours: number[] = []
  for (let h = startHour; h < endHour; h++) {
    hours.push(h)
  }

  return (
    <div data-testid="tu-reg-timetable" className="space-y-3">
      {/* Timetable Card Wrapper */}
      <div className="overflow-hidden rounded-xl border border-line-soft bg-white shadow-xs">
        {/* Header Row: Days / Hours */}
        <div className="flex border-b border-line-soft bg-surface-2 text-xs font-bold text-ink-2 select-none">
          {/* Top-left cell: วัน/เวลา */}
          <div className="w-14 sm:w-24 shrink-0 border-r border-line-soft px-1 sm:px-2 py-2 flex items-center justify-center text-center font-bold sticky left-0 z-20 bg-surface-2 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
            <span className="text-[11px] sm:text-xs">วัน/เวลา</span>
          </div>

          {/* Hour Columns: e.g. 7:00 / 8:00 */}
          <div
            className="flex-1 grid"
            style={{ gridTemplateColumns: `repeat(${totalHours}, minmax(0, 1fr))` }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="border-r border-line-soft last:border-r-0 py-1.5 px-0.5 text-center leading-tight font-mono text-[11px]"
              >
                <div className="font-semibold text-ink">{h}:00</div>
                <div className="text-[10px] text-ink-3">{h + 1}:00</div>
              </div>
            ))}
          </div>
        </div>

        {/* Day Rows */}
        <div className="divide-y divide-line-soft">
          {TIMETABLE_DAYS.map((day) => {
            const daySlots = layout.days[day]
            const maxLane = daySlots.length === 0 ? 0 : Math.max(...daySlots.map((s) => s.lane))
            const laneCount = maxLane + 1
            const dayMeta = THAI_DAY_COLORS[day]

            return (
              <div key={day} className="flex min-w-0">
                {/* Left Day Header Cell (Sticky on horizontal scroll with elevation shadow) */}
                <div
                  className="w-14 sm:w-24 shrink-0 flex border-r border-line-soft bg-white sticky left-0 z-10 select-none shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]"
                  style={{ minHeight: `${laneCount * 64}px` }}
                >
                  {/* Thai Day Color Stripe on left edge */}
                  <div
                    className="w-1.5 sm:w-2 shrink-0 h-full"
                    style={{ backgroundColor: dayMeta.hex }}
                    aria-hidden="true"
                  />
                  {/* Day Name: short on mobile, full on desktop */}
                  <div className="flex-1 flex flex-col items-center justify-center p-1 sm:p-2 text-center">
                    <span className="font-bold text-xs text-ink sm:hidden">
                      {COMPACT_DAY_LABELS[day]}
                    </span>
                    <span className="font-bold text-xs text-ink hidden sm:inline">
                      {dayMeta.name}
                    </span>
                    {daySlots.length > 0 && (
                      <span className="text-[9px] sm:text-[10px] text-ink-3 font-medium">
                        ({daySlots.length})
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Timeline Area: multi-lane sub-rows if overlapping */}
                <div className="flex-1 flex flex-col divide-y divide-line-soft/60 min-w-0">
                  {Array.from({ length: laneCount }).map((_, laneIdx) => {
                    const laneSlots = daySlots.filter((s) => s.lane === laneIdx)
                    return (
                      <div
                        key={laneIdx}
                        className="relative h-16 min-h-[64px] w-full"
                      >
                        {/* Background Grid Lines (1 vertical line per hour column) */}
                        <div
                          className="absolute inset-0 grid pointer-events-none"
                          style={{ gridTemplateColumns: `repeat(${totalHours}, minmax(0, 1fr))` }}
                          aria-hidden="true"
                        >
                          {hours.map((h, i) => (
                            <div
                              key={h}
                              className={`border-r border-line-soft/40 h-full ${
                                i === hours.length - 1 ? 'border-r-0' : ''
                              }`}
                            />
                          ))}
                        </div>

                        {/* Placed Schedule Cards in this lane */}
                        {laneSlots.map((item) => {
                          const leftPercent =
                            ((item.startMinute - timelineStart) / totalMinutes) * 100
                          const widthPercent =
                            ((item.endMinute - item.startMinute) / totalMinutes) * 100
                          const isSelected =
                            selectedSlot !== null &&
                            slotKey(selectedSlot) === slotKey(item.slot)

                          return (
                            <button
                              key={`${item.slot.eventCode}-${item.startMinute}`}
                              type="button"
                              onClick={() => handleSelectSlot(isSelected ? null : item.slot)}
                              aria-pressed={isSelected}
                              className={`timetable-card absolute inset-y-1 overflow-hidden rounded-xl px-2 py-1 text-left shadow-xs cursor-pointer transition-all hover:scale-[1.01] hover:brightness-95 ${
                                isSelected ? 'ring-2 ring-white z-20 shadow-md' : 'z-10'
                              } ${entryColors(item.slot, colorMap)}`}
                              style={{
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`,
                              }}
                              title={`${item.slot.eventCode} ${
                                item.slot.eventName ? `(${item.slot.eventName})` : ''
                              } ${formatMinutes(item.startMinute)}–${formatMinutes(
                                item.endMinute
                              )}`}
                            >
                              <p className="truncate font-mono text-xs font-bold text-white leading-tight">
                                {item.slot.eventCode}
                              </p>
                              {(item.slot.eventName || item.slot.roomCode) && (
                                <p className="truncate text-[11px] font-medium text-white/90 leading-tight mt-0.5">
                                  {item.slot.roomCode || item.slot.eventName}
                                </p>
                              )}
                              <p className="truncate font-mono text-[10px] text-white/80 leading-tight mt-0.5">
                                {formatMinutes(item.startMinute)}–{formatMinutes(item.endMinute)}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Reg.tu authentic footnote */}
      <p className="text-xs text-ink-3 italic">
        หมายเหตุ: ข้อมูลที่แสดงคือรหัสวิชา กลุ่ม อาคารและห้องเรียนตามลำดับ
      </p>

      {/* Selected Slot Details Card (with action buttons: Pin, Google Calendar) */}
      {selectedSlot && (
        <div
          ref={selectedCardRef}
          data-testid="tu-reg-selected-card"
          className={`timetable-card rounded-xl p-3 shadow-xs animate-fade-in ${entryColors(
            selectedSlot,
            colorMap
          )}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-white">
                  {selectedSlot.eventCode}
                </span>
                {selectedSlot.roomCode && (
                  <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs font-medium text-white">
                    ห้อง {selectedSlot.roomCode}
                  </span>
                )}
              </div>
              {selectedSlot.eventName && selectedSlot.eventName !== selectedSlot.eventCode && (
                <p className="truncate text-xs text-white/90 mt-0.5">{selectedSlot.eventName}</p>
              )}
              <p className="mt-0.5 font-mono text-xs text-white/80">
                {selectedSlot.dayOfWeek} {selectedSlot.startTime}–{selectedSlot.endTime}
              </p>
              {examText(selectedSlot) && (
                <p className="mt-0.5 text-xs font-bold text-white">{examText(selectedSlot)}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {renderActions && (
                <div className="flex items-center gap-1">{renderActions(selectedSlot)}</div>
              )}
              <button
                type="button"
                onClick={() => handleSelectSlot(null)}
                aria-label="ปิดรายละเอียด"
                className="btn btn-ghost btn-icon-sm text-white/80 hover:text-white"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Modal dialog that displays the weekly timetable:
 * - PC / Desktop layout (>= 640px): exclusively displays the classic full grid (07:00–21:00)
 * - Mobile layout (< 640px): exclusively displays the TU Great layout
 */
export function TuRegTimetableModal({
  isOpen,
  onClose,
  slots,
  title,
  roomCode,
  renderActions,
}: TuRegTimetableModalProps) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close with Escape key
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || typeof document === 'undefined') return null

  const displayTitle = title || (roomCode ? `ห้อง ${roomCode}` : 'ตารางเรียนทั้งสัปดาห์')

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tu-reg-modal-title"
      className="fixed inset-0 z-2002 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6"
    >
      {/* Backdrop */}
      <div
        data-testid="tu-reg-modal-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-fade-in"
      />

      {/* Modal Dialog Content: Full width on PC to comfortably fit 07:00–21:00 without horizontal scrolling */}
      <div className="relative z-10 flex h-[94vh] sm:h-auto sm:max-h-[92vh] w-full sm:w-[95vw] max-w-6xl xl:max-w-7xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-modal overflow-hidden animate-modal-mobile sm:animate-modal-desktop">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line-soft px-3.5 sm:px-5 py-3 sm:py-3.5 bg-white gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-tertiary text-ink">
              <Table size={18} weight="bold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  id="tu-reg-modal-title"
                  className="font-display text-sm sm:text-h3-sm font-bold text-ink truncate"
                >
                  ตารางเรียนทั้งสัปดาห์
                </h2>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] sm:text-xs font-bold text-ink border border-line-soft select-none shrink-0">
                  1/2569
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-ink-3 truncate">
                {displayTitle} · {slots.length} คาบ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              data-testid="close-tu-reg-modal"
              aria-label="ปิดหน้าต่างตารางสัปดาห์"
              className="btn btn-ghost btn-icon-sm"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Scrollable Body:
            - Mobile: exclusively displays TuGreatTimetable
            - PC: displays full-width TuRegTimetable without horizontal scroll and with hidden vertical scrollbar */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar p-3 sm:p-5">
          {isMobile ? (
            <TuGreatTimetable
              slots={slots}
              renderActions={renderActions}
              title={title}
              roomCode={roomCode}
              isModal={true}
            />
          ) : (
            <div className="w-full min-w-0">
              <TuRegTimetable slots={slots} renderActions={renderActions} />
            </div>
          )}
        </div>

        {/* Footer: Hidden on mobile (< sm) to reclaim 52px of screen space */}
        <div className="hidden sm:flex shrink-0 items-center justify-between border-t border-line-soft px-3.5 sm:px-5 py-2.5 sm:py-3 bg-surface-2 text-xs text-ink-3">
          <div className="flex items-center gap-1.5">
            <Calendar size={14} weight="bold" className="text-ink-2 shrink-0" />
            <span className="text-[11px] sm:text-xs">
              {isMobile
                ? `แสดงผลรูปแบบ TU Great · ${slots.length} คาบ`
                : 'แสดงผลวันจันทร์ถึงวันอาทิตย์ (07:00–21:00)'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default TuRegTimetable
