import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { CaretDown, Users } from '@phosphor-icons/react'
import type { ScheduleSlot } from '../types/schedule'
import PinButton from './PinButton'
import { buildClassColorMap, entryColors } from '../services/timetableColors'
import { getExamDateLabel, formatThaiDateHeader, extractSeatsInfo, formatLocalDate } from '../services/scheduleDisplay'

export interface ExamAgendaListProps {
  slots: ScheduleSlot[]
  renderActions?: (slot: ScheduleSlot) => ReactNode
  /** The room this list belongs to; a slot in another room shows its room. */
  roomCode?: string
  highlightEventCode?: string | null
  /** YYYY-MM-DD; exams before it are folded under "สอบที่ผ่านไปแล้ว". Defaults to today. */
  today?: string
}

interface ExamDateGroup {
  dateKey: string
  formattedDate: string
  slots: ScheduleSlot[]
}

const slotKeyOf = (slot: ScheduleSlot) => `${slot.roomCode}-${slot.eventCode}-${slot.eventDate}-${slot.startTime}`

/**
 * What the event name adds beyond the row: "Exam - BAS353 (Seats 1-6) (6 พ.ค. 2569)" repeats
 * the code, seats and date the row already shows, so nothing is left; a real title stays.
 */
function extraName(slot: ScheduleSlot): string | null {
  if (!slot.eventName) return null
  const rest = slot.eventName
    .replace(/^\s*exam\s*-\s*/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(new RegExp(slot.eventCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
    .replace(/\s+/g, ' ')
    .trim()
  return rest.length > 0 ? rest : null
}

function groupByDate(slots: ScheduleSlot[]): ExamDateGroup[] {
  const sorted = [...slots].sort((a, b) => {
    const dateA = a.eventDate || '9999-99-99'
    const dateB = b.eventDate || '9999-99-99'
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    if (a.startTime !== b.startTime) return (a.startTime || '').localeCompare(b.startTime || '')
    return (a.eventCode || '').localeCompare(b.eventCode || '')
  })
  const groupMap = new Map<string, ExamDateGroup>()
  for (const slot of sorted) {
    const key = slot.eventDate || 'unannounced'
    let group = groupMap.get(key)
    if (!group) {
      group = { dateKey: key, formattedDate: formatThaiDateHeader(slot.eventDate, slot.dayOfWeek), slots: [] }
      groupMap.set(key, group)
    }
    group.slots.push(slot)
  }
  return Array.from(groupMap.values())
}

/**
 * A room's exams as a compact agenda (one row per exam, grouped by date). Upcoming exams
 * come first; past ones fold away so a long semester stays readable.
 */
export default function ExamAgendaList({
  slots,
  renderActions,
  roomCode,
  highlightEventCode,
  today = formatLocalDate(new Date()),
}: ExamAgendaListProps) {
  const colorMap = useMemo(() => buildClassColorMap(slots), [slots])
  const highlightRef = useRef<HTMLLIElement | null>(null)
  const normalizedHighlight = highlightEventCode?.replace(/\s+/g, '').toUpperCase()

  const isMatchSlot = useCallback(
    (slot: ScheduleSlot) => {
      if (!normalizedHighlight) return false
      if (['EXAM', 'EXAMS', 'สอบ', 'การสอบ', 'ตารางสอบ', 'FINAL', 'MIDTERM'].includes(normalizedHighlight)) {
        return false
      }
      const code = slot.eventCode?.replace(/\s+/g, '').toUpperCase()
      const name = slot.eventName?.replace(/\s+/g, '').toUpperCase()
      return (
        code === normalizedHighlight ||
        (Boolean(code) && normalizedHighlight.includes(code)) ||
        (Boolean(name) && name.includes(normalizedHighlight))
      )
    },
    [normalizedHighlight],
  )

  const isPast = useCallback((slot: ScheduleSlot) => Boolean(slot.eventDate) && slot.eventDate! < today, [today])
  const upcomingGroups = useMemo(() => groupByDate(slots.filter((s) => !isPast(s))), [slots, isPast])
  const pastGroups = useMemo(() => groupByDate(slots.filter(isPast)).reverse(), [slots, isPast])
  const pastCount = useMemo(() => slots.filter(isPast).length, [slots, isPast])

  // A searched exam that already happened opens the past section so it can be shown.
  const highlightIsPast = useMemo(() => slots.some((s) => isPast(s) && isMatchSlot(s)), [slots, isPast, isMatchSlot])
  const [showPast, setShowPast] = useState<boolean | null>(null)
  const pastOpen = showPast ?? highlightIsPast

  const firstMatchingKey = useMemo(() => {
    if (!normalizedHighlight) return null
    const visible = [...upcomingGroups, ...(pastOpen ? pastGroups : [])]
    for (const group of visible) {
      for (const slot of group.slots) if (isMatchSlot(slot)) return slotKeyOf(slot)
    }
    return null
  }, [upcomingGroups, pastGroups, pastOpen, normalizedHighlight, isMatchSlot])

  useEffect(() => {
    if (!firstMatchingKey || !highlightRef.current) return
    const timer = setTimeout(() => {
      highlightRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    }, 180)
    return () => clearTimeout(timer)
  }, [firstMatchingKey, slots])

  if (slots.length === 0) {
    return (
      <p className="py-6 text-center text-button text-ink-3">
        <span className="block font-medium text-ink">ไม่มีข้อมูลการสอบในห้องนี้</span>
        ยังไม่มีการประกาศตารางสอบของห้องนี้ในภาคการศึกษานี้
      </p>
    )
  }

  const renderGroup = (group: ExamDateGroup) => (
    <section key={group.dateKey} aria-label={group.formattedDate}>
      <h4 className="mb-1.5 flex items-baseline gap-1.5 text-xs font-semibold text-ink">
        <span>{group.formattedDate}</span>
        <span className="font-normal text-ink-3">({group.slots.length} วิชา)</span>
      </h4>
      <ul className="divide-y divide-line-soft border border-line-soft bg-white">
        {group.slots.map((slot) => {
          const key = slotKeyOf(slot)
          const seats = extractSeatsInfo(slot.eventName)
          const extra = extraName(slot)
          const isHighlighted = isMatchSlot(slot)
          const otherRoom = slot.roomCode && roomCode && slot.roomCode !== roomCode ? slot.roomCode : null
          return (
            <li
              key={key}
              ref={key === firstMatchingKey ? highlightRef : undefined}
              data-testid={isHighlighted ? 'exam-card-highlighted' : undefined}
              data-highlighted={isHighlighted ? 'true' : undefined}
              className={`scroll-my-6 flex items-center gap-2.5 py-2 pl-2 pr-1.5 ${isHighlighted ? 'bg-accent/5' : ''}`}
            >
              <span aria-hidden="true" className={`h-8 w-1 shrink-0 rounded-full ${entryColors(slot, colorMap)}`} />
              <span className="w-[5.25rem] shrink-0 font-mono text-xs text-ink-2">
                {slot.startTime}–{slot.endTime}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5">
                  <span className="font-mono text-button font-bold text-ink">{slot.eventCode}</span>
                  {seats && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-3">
                      <Users size={11} weight="bold" aria-hidden="true" />
                      <span>{seats}</span>
                    </span>
                  )}
                  {isHighlighted && <span className="text-[11px] font-semibold text-accent">วิชาที่ค้นหา</span>}
                </div>
                {(extra || otherRoom || !slot.eventDate) && (
                  <p className="truncate text-[11px] text-ink-3" title={slot.eventName}>
                    {[extra, otherRoom && `ห้อง ${otherRoom}`, !slot.eventDate && getExamDateLabel(slot)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {renderActions ? renderActions(slot) : <PinButton slot={slot} />}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )

  return (
    <div className="space-y-3" data-testid="exam-agenda-list">
      {upcomingGroups.length > 0 ? (
        upcomingGroups.map(renderGroup)
      ) : (
        <p className="text-button text-ink-3">ไม่มีสอบที่กำลังจะมาถึงในห้องนี้</p>
      )}

      {pastCount > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowPast(!pastOpen)}
            aria-expanded={pastOpen}
            className="flex w-full items-center justify-between border-t border-line-soft pt-2.5 text-xs font-medium text-ink-2 hover:text-ink"
          >
            <span>สอบที่ผ่านไปแล้ว ({pastCount})</span>
            <CaretDown size={12} weight="bold" aria-hidden="true" className={pastOpen ? 'rotate-180' : ''} />
          </button>
          {pastOpen && pastGroups.map(renderGroup)}
        </div>
      )}
    </div>
  )
}
