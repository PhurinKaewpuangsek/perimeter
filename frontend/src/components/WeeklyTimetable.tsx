import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowSquareOut, Table } from '@phosphor-icons/react'
import type { ScheduleSlot } from '../types/schedule'
import {
  TIMETABLE_DAYS,
  blockHeight,
  buildTimetableLayout,
  formatMinutes,
  type PlacedSlot,
  type TimetableDay,
} from '../services/timetableLayout'
import {
  formatExamDateTime,
  formatLocalDate,
  getExamDateLabel,
  getSlotDisplayLabel,
  isActivitySchedule,
} from '../services/scheduleDisplay'
import { getBlockLabel, getSlotsForWeek, getWeekDays, getWeekStart } from '../services/roomWeek'
import {
  THAI_DAY_COLORS,
  buildClassColorMap,
  entryColors,
  slotKey,
} from '../services/timetableColors'
import { TuRegTimetable, TuRegTimetableModal } from './TuRegTimetable'
import { WeekNavigator } from './RoomWeekControls'

export interface WeeklyTimetableProps {
  /** Entries to show. The grid never fetches data itself. */
  slots: ScheduleSlot[]
  /**
   * Buttons for one entry, e.g. pin and add-to-calendar (supplied by the caller).
   * Rendered in the full modal details card.
   */
  renderActions?: (slot: ScheduleSlot) => ReactNode
  /**
   * 'compact' / 'day' = Compact Week Table summary (interactive launcher for full modal),
   * 'grid' = Mon–Sun vertical columns (wide view),
   * 'tu-reg' = full week table in reg.tu.ac.th style (Days as rows, Time as columns),
   * 'auto' (default) = compact week summary by default, expanding to full modal on tap.
   */
  layout?: 'auto' | 'grid' | 'compact' | 'day' | 'tu-reg'
  /** Optional title or room description displayed in the modal */
  title?: string
  /** Optional room code */
  roomCode?: string
  /** YYYY-MM-DD whose week the card opens on (e.g. a searched activity); defaults to today. */
  focusDate?: string
  /** YYYY-MM-DD; defaults to today. */
  today?: string
}

const DAY_LABELS: Record<TimetableDay, { short: string; full: string }> = {
  MON: { short: 'จ.', full: 'วันจันทร์' },
  TUE: { short: 'อ.', full: 'วันอังคาร' },
  WED: { short: 'พ.', full: 'วันพุธ' },
  THU: { short: 'พฤ.', full: 'วันพฤหัสบดี' },
  FRI: { short: 'ศ.', full: 'วันศุกร์' },
  SAT: { short: 'ส.', full: 'วันเสาร์' },
  SUN: { short: 'อา.', full: 'วันอาทิตย์' },
}

/** Day labels without periods for compact week summary: จ, อ, พ, พฤ, ศ, ส, อา */
const COMPACT_DAY_LABELS: Record<TimetableDay, string> = {
  MON: 'จ',
  TUE: 'อ',
  WED: 'พ',
  THU: 'พฤ',
  FRI: 'ศ',
  SAT: 'ส',
  SUN: 'อา',
}

/** Pixels per minute for desktop grid view */
const GRID_PX_PER_MINUTE = 0.8

/**
 * Width of the timetable's own container.
 */
function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

/** Exam line in the same wording as the map page: "วันสอบ: 2026-05-18" or "date to be announced". */
function examText(slot: ScheduleSlot): string | null {
  const label = getExamDateLabel(slot)
  if (!label) return null
  return slot.eventDate ? `วันสอบ: ${slot.eventDate}` : label
}

