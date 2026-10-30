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
import { getExamDateLabel } from '../services/scheduleDisplay'
import {
  THAI_DAY_COLORS,
  buildClassColorMap,
  entryColors,
  slotKey,
} from '../services/timetableColors'
import { TuRegTimetable, TuRegTimetableModal } from './TuRegTimetable'

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
    item.slot.eventCode,
    item.slot.eventName && item.slot.eventName !== item.slot.eventCode ? item.slot.eventName : '',
    DAY_LABELS[item.day].full,
    `${formatMinutes(item.startMinute)}–${formatMinutes(item.endMinute)}`,
    exam ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
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
                    <span className="block truncate font-mono text-[9px] font-bold text-white">{item.slot.eventCode}</span>
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
          <p className="font-mono text-xs font-bold text-white">{item.slot.eventCode}</p>
          {item.slot.eventName && item.slot.eventName !== item.slot.eventCode && (
            <p className="truncate text-xs text-white/90">{item.slot.eventName}</p>
          )}
          <p className="mt-0.5 font-mono text-xs text-white/80">
            {DAY_LABELS[item.day].full} {formatMinutes(item.startMinute)}–{formatMinutes(item.endMinute)}
          </p>
          {exam && <p className="mt-0.5 text-xs font-bold text-white">{exam}</p>}
        </div>
        {renderActions && <div className="flex shrink-0 items-center gap-1">{renderActions(item.slot)}</div>}
      </div>
    </div>
  )
}

interface CompactWeekSummaryProps {
  slots: ScheduleSlot[]
  colorMap?: Map<string, string>
  onOpenModal: () => void
}

/**
 * Compact Week Table Summary:
 * Sits right where the single-day table used to be. Acts as a large, inviting interactive button:
 * displays a 7-day miniature overview of all classes with their Google Calendar solid colors.
 * When clicked, it pops up the full, comprehensive Week Table modal in reg.tu.ac.th style.
 */
