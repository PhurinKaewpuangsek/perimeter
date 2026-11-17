import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, Table, X } from '@phosphor-icons/react'
import type { ScheduleSlot } from '../types/schedule'
import {
  TIMETABLE_DAYS,
  type TimetableDay,
  buildTimetableLayout,
  formatMinutes,
  normalizeDay,
} from '../services/timetableLayout'
import { THAI_DAY_COLORS, buildClassColorMap, entryColors, slotKey } from '../services/timetableColors'
import {
  formatExamDateTime,
  formatLocalDate,
  formatThaiShortDate,
  getExamDateLabel,
  getSlotDisplayLabel,
  isExamSchedule,
} from '../services/scheduleDisplay'
import {
  USAGE_KIND_LABELS,
  getSlotsForWeek,
  getUsageKind,
  getWeekDays,
  getWeekStart,
  type WeekDay,
} from '../services/roomWeek'
import { WeekNavigator } from './RoomWeekControls'

export interface TuRegTimetableProps {
  slots: ScheduleSlot[]
  renderActions?: (slot: ScheduleSlot) => ReactNode
  colorMap?: Map<string, string>
  selectedSlot?: ScheduleSlot | null
  onSelectSlot?: (slot: ScheduleSlot | null) => void
  /** The dated week shown; without it the rows are plain weekdays. */
  weekDays?: WeekDay[]
  /** YYYY-MM-DD, marked when it falls in `weekDays`. */
  today?: string
}

export interface TuRegTimetableModalProps {
  isOpen: boolean
  onClose: () => void
  /** Everything that uses the room; the modal picks out the week shown. */
  slots: ScheduleSlot[]
  title?: string
  roomCode?: string
  renderActions?: (slot: ScheduleSlot) => ReactNode
  colorMap?: Map<string, string>
  /** Monday (YYYY-MM-DD) of the week shown, when the caller keeps it (the room card does). */
  weekStart?: string
  onWeekChange?: (weekStart: string) => void
  /** YYYY-MM-DD; defaults to today. */
  today?: string
}

/** Standard reg.tu.ac.th schedule starts at 07:00 and ends at 21:00 (14 hours) */
const DEFAULT_START_HOUR = 7
const DEFAULT_END_HOUR = 21

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

const sameText = (a: string, b: string) =>
  a.replace(/[\s\-_.]+/g, '').toUpperCase() === b.replace(/[\s\-_.]+/g, '').toUpperCase()

/** The event name when it says more than the label already does. */
function extraName(slot: ScheduleSlot): string | null {
  const label = getSlotDisplayLabel(slot)
  return slot.eventName && !sameText(slot.eventName, label) ? slot.eventName : null
}

/** Second line of a block: "สอบ" / "กิจกรรม", or the course name when it adds something. */
function blockSubtitle(slot: ScheduleSlot): string {
  const kind = getUsageKind(slot)
  return kind === 'class' ? (extraName(slot) ?? '') : USAGE_KIND_LABELS[kind]
}

/** When an entry happens: its date when it has one, otherwise "ทุกวันจันทร์" for a weekly class. */
function whenText(slot: ScheduleSlot): string {
  if (slot.eventDate) return formatExamDateTime(slot)
  const time = `${slot.startTime}–${slot.endTime}`
  const day = normalizeDay(slot.dayOfWeek)
  if (!day) return `${slot.dayOfWeek} ${time}`
  return isExamSchedule(slot) ? `${THAI_DAY_COLORS[day].full} ${time}` : `ทุก${THAI_DAY_COLORS[day].full} ${time}`
}