/** Full description of one entry for screen readers and tooltips (code, name, day, time, exam date). */
function entryLabel(item: PlacedSlot): string {
  const exam = examText(item.slot)
  return [
    isActivitySchedule(item.slot) ? 'กิจกรรม' : '',
    item.slot.eventCode,
    item.slot.eventName && item.slot.eventName !== item.slot.eventCode ? item.slot.eventName : '',
    DAY_LABELS[item.day].full,
    `${formatMinutes(item.startMinute)}–${formatMinutes(item.endMinute)}`,
    exam ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Absolute position of one entry inside a day column. */
function entryStyle(item: PlacedSlot, startMinute: number, endMinute: number, pxPerMinute: number) {
  return {
    top: (item.startMinute - startMinute) * pxPerMinute,
    height: blockHeight(item, pxPerMinute, endMinute),
    left: `calc(${(item.lane / item.laneCount) * 100}% + 1px)`,
    width: `calc(${100 / item.laneCount}% - 2px)`,
  }
}

/** Clear horizontal line at every whole hour, behind the entries. */
function HourLines({ startMinute, endMinute, pxPerMinute }: { startMinute: number; endMinute: number; pxPerMinute: number }) {
  const hours: number[] = []
  for (let m = startMinute; m <= endMinute; m += 60) hours.push(m)
  return (
    <>
      {hours.map((m) => (
        <div
          key={m}
          aria-hidden="true"
          className="absolute inset-x-0 border-t border-line-soft"
          style={{ top: (m - startMinute) * pxPerMinute }}
        />
      ))}
    </>
  )
}

/** Hour labels down the left edge of the grid. */
function TimeGutter({ startMinute, endMinute, pxPerMinute }: { startMinute: number; endMinute: number; pxPerMinute: number }) {
  const hours: number[] = []
  for (let m = startMinute; m < endMinute; m += 60) hours.push(m)
  return (
    <div className="relative w-11 shrink-0" style={{ height: (endMinute - startMinute) * pxPerMinute }} aria-hidden="true">
      {hours.map((m) => (
        <span
          key={m}
          className="absolute right-1.5 -translate-y-1/2 font-mono text-xs font-bold text-ink-2"
          style={{ top: (m - startMinute) * pxPerMinute }}
        >
          {formatMinutes(m)}
        </span>
      ))}
    </div>
  )
}

interface GridViewProps extends Pick<WeeklyTimetableProps, 'slots' | 'renderActions'> {
  colorMap?: Map<string, string>
  onOpenWeekModal?: () => void
}

/** Mon–Sun overview. Blocks are compact; tapping one shows its details and actions below. */
function GridView({ slots, renderActions, colorMap, onOpenWeekModal }: GridViewProps) {
  const layout = useMemo(() => buildTimetableLayout(slots), [slots])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const { startMinute, endMinute } = layout
  const height = (endMinute - startMinute) * GRID_PX_PER_MINUTE

  const selectedStillShown =
    selectedKey === null
      ? null
      : (TIMETABLE_DAYS.flatMap((day) => layout.days[day]).find((item) => slotKey(item.slot) === selectedKey) ?? null)

  return (
    <div data-testid="timetable-grid" className="space-y-3">
      {/* Week Schedule action bar */}
      {onOpenWeekModal && (
        <div className="flex items-center justify-between gap-2 pb-0.5">
          <span className="text-xs font-bold text-ink-2">ตารางประจำสัปดาห์</span>
          <button
            type="button"
            onClick={onOpenWeekModal}
            data-testid="open-week-schedule-grid-btn"
            className="btn btn-secondary btn-sm flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold cursor-pointer"
            title="ดูตารางเรียนทั้งสัปดาห์"
          >
            <Table size={14} weight="bold" />
            <span>ตารางทั้งสัปดาห์</span>
          </button>
        </div>
      )}

      <div className="flex min-w-0">
        <div className="w-9 shrink-0" />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {TIMETABLE_DAYS.map((day) => (
            <div key={day} className="truncate text-center text-xs font-bold text-ink-2" title={DAY_LABELS[day].full}>
              {DAY_LABELS[day].short}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0">
        <TimeGutter startMinute={startMinute} endMinute={endMinute} pxPerMinute={GRID_PX_PER_MINUTE} />
        <div className="grid min-w-0 flex-1 grid-cols-7 rounded-none border border-line-soft bg-white">
          {TIMETABLE_DAYS.map((day) => (
            <div
              key={day}
              role="group"
              aria-label={DAY_LABELS[day].full}
              className="relative min-w-0 border-l border-line-soft first:border-l-0"
              style={{ height }}
            >
              <HourLines startMinute={startMinute} endMinute={endMinute} pxPerMinute={GRID_PX_PER_MINUTE} />
              {layout.days[day].map((item) => {
                const isSelected = selectedStillShown !== null && slotKey(selectedStillShown.slot) === slotKey(item.slot)
                return (
                  <button
                    key={`${item.slot.eventCode}-${item.startMinute}-${item.lane}`}
                    type="button"
                    aria-label={entryLabel(item)}
                    aria-pressed={isSelected}
                    title={entryLabel(item)}
                    onClick={() => setSelectedKey(isSelected ? null : slotKey(item.slot))}
                    className={`absolute overflow-hidden rounded-md px-1 text-left leading-tight cursor-pointer transition-shadow shadow-xs ${entryColors(item.slot, colorMap)} ${
                      isSelected ? 'ring-2 ring-white z-2' : 'hover:brightness-95'
                    }`}
                    style={entryStyle(item, startMinute, endMinute, GRID_PX_PER_MINUTE)}
                  >
                    <span className="block truncate font-mono text-[9px] font-bold text-white">{getSlotDisplayLabel(item.slot)}</span>
                    <span className="block truncate font-mono text-[8px] text-white/90">{formatMinutes(item.startMinute)}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedStillShown ? (
        <EntryCard item={selectedStillShown} renderActions={renderActions} colorMap={colorMap} />
      ) : (
        <p className="text-center text-xs text-ink-3">แตะคาบในตารางเพื่อดูรายละเอียด</p>
      )}
    </div>
  )
}

/** Details of one entry (code, name, day, time, exam date) with its actions. */
function EntryCard({ item, renderActions, colorMap }: { item: PlacedSlot; renderActions?: WeeklyTimetableProps['renderActions']; colorMap?: Map<string, string> }) {
  const exam = examText(item.slot)
  return (
    <div data-testid="timetable-entry-card" className={`timetable-card rounded-xl p-3 shadow-xs ${entryColors(item.slot, colorMap)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-white">
            {isActivitySchedule(item.slot) ? 'กิจกรรม ' : ''}
            {item.slot.eventCode}
          </p>
          {item.slot.eventName && item.slot.eventName !== item.slot.eventCode && (
            <p className="truncate text-xs text-white/90">{item.slot.eventName}</p>
          )}
          <p className="mt-0.5 font-mono text-xs text-white/80">
            {isActivitySchedule(item.slot) && item.slot.eventDate
              ? formatExamDateTime(item.slot)
              : `${DAY_LABELS[item.day].full} ${formatMinutes(item.startMinute)}–${formatMinutes(item.endMinute)}`}
          </p>
          {exam && <p className="mt-0.5 text-xs font-bold text-white">{exam}</p>}
        </div>
        {renderActions && <div className="flex shrink-0 items-center gap-1">{renderActions(item.slot)}</div>}
      </div>
    </div>
  )
}

/** Hours labelled on the mini timeline rail; ticks use the same positions. */
const RAIL_HOURS = [8, 11, 14, 17, 20]

interface CompactWeekSummaryProps {
  /** The week's entries (getSlotsForWeek). */
  slots: ScheduleSlot[]
  colorMap?: Map<string, string>
  /** Monday (YYYY-MM-DD) of the week shown. */
  weekStart: string
  thisWeekStart: string
  /** YYYY-MM-DD */
  today: string
  onWeekChange: (weekStart: string) => void
  onOpenModal: () => void
}

/**
 * The room card's view of one week: everything that uses the room (classes, exams, activities)
 * on a small 07:00–21:00 rail per dated day, with week arrows. Tapping the rail opens the full table.
 */
function CompactWeekSummary({
  slots,
  colorMap,
  weekStart,
  thisWeekStart,
  today,
  onWeekChange,
  onOpenModal,
}: CompactWeekSummaryProps) {
  const layout = useMemo(() => buildTimetableLayout(slots), [slots])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  // Mini timeline spans from 07:00 to 21:00 (14 hours)
  const timelineStart = 7 * 60
  const timelineEnd = 21 * 60
  const totalMinutes = timelineEnd - timelineStart
  const now = new Date()
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const nowPercent =
    nowMinute >= timelineStart && nowMinute <= timelineEnd ? ((nowMinute - timelineStart) / totalMinutes) * 100 : null

  return (
    <div className="rounded-2xl border border-line-soft bg-white p-3.5 sm:p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft pb-2">
        <WeekNavigator weekStart={weekStart} thisWeekStart={thisWeekStart} onChange={onWeekChange} />
        <button
          type="button"
          onClick={onOpenModal}
          className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover"
        >
          <span>ดูตารางเต็ม</span>
          <ArrowSquareOut size={14} weight="bold" />
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        data-testid="compact-week-summary-btn"
        onClick={onOpenModal}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenModal()
          }
        }}
        aria-label="เปิดตารางการใช้ห้องแบบเต็ม"
        className="block w-full cursor-pointer rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* Mini Time Rail Tick Marks */}
        <div className="relative ml-12 mr-1 mt-2.5 h-3 text-[10px] font-mono text-ink-3 select-none" aria-hidden="true">
          {RAIL_HOURS.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${((h * 60 - timelineStart) / totalMinutes) * 100}%` }}
            >
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {/* Monday to Sunday, each with its date */}
        <div className="mt-1 space-y-1.5">
          {weekDays.map(({ day, date }) => {
            const daySlots = layout.days[day]
            const dayMeta = THAI_DAY_COLORS[day]
            const maxLane = daySlots.length === 0 ? 0 : Math.max(...daySlots.map((s) => s.lane))
            const laneCount = maxLane + 1
            const hasSlots = daySlots.length > 0
            const isToday = date === today

            return (
              <div key={day} className="flex items-center gap-2" data-today={isToday ? 'true' : undefined}>
                <div className="flex w-10 shrink-0 items-center gap-1.5 select-none">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: dayMeta.hex }} aria-hidden="true" />
                  <span className="flex flex-col items-start leading-none">
                    <span className="font-mono text-xs font-bold text-ink">{COMPACT_DAY_LABELS[day]}</span>
                    <span
                      className={`mt-0.5 rounded-full px-1 font-mono text-[10px] ${
                        isToday ? 'bg-[#d93025] font-semibold text-white' : 'text-ink-3'
                      }`}
                      title={isToday ? 'วันนี้' : undefined}
                    >
                      {Number(date.slice(8))}
                    </span>
                  </span>
                </div>

                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                  {Array.from({ length: laneCount }).map((_, laneIdx) => {
                    const laneSlots = daySlots.filter((s) => s.lane === laneIdx)
                    return (
                      <div
                        key={laneIdx}
                        className="relative h-6.5 w-full rounded-md border border-line-soft/40 bg-surface-2/70 overflow-hidden"
                      >
                        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                          {RAIL_HOURS.map((h) => (
                            <div
                              key={h}
                              className="absolute top-0 h-full border-l border-line-soft/30"
                              style={{ left: `${((h * 60 - timelineStart) / totalMinutes) * 100}%` }}
                            />
                          ))}
                        </div>

                        {laneSlots.map((item) => {
                          const leftPercent = Math.max(
                            0,
                            Math.min(100, ((item.startMinute - timelineStart) / totalMinutes) * 100),
                          )
                          const widthPercent = Math.max(
                            8,
                            Math.min(100 - leftPercent, ((item.endMinute - item.startMinute) / totalMinutes) * 100),
                          )
                          return (
                            <div
                              key={`${item.slot.eventCode}-${item.startMinute}`}
                              className={`absolute inset-y-0.5 rounded px-1 flex items-center justify-center font-mono text-[10px] font-bold text-white shadow-xs truncate select-none ${entryColors(
                                item.slot,
                                colorMap,
                              )}`}
                              style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                              title={`${getBlockLabel(item.slot)} (${formatMinutes(
                                item.startMinute,
                              )}–${formatMinutes(item.endMinute)})`}
                            >
                              <span className="truncate">{getBlockLabel(item.slot)}</span>
                            </div>
                          )
                        })}

                        {!hasSlots && (
                          <div className="flex h-full items-center pl-2 select-none">
                            <span className="text-[10px] text-ink-3/60 font-medium">ว่าง</span>
                          </div>
                        )}

                        {isToday && nowPercent !== null && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#d93025]"
                            style={{ left: `${nowPercent}%` }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {slots.length === 0 && <p className="mt-2 text-center text-[11px] text-ink-3">ห้องว่างทั้งสัปดาห์</p>}
    </div>
  )
}

/** Entries that could not be placed (malformed time or unknown day), listed so nothing disappears. */
function SkippedList({ slots, renderActions }: Pick<WeeklyTimetableProps, 'slots' | 'renderActions'>) {
  const skipped = useMemo(() => buildTimetableLayout(slots).skipped, [slots])
  if (skipped.length === 0) return null
  return (
    <div data-testid="timetable-skipped" className="card p-3 text-xs text-ink">
      <p className="font-bold">คาบที่แสดงในตารางไม่ได้ (เวลาหรือวันไม่ถูกต้อง)</p>
      <ul className="mt-1 space-y-1">
        {skipped.map((slot, i) => (
          <li key={`${slot.eventCode}-${i}`} className="flex items-center justify-between gap-2">
            <span className="font-mono">
              {slot.eventCode} {slot.dayOfWeek || '-'} {slot.startTime || '-'}–{slot.endTime || '-'}
            </span>
            {renderActions?.(slot)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Weekly timetable component */
export default function WeeklyTimetable({
  slots,
  renderActions,
  layout = 'auto',
  title,
  roomCode,
  focusDate,
  today,
}: WeeklyTimetableProps) {
  const { ref } = useContainerWidth<HTMLDivElement>()
  const colorMap = useMemo(() => buildClassColorMap(slots), [slots])
  const [isWeekModalOpen, setIsWeekModalOpen] = useState(false)
  const todayDate = today ?? formatLocalDate(new Date())
  const thisWeekStart = getWeekStart(todayDate)
  // The card and the full table share one week, so the table opens where the card is.
  const [weekStart, setWeekStart] = useState(() => getWeekStart(focusDate ?? todayDate))
  const weekSlots = useMemo(() => getSlotsForWeek(slots, weekStart), [slots, weekStart])

  if (slots.length === 0) {
    return (
      <div ref={ref}>
        <p data-testid="timetable-empty" className="py-6 text-center text-xs text-ink-3">
          ห้องนี้ยังไม่มีตารางการใช้ห้อง
        </p>
      </div>
    )
  }

  const modal = isWeekModalOpen && (
    <TuRegTimetableModal
      isOpen={isWeekModalOpen}
      onClose={() => setIsWeekModalOpen(false)}
      slots={slots}
      title={title}
      roomCode={roomCode}
      renderActions={renderActions}
      colorMap={colorMap}
      weekStart={weekStart}
      onWeekChange={setWeekStart}
      today={todayDate}
    />
  )

  if (layout === 'tu-reg') {
    return (
      <div ref={ref} className="space-y-3">
        <TuRegTimetable slots={slots} renderActions={renderActions} colorMap={colorMap} />
        <SkippedList slots={slots} renderActions={renderActions} />
      </div>
    )
  }

  // Explicit grid view when layout='grid'
  if (layout === 'grid') {
    return (
      <div ref={ref} className="space-y-3">
        <GridView
          slots={slots}
          renderActions={renderActions}
          colorMap={colorMap}
          onOpenWeekModal={() => setIsWeekModalOpen(true)}
        />
        <SkippedList slots={slots} renderActions={renderActions} />
        {modal}
      </div>
    )
  }

  // Default ('auto', 'compact', or any room side panel): this week's room usage, tap for the full table
  return (
    <div ref={ref} className="space-y-3">
      <CompactWeekSummary
        slots={weekSlots}
        colorMap={colorMap}
        weekStart={weekStart}
        thisWeekStart={thisWeekStart}
        today={todayDate}
        onWeekChange={setWeekStart}
        onOpenModal={() => setIsWeekModalOpen(true)}
      />
      <SkippedList slots={slots} renderActions={renderActions} />
      {modal}
    </div>
  )
}