function CompactWeekSummary({ slots, colorMap, onOpenModal }: CompactWeekSummaryProps) {
  const layout = useMemo(() => buildTimetableLayout(slots), [slots])

  // Mini timeline spans from 07:00 to 21:00 (14 hours)
  const timelineStart = 7 * 60
  const timelineEnd = 21 * 60
  const totalMinutes = timelineEnd - timelineStart

  return (
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
      aria-label="เปิดดูตารางเรียนทั้งสัปดาห์"
      className="group relative w-full text-left rounded-2xl border border-line-soft bg-white p-3.5 sm:p-4 shadow-xs transition-all duration-200 hover:border-line hover:shadow-md hover:scale-[1.008] cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {/* Header bar of the compact summary button */}
      <div className="flex items-center justify-between pb-2.5 border-b border-line-soft">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs font-bold text-ink">
            เทอม 1/2569
          </span>
          <span className="rounded-full bg-surface-2 border border-line-soft px-2 py-0.5 text-[10px] font-semibold text-ink-2">
            {slots.length} คาบ
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs font-semibold text-accent group-hover:text-accent-hover">
          <span>ดูตารางเต็ม</span>
          <ArrowSquareOut size={14} weight="bold" />
        </div>
      </div>

      {/* Mini Time Rail Tick Marks */}
      <div className="mt-2.5 flex items-center text-[10px] font-mono text-ink-3 pl-9 pr-1 justify-between select-none">
        <span>08:00</span>
        <span>11:00</span>
        <span>14:00</span>
        <span>17:00</span>
        <span>20:00</span>
      </div>

      {/* 7 Days Mini Timeline Rows (Monday to Sunday) */}
      <div className="mt-1 space-y-1.5">
        {TIMETABLE_DAYS.map((day) => {
          const daySlots = layout.days[day]
          const dayMeta = THAI_DAY_COLORS[day]
          const maxLane = daySlots.length === 0 ? 0 : Math.max(...daySlots.map((s) => s.lane))
          const laneCount = maxLane + 1
          const hasSlots = daySlots.length > 0

          return (
            <div key={day} className="flex items-center gap-2">
              {/* Day Label with Small Color Dot */}
              <div className="flex w-8 shrink-0 items-center gap-1.5 select-none">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: dayMeta.hex }}
                  aria-hidden="true"
                />
                <span className="font-mono text-xs font-bold text-ink">
                  {COMPACT_DAY_LABELS[day]}
                </span>
              </div>

              {/* Timeline Track with multi-lane sub-rows if overlapping */}
              <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                {Array.from({ length: laneCount }).map((_, laneIdx) => {
                  const laneSlots = daySlots.filter((s) => s.lane === laneIdx)
                  return (
                    <div
                      key={laneIdx}
                      className="relative h-6.5 w-full rounded-md bg-surface-2/70 border border-line-soft/40 overflow-hidden"
                    >
                      {/* Subtle background hour tick lines */}
                      <div
                        className="absolute inset-0 grid grid-cols-4 pointer-events-none"
                        aria-hidden="true"
                      >
                        <div className="border-r border-line-soft/30 h-full" />
                        <div className="border-r border-line-soft/30 h-full" />
                        <div className="border-r border-line-soft/30 h-full" />
                        <div className="h-full" />
                      </div>

                      {/* Mini Course Blocks */}
                      {hasSlots && laneSlots.length > 0 ? (
                        laneSlots.map((item) => {
                          const leftPercent = Math.max(
                            0,
                            Math.min(100, ((item.startMinute - timelineStart) / totalMinutes) * 100)
                          )
                          const widthPercent = Math.max(
                            8,
                            Math.min(
                              100 - leftPercent,
                              ((item.endMinute - item.startMinute) / totalMinutes) * 100
                            )
                          )

                          return (
                            <div
                              key={`${item.slot.eventCode}-${item.startMinute}`}
                              className={`absolute inset-y-0.5 rounded px-1 flex items-center justify-center font-mono text-[10px] font-bold text-white shadow-xs truncate select-none ${entryColors(
                                item.slot,
                                colorMap
                              )}`}
                              style={{
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`,
                              }}
                              title={`${item.slot.eventCode} (${formatMinutes(
                                item.startMinute
                              )}–${formatMinutes(item.endMinute)})`}
                            >
                              <span className="truncate">{item.slot.eventCode}</span>
                            </div>
                          )
                        })
                      ) : !hasSlots ? (
                        <div className="flex h-full items-center pl-2 select-none">
                          <span className="text-[10px] text-ink-3/50 font-medium">ไม่มีคาบ</span>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
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
              {slot.eventCode} · {slot.dayOfWeek || '-'} {slot.startTime || '-'}–{slot.endTime || '-'}
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
}: WeeklyTimetableProps) {
  const { ref } = useContainerWidth<HTMLDivElement>()
  const colorMap = useMemo(() => buildClassColorMap(slots), [slots])
  const [isWeekModalOpen, setIsWeekModalOpen] = useState(false)

  if (slots.length === 0) {
    return (
      <div ref={ref}>
        <p data-testid="timetable-empty" className="py-6 text-center text-xs text-ink-3">
          ห้องนี้ยังไม่มีตารางการใช้ห้อง
        </p>
      </div>
    )
  }

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

        {isWeekModalOpen && (
          <TuRegTimetableModal
            isOpen={isWeekModalOpen}
            onClose={() => setIsWeekModalOpen(false)}
            slots={slots}
            title={title}
            roomCode={roomCode}
            renderActions={renderActions}
          />
        )}
      </div>
    )
  }

  // Default ('auto', 'compact', or any room side panel): Compact Week Table summary (interactive button)
  return (
    <div ref={ref} className="space-y-3">
      <CompactWeekSummary
        slots={slots}
        colorMap={colorMap}
        onOpenModal={() => setIsWeekModalOpen(true)}
      />
      <SkippedList slots={slots} renderActions={renderActions} />

      {isWeekModalOpen && (
        <TuRegTimetableModal
          isOpen={isWeekModalOpen}
          onClose={() => setIsWeekModalOpen(false)}
          slots={slots}
          title={title}
          roomCode={roomCode}
          renderActions={renderActions}
        />
      )}
    </div>
  )
}
