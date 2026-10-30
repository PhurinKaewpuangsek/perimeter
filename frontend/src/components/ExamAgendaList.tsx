import { useMemo, useRef, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { CalendarBlank, Clock, GraduationCap, MapPin, Users, Sparkle } from '@phosphor-icons/react'
import type { ScheduleSlot } from '../types/schedule'
import PinButton from './PinButton'
import { buildClassColorMap, entryColors } from '../services/timetableColors'
import { getExamDateLabel, formatThaiDateHeader, extractSeatsInfo } from '../services/scheduleDisplay'

export interface ExamAgendaListProps {
  slots: ScheduleSlot[]
  renderActions?: (slot: ScheduleSlot) => ReactNode
  roomCode?: string
  highlightEventCode?: string | null
}

interface ExamDateGroup {
  dateKey: string
  formattedDate: string
  dayOfWeek: string
  slots: ScheduleSlot[]
}

export default function ExamAgendaList({
  slots,
  renderActions,
  roomCode,
  highlightEventCode,
}: ExamAgendaListProps) {
  const colorMap = useMemo(() => buildClassColorMap(slots), [slots])
  const highlightRef = useRef<HTMLDivElement | null>(null)

  const normalizedHighlight = highlightEventCode?.replace(/\s+/g, '').toUpperCase()

  const isMatchSlot = useCallback((slot: ScheduleSlot) => {
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
  }, [normalizedHighlight])

  // Group and sort exams chronologically
  const groups = useMemo(() => {
    // Sort slots by date (ascending), then startTime, then eventCode
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
      let grp = groupMap.get(key)
      if (!grp) {
        grp = {
          dateKey: key,
          formattedDate: formatThaiDateHeader(slot.eventDate, slot.dayOfWeek),
          dayOfWeek: slot.dayOfWeek,
          slots: [],
        }
        groupMap.set(key, grp)
      }
      grp.slots.push(slot)
    }

    return Array.from(groupMap.values())
  }, [slots])

  // Key of the first matching exam slot to attach highlightRef for auto slide-down
  const firstMatchingKey = useMemo(() => {
    if (!normalizedHighlight) return null
    for (const group of groups) {
      for (const slot of group.slots) {
        if (isMatchSlot(slot)) {
          return `${slot.roomCode}-${slot.eventCode}-${slot.eventDate}-${slot.startTime}`
        }
      }
    }
    return null
  }, [groups, normalizedHighlight, isMatchSlot])

  useEffect(() => {
    if (!firstMatchingKey || !highlightRef.current) return
    const timer = setTimeout(() => {
      highlightRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
      })
    }, 180)
    return () => clearTimeout(timer)
  }, [firstMatchingKey, slots])

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-soft bg-surface-2/40 py-10 px-4 text-center">
        <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-surface-3 text-ink-3">
          <GraduationCap size={20} weight="duotone" />
        </div>
        <p className="text-button font-bold text-ink">ไม่มีข้อมูลการสอบในห้องนี้</p>
        <p className="mt-1 text-xs text-ink-3">
          ห้องนี้ไม่มีกำหนดการสอบในภาคการศึกษานี้ หรือยังไม่มีการประกาศตารางสอบ
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="exam-agenda-list">
      {groups.map((group) => (
        <section key={group.dateKey} className="space-y-2">
          {/* Group Date Header */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex items-center gap-1.5 rounded-lg border border-line-soft bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink">
              <CalendarBlank size={14} weight="bold" className="text-secondary" />
              <span>{group.formattedDate}</span>
            </div>
            <span className="text-[11px] font-medium text-ink-3">({group.slots.length} วิชา)</span>
            <div className="flex-1 border-t border-line-soft/60" />
          </div>

          {/* Exam Cards for this date */}
          <div className="grid gap-2.5">
            {group.slots.map((slot) => {
              const seats = extractSeatsInfo(slot.eventName)
              const examDateLabel = getExamDateLabel(slot)
              const colorClass = entryColors(slot, colorMap)
              const resolvedRoom = slot.roomCode || roomCode
              const slotKey = `${slot.roomCode}-${slot.eventCode}-${slot.eventDate}-${slot.startTime}`
              const isHighlighted = isMatchSlot(slot)
              const isFirstMatch = slotKey === firstMatchingKey

              return (
                <div
                  ref={isFirstMatch ? highlightRef : undefined}
                  key={slotKey}
                  data-testid={isHighlighted ? 'exam-card-highlighted' : undefined}
                  data-highlighted={isHighlighted ? 'true' : undefined}
                  className={`card scroll-my-6 flex flex-col justify-between gap-3 p-3.5 transition-all duration-300 sm:flex-row sm:items-center ${
                    isHighlighted
                      ? 'border-2 border-accent bg-accent/5 ring-4 ring-accent/15 shadow-md'
                      : 'border border-line-soft hover:border-line hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Course Color Pill Indicator */}
                    <div
                      className={`h-10 w-1.5 shrink-0 rounded-full ${colorClass}`}
                      aria-hidden="true"
                    />

                    <div className="min-w-0 flex-1">
                      {/* Top Row: Code + Highlight Badge + Seats Badge + Exam Date */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-base font-bold text-ink">
                          {slot.eventCode}
                        </span>
                        {isHighlighted && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white shadow-xs">
                            <Sparkle size={12} weight="fill" />
                            <span>วิชาที่ค้นหา</span>
                          </span>
                        )}
                        {seats && (
                          <span className="inline-flex items-center gap-1 rounded bg-secondary/10 px-1.5 py-0.5 text-[11px] font-medium text-secondary">
                            <Users size={12} weight="bold" />
                            <span>{seats}</span>
                          </span>
                        )}
                        {slot.eventDate ? (
                          <span className="text-[11px] text-ink-3">
                            วันสอบ: {slot.eventDate}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-600 font-medium">
                            {examDateLabel}
                          </span>
                        )}
                      </div>

                      {/* Event Full Name if distinct from code */}
                      {slot.eventName && slot.eventName !== slot.eventCode && (
                        <p className="mt-0.5 truncate text-xs text-ink-2" title={slot.eventName}>
                          {slot.eventName}
                        </p>
                      )}

                      {/* Time and Room metadata */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                        <div className="flex items-center gap-1 font-mono">
                          <Clock size={13} weight="bold" className="text-ink-2" />
                          <span>
                            {slot.startTime}–{slot.endTime}
                          </span>
                        </div>
                        {resolvedRoom && (
                          <div className="flex items-center gap-1 font-medium">
                            <MapPin size={13} weight="fill" className="text-secondary" />
                            <span>ห้อง {resolvedRoom}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions (Pin button) */}
                  <div className="shrink-0 self-end sm:self-center">
                    {renderActions ? (
                      renderActions(slot)
                    ) : (
                      <PinButton slot={slot} showLabel />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

