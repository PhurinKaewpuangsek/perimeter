import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ScheduleSlot } from '../types/schedule'
import {
  TIMETABLE_DAYS,
  blockHeight,
  buildTimetableLayout,
  formatMinutes,
  type PlacedSlot,
  type TimetableDay,
} from '../services/timetableLayout'
import { getExamDateLabel, isExamSchedule } from '../services/scheduleDisplay'

export interface WeeklyTimetableProps {
  /** Entries to show. The grid never fetches data itself. */
  slots: ScheduleSlot[]
  /**
   * Buttons for one entry, e.g. pin and add-to-calendar (supplied by the caller).
   * In the grid view each block is itself a button, so actions are never rendered inside it:
   * they appear in the details card below the grid once a block is tapped (no nested buttons).
   * In the day view they sit inside each block.
   */
  renderActions?: (slot: ScheduleSlot) => ReactNode
  /**
   * 'grid' = Mon–Sun columns, 'day' = one day at a time with tabs,
   * 'auto' (default) = grid only when the timetable's own container is wide enough
   * (so a 400px side panel gets the day view even on a desktop screen).
   */
  layout?: 'auto' | 'grid' | 'day'
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

/** Pixels per minute: tall enough on phones for actions to fit inside each block. */
const GRID_PX_PER_MINUTE = 0.8
const DAY_PX_PER_MINUTE = 1.4

/** Container width (px) from which the 'auto' layout switches to the Mon–Sun grid. */
const GRID_MIN_WIDTH = 560

/**
 * Width of the timetable's own container, so 'auto' reacts to the space it really has
 * (e.g. the 400px room panel) rather than the window size. 0 until measured.
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

/** Stable identity of an entry, so a selection survives the parent re-fetching its slots. */
function slotKey(slot: ScheduleSlot): string {
  return `${slot.roomCode}#${slot.dayOfWeek}#${slot.startTime}#${slot.eventCode}`
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

/** Tailwind colours for an entry: rose for exams, violet for classes. */
function entryColors(slot: ScheduleSlot): string {
  return isExamSchedule(slot)
    ? 'bg-rose-50 border-rose-300 text-rose-900'
    : 'bg-violet-50 border-violet-300 text-violet-900'
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

/** Faint horizontal line at every whole hour, behind the entries. */
function HourLines({ startMinute, endMinute, pxPerMinute }: { startMinute: number; endMinute: number; pxPerMinute: number }) {
  const hours: number[] = []
  for (let m = startMinute; m <= endMinute; m += 60) hours.push(m)
  return (
    <>
      {hours.map((m) => (
        <div
          key={m}
          aria-hidden="true"
          className="absolute inset-x-0 border-t border-slate-100"
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
    <div className="relative w-9 shrink-0" style={{ height: (endMinute - startMinute) * pxPerMinute }} aria-hidden="true">
      {hours.map((m) => (
        <span
          key={m}
          className="absolute right-1 -translate-y-1/2 font-mono text-[9px] text-slate-400"
          style={{ top: (m - startMinute) * pxPerMinute }}
        >
          {formatMinutes(m)}
        </span>
      ))}
    </div>
  )
}

/** Mon–Sun overview. Blocks are compact; tapping one shows its details and actions below. */
function GridView({ slots, renderActions }: Pick<WeeklyTimetableProps, 'slots' | 'renderActions'>) {
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
      <div className="flex min-w-0">
        <div className="w-9 shrink-0" />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {TIMETABLE_DAYS.map((day) => (
            <div key={day} className="truncate text-center text-[10px] font-bold text-slate-600" title={DAY_LABELS[day].full}>
              {DAY_LABELS[day].short}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0">
        <TimeGutter startMinute={startMinute} endMinute={endMinute} pxPerMinute={GRID_PX_PER_MINUTE} />
        <div className="grid min-w-0 flex-1 grid-cols-7 rounded-lg border border-slate-200 bg-white">
          {TIMETABLE_DAYS.map((day) => (
            <div
              key={day}
              role="group"
              aria-label={DAY_LABELS[day].full}
              className="relative min-w-0 border-l border-slate-100 first:border-l-0"
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
                    className={`absolute overflow-hidden rounded-md border px-0.5 text-left leading-tight cursor-pointer transition-shadow ${entryColors(item.slot)} ${
                      isSelected ? 'ring-2 ring-slate-900 z-10' : 'hover:ring-1 hover:ring-slate-400'
                    }`}
                    style={entryStyle(item, startMinute, endMinute, GRID_PX_PER_MINUTE)}
                  >
                    <span className="block truncate font-mono text-[9px] font-bold">{item.slot.eventCode}</span>
                    <span className="block truncate font-mono text-[8px] opacity-70">{formatMinutes(item.startMinute)}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedStillShown ? (
        <EntryCard item={selectedStillShown} renderActions={renderActions} />
      ) : (
        <p className="text-center text-[11px] text-slate-500">แตะคาบในตารางเพื่อดูรายละเอียด</p>
      )}
    </div>
  )
}

/** Details of one entry (code, name, day, time, exam date) with its actions. */
function EntryCard({ item, renderActions }: { item: PlacedSlot; renderActions?: WeeklyTimetableProps['renderActions'] }) {
  const exam = examText(item.slot)
  return (
    <div data-testid="timetable-entry-card" className={`rounded-xl border p-3 ${entryColors(item.slot)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold">{item.slot.eventCode}</p>
          {item.slot.eventName && item.slot.eventName !== item.slot.eventCode && (
            <p className="truncate text-xs">{item.slot.eventName}</p>
          )}
          <p className="mt-0.5 font-mono text-[11px] opacity-80">
            {DAY_LABELS[item.day].full} {formatMinutes(item.startMinute)}–{formatMinutes(item.endMinute)}
          </p>
          {exam && <p className="mt-0.5 text-[11px] font-semibold">{exam}</p>}
        </div>
        {renderActions && <div className="flex shrink-0 items-center gap-1">{renderActions(item.slot)}</div>}
      </div>
    </div>
  )
}

/** One day at a time with tabs; every block is wide enough to show its details and actions. */
function DayView({ slots, renderActions }: Pick<WeeklyTimetableProps, 'slots' | 'renderActions'>) {
  const layout = useMemo(() => buildTimetableLayout(slots), [slots])
  const firstBusyDay = TIMETABLE_DAYS.find((day) => layout.days[day].length > 0) ?? 'MON'
  const [chosenDay, setChosenDay] = useState<TimetableDay | null>(null)
  const day = chosenDay ?? firstBusyDay
  const items = layout.days[day]
  const { startMinute, endMinute } = layout

  return (
    <div data-testid="timetable-day" className="space-y-3">
      <div role="tablist" aria-label="เลือกวัน" className="grid grid-cols-7 gap-1">
        {TIMETABLE_DAYS.map((d) => {
          const count = layout.days[d].length
          const active = d === day
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${DAY_LABELS[d].full} (${count} คาบ)`}
              onClick={() => setChosenDay(d)}
              className={`rounded-lg py-1.5 text-[11px] font-bold cursor-pointer transition-colors ${
                active ? 'bg-slate-900 text-white' : count > 0 ? 'bg-slate-100 text-slate-800' : 'bg-slate-50 text-slate-400'
              }`}
            >
              {DAY_LABELS[d].short}
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">ไม่มีคาบใน{DAY_LABELS[day].full}</p>
      ) : (
        <div role="tabpanel" aria-label={DAY_LABELS[day].full} className="flex min-w-0">
          <TimeGutter startMinute={startMinute} endMinute={endMinute} pxPerMinute={DAY_PX_PER_MINUTE} />
          <div
            role="list"
            className="relative min-w-0 flex-1 rounded-lg border border-slate-200 bg-white"
            style={{ height: (endMinute - startMinute) * DAY_PX_PER_MINUTE }}
          >
            <HourLines startMinute={startMinute} endMinute={endMinute} pxPerMinute={DAY_PX_PER_MINUTE} />
            {items.map((item) => {
              const exam = examText(item.slot)
              return (
                <div
                  key={`${item.slot.eventCode}-${item.startMinute}-${item.lane}`}
                  role="listitem"
                  aria-label={entryLabel(item)}
                  className={`absolute overflow-hidden rounded-md border p-1.5 ${entryColors(item.slot)}`}
                  style={entryStyle(item, startMinute, endMinute, DAY_PX_PER_MINUTE)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] font-bold">{item.slot.eventCode}</p>
                      <p className="truncate font-mono text-[10px] opacity-80">
                        {formatMinutes(item.startMinute)}–{formatMinutes(item.endMinute)}
                      </p>
                      {exam && <p className="truncate text-[10px] font-semibold">{exam}</p>}
                    </div>
                    {renderActions && <div className="flex shrink-0 items-center">{renderActions(item.slot)}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Entries that could not be placed (malformed time or unknown day), listed so nothing disappears. */
function SkippedList({ slots, renderActions }: Pick<WeeklyTimetableProps, 'slots' | 'renderActions'>) {
  const skipped = useMemo(() => buildTimetableLayout(slots).skipped, [slots])
  if (skipped.length === 0) return null
  return (
    <div data-testid="timetable-skipped" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
      <p className="font-semibold">คาบที่แสดงในตารางไม่ได้ (เวลาหรือวันไม่ถูกต้อง)</p>
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

/** Weekly timetable (Mon–Sun by time) for one room's schedule. */
export default function WeeklyTimetable({ slots, renderActions, layout = 'auto' }: WeeklyTimetableProps) {
  const { ref, width } = useContainerWidth<HTMLDivElement>()

  if (slots.length === 0) {
    return (
      <div ref={ref}>
        <p data-testid="timetable-empty" className="py-6 text-center text-xs text-slate-500">
          ห้องนี้ยังไม่มีตารางการใช้ห้อง
        </p>
      </div>
    )
  }

  const useGrid = layout === 'grid' || (layout === 'auto' && width >= GRID_MIN_WIDTH)

  return (
    <div ref={ref} className="space-y-3">
      {useGrid ? (
        <GridView slots={slots} renderActions={renderActions} />
      ) : (
        <DayView slots={slots} renderActions={renderActions} />
      )}
      <SkippedList slots={slots} renderActions={renderActions} />
    </div>
  )
}
