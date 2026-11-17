import { CalendarCheck } from '@phosphor-icons/react'
import type { Room } from '../types/room'
import type { ScheduleSlot } from '../types/schedule'
import type { Reminder } from '../services/scheduleReminders'
import {
  formatExamDateTime,
  getRelativeDayLabel,
  getSlotDisplayLabel,
  isActivitySchedule,
  isExamSchedule,
} from '../services/scheduleDisplay'

interface MyScheduleRemindersProps {
  /** From getUpcomingReminders over the user's pins. */
  reminders: Reminder[]
  rooms: Room[]
  /** YYYY-MM-DD, for "วันนี้" and "พรุ่งนี้". */
  today: string
  onSelect: (roomId: string, slot: ScheduleSlot) => void
  /** Opens the full My Schedule drawer. */
  onOpenAll: () => void
}

function whenText({ slot, date, ongoing }: Reminder, today: string): string {
  if (ongoing) return `ตอนนี้ ถึง ${slot.endTime}`
  const relative = getRelativeDayLabel(date, today)
  return relative ? `${relative} ${slot.startTime}–${slot.endTime}` : formatExamDateTime({ ...slot, eventDate: date })
}

/** What is next in the user's pinned schedule, so the empty map panel reminds them where to go. */
export default function MyScheduleReminders({ reminders, rooms, today, onSelect, onOpenAll }: MyScheduleRemindersProps) {
  if (reminders.length === 0) return null
  return (
    <section aria-label="ถัดไปในตารางของฉัน" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-ink-2">
          <CalendarCheck size={14} weight="bold" aria-hidden="true" />
          ถัดไปในตารางของฉัน
        </h3>
        <button type="button" onClick={onOpenAll} className="text-xs font-semibold text-accent hover:text-accent-hover">
          ดูทั้งหมด
        </button>
      </div>
      <ul className="space-y-1.5">
        {reminders.map((reminder) => {
          const { slot } = reminder
          const room = rooms.find((r) => r.code.toLowerCase() === slot.roomCode.toLowerCase())
          const kind = isExamSchedule(slot) ? 'สอบ' : isActivitySchedule(slot) ? 'กิจกรรม' : null
          return (
            <li key={`${slot.roomCode}#${slot.dayOfWeek}#${slot.startTime}#${slot.eventCode}#${slot.eventDate ?? ''}`}>
              <button
                type="button"
                disabled={!room}
                onClick={() => room && onSelect(room.id, slot)}
                className="card w-full p-2.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default"
              >
                <span className="block font-mono text-xs font-semibold text-ink-2">{whenText(reminder, today)}</span>
                <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-button font-bold text-ink">{getSlotDisplayLabel(slot)}</span>
                  {kind && <span className="shrink-0 text-[11px] font-medium text-ink-3">{kind}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-ink-3">
                  {room ? `ห้อง ${room.roomNumber || room.code} ชั้น ${room.floor}` : `ห้อง ${slot.roomCode}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