/** Minutes since midnight now, for the "now" line on today's row. */
function nowMinute(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

/**
 * Full week in reg.tu.ac.th wide table style: days as rows, hours 07:00–21:00 as columns, and
 * extra lanes when entries on one day overlap. Given `weekDays`, each row also shows its date
 * and today's row is marked with the current time.
 */
export function TuRegTimetable({
  slots,
  renderActions,
  colorMap: externalColorMap,
  selectedSlot: externalSelectedSlot,
  onSelectSlot: externalOnSelectSlot,
  weekDays,
  today,
}: TuRegTimetableProps) {
  const [userDismissed, setUserDismissed] = useState(false)
  const [internalSelectedSlot, setInternalSelectedSlot] = useState<ScheduleSlot | null>(null)
  const selectedSlot =
    externalSelectedSlot !== undefined
      ? externalSelectedSlot
      : internalSelectedSlot ?? (slots.length === 1 && !userDismissed ? slots[0] : null)
  const handleSelectSlot = (slot: ScheduleSlot | null) => {
    setUserDismissed(slot === null)
    if (externalOnSelectSlot) {
      externalOnSelectSlot(slot)
    } else {
      setInternalSelectedSlot(slot)
    }
  }
  const selectedCardRef = useRef<HTMLDivElement>(null)

  const layout = useMemo(() => buildTimetableLayout(slots), [slots])
  const colorMap = useMemo(() => externalColorMap ?? buildClassColorMap(slots), [externalColorMap, slots])

  // Bring the details card into view when an entry is picked.
  useEffect(() => {
    if (!selectedSlot) return
    const timer = setTimeout(() => {
      selectedCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    }, 50)
    return () => clearTimeout(timer)
  }, [selectedSlot])

  // 07:00–21:00, stretched when an entry falls outside it.
  const startHour = Math.min(
    DEFAULT_START_HOUR,
    layout.startMinute > 0 ? Math.floor(layout.startMinute / 60) : DEFAULT_START_HOUR,
  )
  const endHour = Math.max(
    DEFAULT_END_HOUR,
    layout.endMinute > 0 ? Math.ceil(layout.endMinute / 60) : DEFAULT_END_HOUR,
  )
  const timelineStart = startHour * 60
  const timelineEnd = endHour * 60
  const totalMinutes = timelineEnd - timelineStart
  const totalHours = endHour - startHour
  const hours: number[] = []
  for (let h = startHour; h < endHour; h++) hours.push(h)

  const currentMinute = nowMinute()
  const nowPercent =
    currentMinute >= timelineStart && currentMinute <= timelineEnd
      ? ((currentMinute - timelineStart) / totalMinutes) * 100
      : null

  return (
    <div data-testid="tu-reg-timetable" className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-line-soft bg-white shadow-xs">
        {/* Header row: days / hours */}
        <div className="flex border-b border-line-soft bg-surface-2 text-xs font-bold text-ink-2 select-none">
          <div className="w-14 sm:w-24 shrink-0 border-r border-line-soft px-1 sm:px-2 py-2 flex items-center justify-center text-center font-bold sticky left-0 z-20 bg-surface-2 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
            <span className="text-[11px] sm:text-xs">วัน/เวลา</span>
          </div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${totalHours}, minmax(0, 1fr))` }}>
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

        {/* Day rows */}
        <div className="divide-y divide-line-soft">
          {TIMETABLE_DAYS.map((day) => {
            const daySlots = layout.days[day]
            const maxLane = daySlots.length === 0 ? 0 : Math.max(...daySlots.map((s) => s.lane))
            const laneCount = maxLane + 1
            const dayMeta = THAI_DAY_COLORS[day]
            const weekDay = weekDays?.find((w) => w.day === day)
            const isToday = Boolean(weekDay && today && weekDay.date === today)

            return (
              <div key={day} className="flex min-w-0" data-today={isToday ? 'true' : undefined}>
                {/* Day cell, sticky on horizontal scroll */}
                <div
                  className="w-14 sm:w-24 shrink-0 flex border-r border-line-soft bg-white sticky left-0 z-10 select-none shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]"
                  style={{ minHeight: `${laneCount * 64}px` }}
                >
                  <div className="w-1.5 sm:w-2 shrink-0 h-full" style={{ backgroundColor: dayMeta.hex }} aria-hidden="true" />
                  <div className="flex-1 flex flex-col items-center justify-center gap-0.5 p-1 sm:p-2 text-center">
                    <span className="font-bold text-xs text-ink sm:hidden">{COMPACT_DAY_LABELS[day]}</span>
                    <span className="font-bold text-xs text-ink hidden sm:inline">{dayMeta.name}</span>
                    {weekDay && (
                      <span
                        className={`font-mono text-[10px] sm:text-[11px] ${
                          isToday ? 'rounded-full bg-ink px-1.5 font-semibold text-white' : 'text-ink-3'
                        }`}
                      >
                        {isToday ? `วันนี้ ${formatThaiShortDate(weekDay.date)}` : formatThaiShortDate(weekDay.date)}
                      </span>
                    )}
                    {daySlots.length > 0 && (
                      <span className="text-[9px] sm:text-[10px] text-ink-3 font-medium">({daySlots.length})</span>
                    )}
                  </div>
                </div>

                {/* Timeline, one sub-row per lane when entries overlap */}
                <div className={`flex-1 flex flex-col divide-y divide-line-soft/60 min-w-0 ${isToday ? 'bg-accent/5' : ''}`}>
                  {Array.from({ length: laneCount }).map((_, laneIdx) => {
                    const laneSlots = daySlots.filter((s) => s.lane === laneIdx)
                    return (
                      <div key={laneIdx} className="relative h-16 min-h-[64px] w-full">
                        <div
                          className="absolute inset-0 grid pointer-events-none"
                          style={{ gridTemplateColumns: `repeat(${totalHours}, minmax(0, 1fr))` }}
                          aria-hidden="true"
                        >
                          {hours.map((h, i) => (
                            <div
                              key={h}
                              className={`border-r border-line-soft/40 h-full ${i === hours.length - 1 ? 'border-r-0' : ''}`}
                            />
                          ))}
                        </div>

                        {isToday && nowPercent !== null && (
                          <div
                            data-testid="timetable-now-line"
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-[#ef4444]"
                            style={{ left: `${nowPercent}%` }}
                          />
                        )}

                        {laneSlots.map((item) => {
                          const leftPercent = ((item.startMinute - timelineStart) / totalMinutes) * 100
                          const widthPercent = ((item.endMinute - item.startMinute) / totalMinutes) * 100
                          const isSelected = selectedSlot !== null && slotKey(selectedSlot) === slotKey(item.slot)
                          const subtitle = blockSubtitle(item.slot)
                          const time = `${formatMinutes(item.startMinute)}–${formatMinutes(item.endMinute)}`
                          const label = [getSlotDisplayLabel(item.slot), subtitle, time].filter(Boolean).join(' ')
                          return (
                            <button
                              key={`${item.slot.eventCode}-${item.startMinute}`}
                              type="button"
                              onClick={() => handleSelectSlot(isSelected ? null : item.slot)}
                              aria-pressed={isSelected}
                              aria-label={label}
                              title={label}
                              className={`timetable-card absolute inset-y-1 overflow-hidden rounded-xl px-2 py-1 text-left shadow-xs cursor-pointer transition-all hover:scale-[1.01] hover:brightness-95 ${
                                isSelected ? 'ring-2 ring-white z-20 shadow-md' : 'z-10'
                              } ${entryColors(item.slot, colorMap)}`}
                              style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                            >
                              <p className="truncate font-mono text-xs font-bold text-white leading-tight">
                                {getSlotDisplayLabel(item.slot)}
                              </p>
                              {subtitle && (
                                <p className="truncate text-[11px] font-medium text-white/90 leading-tight mt-0.5">{subtitle}</p>
                              )}
                              <p className="truncate font-mono text-[10px] text-white/80 leading-tight mt-0.5">{time}</p>
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

      {/* Details of the picked entry, with its actions (pin, Google Calendar) */}
      {selectedSlot && (
        <SelectedSlotCard
          cardRef={selectedCardRef}
          slot={selectedSlot}
          colorMap={colorMap}
          renderActions={renderActions}
          onClose={() => handleSelectSlot(null)}
        />
      )}
    </div>
  )
}

interface SelectedSlotCardProps {
  cardRef?: Ref<HTMLDivElement>
  slot: ScheduleSlot
  colorMap: Map<string, string>
  renderActions?: (slot: ScheduleSlot) => ReactNode
  onClose: () => void
}

function SelectedSlotCard({ cardRef, slot, colorMap, renderActions, onClose }: SelectedSlotCardProps) {
  const kind = getUsageKind(slot)
  const name = extraName(slot)
  const unannounced = !slot.eventDate ? getExamDateLabel(slot) : null
  return (
    <div
      ref={cardRef}
      data-testid="tu-reg-selected-card"
      className="flex gap-3 rounded-lg border border-line-soft bg-white p-3 animate-fade-in"
    >
      <span aria-hidden="true" className={`w-1.5 shrink-0 rounded-full ${entryColors(slot, colorMap)}`} />
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">
              {kind !== 'class' ? `${USAGE_KIND_LABELS[kind]} ` : ''}
              {getSlotDisplayLabel(slot)}
            </span>
            {slot.roomCode && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink-2">ห้อง {slot.roomCode}</span>
            )}
          </div>
          {name && <p className="truncate text-xs text-ink mt-0.5">{name}</p>}
          <p className="mt-0.5 font-mono text-xs text-ink-2">{whenText(slot)}</p>
          {unannounced && <p className="mt-0.5 text-xs font-bold text-ink">{unannounced}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {renderActions && <div className="flex items-center gap-1">{renderActions(slot)}</div>}
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดรายละเอียด"
            className="btn btn-ghost btn-icon-sm"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Height of one hour in the week grid. */
const HOUR_PX = 48
/** Google Calendar's red, for today and the current time. */
const TODAY_RED = '#d93025'

interface WeekGridProps {
  /** The week's entries (getSlotsForWeek). */
  slots: ScheduleSlot[]
  weekDays: WeekDay[]
  today: string
  colorMap: Map<string, string>
  renderActions?: (slot: ScheduleSlot) => ReactNode
}

/**
 * A week the way calendar apps show it: days across the top with their dates (today in a red
 * circle), hours down the side, and a red line at the current time.
 */
function WeekGrid({ slots, weekDays, today, colorMap, renderActions }: WeekGridProps) {
  // A week with a single entry opens its details straight away.
  const [selected, setSelected] = useState<ScheduleSlot | null>(() => (slots.length === 1 ? slots[0] : null))
  const layout = useMemo(() => buildTimetableLayout(slots), [slots])
  const startHour = Math.min(DEFAULT_START_HOUR, layout.startMinute > 0 ? Math.floor(layout.startMinute / 60) : DEFAULT_START_HOUR)
  const endHour = Math.max(DEFAULT_END_HOUR, layout.endMinute > 0 ? Math.ceil(layout.endMinute / 60) : DEFAULT_END_HOUR)
  const hours: number[] = []
  for (let h = startHour; h < endHour; h++) hours.push(h)
  const height = (endHour - startHour) * HOUR_PX
  const toPx = (minute: number) => ((minute - startHour * 60) / 60) * HOUR_PX
  const currentMinute = nowMinute()
  const nowTop = currentMinute >= startHour * 60 && currentMinute <= endHour * 60 ? toPx(currentMinute) : null

  return (
    <div data-testid="week-grid" className="space-y-3">
      <div className="rounded-lg border border-line-soft bg-white">
        <div className="sticky top-0 z-30 flex rounded-t-lg border-b border-line-soft bg-white">
          <div className="w-14 shrink-0" />
          <div className="grid flex-1 grid-cols-7">
            {weekDays.map(({ day, date }) => {
              const isToday = date === today
              return (
                <div key={day} className="flex flex-col items-center py-2 select-none">
                  <span className="text-[11px] font-medium" style={{ color: isToday ? TODAY_RED : undefined }}>
                    {COMPACT_DAY_LABELS[day]}
                  </span>
                  <span
                    className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base ${
                      isToday ? 'font-semibold text-white' : 'text-ink'
                    }`}
                    style={{ backgroundColor: isToday ? TODAY_RED : undefined }}
                  >
                    {Number(date.slice(8))}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex">
          <div className="relative w-14 shrink-0 select-none" style={{ height }} aria-hidden="true">
            {hours.slice(1).map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-ink-3"
                style={{ top: (h - startHour) * HOUR_PX }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          <div className="relative grid flex-1 grid-cols-7" style={{ height }}>
            {hours.slice(1).map((h) => (
              <div
                key={h}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-line-soft/70"
                style={{ top: (h - startHour) * HOUR_PX }}
              />
            ))}
            {weekDays.map(({ day, date }) => {
              const isToday = date === today
              return (
                <div
                  key={day}
                  role="group"
                  aria-label={`${THAI_DAY_COLORS[day].full} ${formatThaiShortDate(date)}`}
                  className="relative border-l border-line-soft"
                >
                  {layout.days[day].map((item) => {
                    const subtitle = blockSubtitle(item.slot)
                    const time = `${formatMinutes(item.startMinute)}–${formatMinutes(item.endMinute)}`
                    const isSelected = selected !== null && slotKey(selected) === slotKey(item.slot)
                    return (
                      <button
                        key={`${item.slot.eventCode}-${item.startMinute}-${item.lane}`}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={[getSlotDisplayLabel(item.slot), subtitle, time].filter(Boolean).join(' ')}
                        onClick={() => setSelected(isSelected ? null : item.slot)}
                        className={`absolute z-10 overflow-hidden rounded-md px-1.5 py-1 text-left leading-tight ${entryColors(
                          item.slot,
                          colorMap,
                        )} ${isSelected ? 'ring-2 ring-ink ring-offset-1' : 'hover:brightness-110'}`}
                        style={{
                          top: toPx(item.startMinute) + 1,
                          height: Math.max(20, toPx(item.endMinute) - toPx(item.startMinute) - 2),
                          left: `calc(${(item.lane / item.laneCount) * 100}% + 2px)`,
                          width: `calc(${100 / item.laneCount}% - 4px)`,
                        }}
                      >
                        <span className="block truncate text-xs font-semibold text-white">{getSlotDisplayLabel(item.slot)}</span>
                        {subtitle && <span className="block truncate text-[11px] text-white">{subtitle}</span>}
                        <span className="block truncate text-[11px] text-white/90">{time}</span>
                      </button>
                    )
                  })}
                  {isToday && nowTop !== null && (
                    <div
                      data-testid="timetable-now-line"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 z-20 h-0.5"
                      style={{ top: nowTop, backgroundColor: TODAY_RED }}
                    >
                      <span
                        className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full"
                        style={{ backgroundColor: TODAY_RED }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {selected && (
        <SelectedSlotCard slot={selected} colorMap={colorMap} renderActions={renderActions} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

interface WeekAgendaProps {
  /** The week's entries (getSlotsForWeek). */
  slots: ScheduleSlot[]
  weekDays: WeekDay[]
  today: string
  colorMap: Map<string, string>
  renderActions?: (slot: ScheduleSlot) => ReactNode
}

/** Phone view of a week: each day with its date and its entries in time order; tap one for details. */
function WeekAgenda({ slots, weekDays, today, colorMap, renderActions }: WeekAgendaProps) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const layout = useMemo(() => buildTimetableLayout(slots), [slots])

  return (
    <div data-testid="week-agenda" className="space-y-3">
      {weekDays.map(({ day, date }) => {
        const items = [...layout.days[day]].sort((a, b) => a.startMinute - b.startMinute)
        const dayMeta = THAI_DAY_COLORS[day]
        const dayLabel = `${dayMeta.full} ${formatThaiShortDate(date)}`
        return (
          <section key={day} aria-label={dayLabel}>
            <h4 className="flex items-center gap-2 text-xs font-bold text-ink">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dayMeta.hex }} />
              <span>{dayLabel}</span>
              {date === today && (
                <span className="rounded-full bg-[#d93025] px-1.5 py-0.5 text-[10px] font-semibold text-white">วันนี้</span>
              )}
            </h4>
            {items.length === 0 ? (
              <p className="mt-1 pl-4 text-xs text-ink-3">ว่าง</p>
            ) : (
              <ul className="mt-1.5 divide-y divide-line-soft overflow-hidden rounded-lg border border-line-soft bg-white">
                {items.map((item) => {
                  const key = slotKey(item.slot)
                  const open = openKey === key
                  const kind = getUsageKind(item.slot)
                  const name = extraName(item.slot)
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenKey(open ? null : key)}
                        className="flex w-full items-center gap-2.5 px-2 py-2 text-left hover:bg-surface-2"
                      >
                        <span
                          aria-hidden="true"
                          className={`h-8 w-1 shrink-0 rounded-full ${entryColors(item.slot, colorMap)}`}
                        />
                        <span className="w-[5.25rem] shrink-0 font-mono text-xs text-ink-2">
                          {formatMinutes(item.startMinute)}–{formatMinutes(item.endMinute)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-button font-bold text-ink">
                          {getSlotDisplayLabel(item.slot)}
                        </span>
                        {kind !== 'class' && (
                          <span className="shrink-0 text-[11px] font-medium text-ink-3">{USAGE_KIND_LABELS[kind]}</span>
                        )}
                      </button>
                      {open && (
                        <div className="space-y-1.5 px-3 pb-2.5 pl-5">
                          {name && <p className="text-xs text-ink">{name}</p>}
                          <p className="font-mono text-xs text-ink-2">{whenText(item.slot)}</p>
                          {renderActions && <div className="flex flex-wrap items-center gap-1.5">{renderActions(item.slot)}</div>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

/**
 * The room's usage for one week, classes, exams and activities together, with each day's date:
 * a wide table on larger screens and a day-by-day list on phones, plus week arrows and a key.
 */
export function TuRegTimetableModal({
  isOpen,
  onClose,
  slots,
  title,
  roomCode,
  renderActions,
  colorMap: externalColorMap,
  weekStart: controlledWeekStart,
  onWeekChange,
  today = formatLocalDate(new Date()),
}: TuRegTimetableModalProps) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  const thisWeekStart = getWeekStart(today)
  const [ownWeekStart, setOwnWeekStart] = useState(thisWeekStart)
  const weekStart = controlledWeekStart ?? ownWeekStart
  const setWeekStart = onWeekChange ?? setOwnWeekStart
  const weekSlots = useMemo(() => getSlotsForWeek(slots, weekStart), [slots, weekStart])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const colorMap = useMemo(() => externalColorMap ?? buildClassColorMap(slots), [externalColorMap, slots])

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
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || typeof document === 'undefined') return null

  const roomLabel = title || (roomCode ? `ห้อง ${roomCode}` : '')

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tu-reg-modal-title"
      className="fixed inset-0 z-2002 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6"
    >
      <div
        data-testid="tu-reg-modal-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-fade-in"
      />

      {/* Wide on larger screens so 07:00–21:00 fits without horizontal scrolling */}
      <div className="relative z-10 flex h-[94vh] sm:h-auto sm:max-h-[92vh] w-full sm:w-[95vw] max-w-6xl xl:max-w-7xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-modal overflow-hidden animate-modal-mobile sm:animate-modal-desktop">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line-soft px-3.5 sm:px-5 py-3 sm:py-3.5 bg-white gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-tertiary text-ink">
              <Table size={18} weight="bold" />
            </div>
            <div className="min-w-0">
              <h2 id="tu-reg-modal-title" className="font-display text-sm sm:text-h3-sm font-bold text-ink truncate">
                ตารางการใช้ห้อง
              </h2>
              {roomLabel && <p className="text-[11px] sm:text-xs text-ink-3 truncate">{roomLabel}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-tu-reg-modal"
            aria-label="ปิดหน้าต่างตารางการใช้ห้อง"
            className="btn btn-ghost btn-icon-sm shrink-0"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Week */}
        <div className="flex shrink-0 items-center border-b border-line-soft bg-white px-3.5 sm:px-5 py-2">
          <WeekNavigator weekStart={weekStart} thisWeekStart={thisWeekStart} onChange={setWeekStart} />
        </div>

        <div key={weekStart} className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar p-3 sm:p-5">
          {weekSlots.length === 0 && (
            <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-center text-xs text-ink-2">
              ห้องนี้ว่างทั้งสัปดาห์
            </p>
          )}
          {isMobile ? (
            <WeekAgenda
              slots={weekSlots}
              weekDays={weekDays}
              today={today}
              colorMap={colorMap}
              renderActions={renderActions}
            />
          ) : (
            <div className="w-full min-w-0">
              <WeekGrid
                slots={weekSlots}
                weekDays={weekDays}
                today={today}
                colorMap={colorMap}
                renderActions={renderActions}
              />
            </div>
          )}
        </div>

        {/* Footer, hidden on phones to save space */}
        <div className="hidden sm:flex shrink-0 items-center justify-between border-t border-line-soft px-3.5 sm:px-5 py-2.5 sm:py-3 bg-surface-2 text-xs text-ink-3">
          <div className="flex items-center gap-1.5">
            <Calendar size={14} weight="bold" className="text-ink-2 shrink-0" />
            <span className="text-[11px] sm:text-xs">
              แตะรายการเพื่อดูรายละเอียด
            </span>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
            ปิด
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default TuRegTimetable
