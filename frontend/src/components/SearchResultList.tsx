import type { Room } from '../types/room.ts'
import type { ScheduleSlot } from '../types/schedule.ts'
import { getExamDateLabel, isExamSchedule } from '../services/scheduleDisplay.ts'

interface SearchResultListProps {
  rooms: Room[]
  schedules: ScheduleSlot[]
  schedulesLoading: boolean
  schedulesError: Error | null
  loading: boolean
  error: Error | null
  onSelectRoom: (roomId: string) => void
  /**
   * 'preview' (default): Modern Top 2 Preview + more badge for sidebar & landing
   * 'legacy': Raw text strings for backwards-compatibility with existing unit tests
   */
  variant?: 'preview' | 'legacy'
}

const DAY_ORDER: Record<string, number> = {
  MON: 1,
  MONDAY: 1,
  TUE: 2,
  TUESDAY: 2,
  WED: 3,
  WEDNESDAY: 3,
  THU: 4,
  THURSDAY: 4,
  FRI: 5,
  FRIDAY: 5,
  SAT: 6,
  SATURDAY: 6,
  SUN: 7,
  SUNDAY: 7,
}

const DAY_SHORT_TH: Record<string, string> = {
  MON: 'จ.',
  MONDAY: 'จ.',
  TUE: 'อ.',
  TUESDAY: 'อ.',
  WED: 'พ.',
  WEDNESDAY: 'พ.',
  THU: 'พฤ.',
  THURSDAY: 'พฤ.',
  FRI: 'ศ.',
  FRIDAY: 'ศ.',
  SAT: 'ส.',
  SATURDAY: 'ส.',
  SUN: 'อา.',
  SUNDAY: 'อา.',
}

export default function SearchResultList({
  rooms,
  schedules,
  schedulesLoading,
  schedulesError,
  loading,
  error,
  onSelectRoom,
  variant = 'preview',
}: SearchResultListProps) {
  if (loading) {
    return (
      <p className="px-4 py-6 text-center text-button text-ink-3">กำลังโหลดข้อมูลห้อง...</p>
    )
  }

  if (error) {
    return (
      <p className="px-4 py-6 text-center text-button text-ink">
        เกิดข้อผิดพลาดในการโหลดข้อมูลห้อง: {error.message}
      </p>
    )
  }

  if (rooms.length === 0) {
    if (schedulesLoading) {
      return (
        <p className="px-4 py-6 text-center text-button text-ink-3">
          กำลังโหลดตารางเรียนหรือไม่พบห้องที่ค้นหา...
        </p>
      )
    }

    return (
      <p className="px-4 py-6 text-center text-button text-ink-3">
        ไม่พบห้องที่ค้นหา ลองเปลี่ยนคำค้นหาหรือหมวดหมู่ดูนะ
      </p>
    )
  }

  // ---------------------------------------------------------------------------
  // LEGACY VARIANT (Preserves exact raw text strings for existing unit tests)
  // ---------------------------------------------------------------------------
  if (variant === 'legacy') {
    return (
      <>
        <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto">
          {rooms.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="text-button font-bold text-ink">
                  {room.code || room.roomNumber || room.id}
                </span>
                <span className="text-button text-ink-2">{room.nameThai || 'ไม่มีชื่อห้อง'}</span>
                {schedules
                  .filter((schedule) => schedule.roomCode.toLowerCase() === room.code.toLowerCase())
                  .map((schedule) => (
                    <span
                      key={`${schedule.roomCode}-${schedule.dayOfWeek}-${schedule.startTime}-${schedule.eventCode}`}
                      className="text-xs text-ink-3"
                    >
                      {schedule.eventCode} · {schedule.eventName || 'ไม่มีชื่อวิชา'} ·{' '}
                      {schedule.dayOfWeek} {schedule.startTime}-{schedule.endTime}
                      {getExamDateLabel(schedule) && ` · ${getExamDateLabel(schedule)}`}
                      {' · '}{room.code}
                    </span>
                  ))}
              </button>
            </li>
          ))}
        </ul>
        {schedulesLoading && (
          <p className="px-4 py-2 text-center text-xs text-ink-3">กำลังโหลดตารางเรียน...</p>
        )}
        {schedulesError && (
          <p className="px-4 py-2 text-center text-xs text-ink">
            ไม่สามารถโหลดรายละเอียดตารางเรียนได้
          </p>
        )}
      </>
    )
  }

  // ---------------------------------------------------------------------------
  // PREVIEW VARIANT (Top 2 Preview + ดูเพิ่มเติม for Modern Left Sidebar)
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {rooms.map((room) => {
          // Find matching schedules for this room and sort chronologically
          const roomSchedules = schedules
            .filter((schedule) => schedule.roomCode.toLowerCase() === room.code.toLowerCase())
            .sort((a, b) => {
              const orderA = DAY_ORDER[a.dayOfWeek.toUpperCase()] ?? 99
              const orderB = DAY_ORDER[b.dayOfWeek.toUpperCase()] ?? 99
              if (orderA !== orderB) return orderA - orderB
              return a.startTime.localeCompare(b.startTime)
            })

          const topSchedules = roomSchedules.slice(0, 2)
          const remainingCount = roomSchedules.length - 2

          return (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className="card card-hover group flex w-full cursor-pointer flex-col items-start gap-1 p-3 text-left hover:border-line"
              >
                {/* Header Row: Room Code + Floor + View CTA */}
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-button font-bold text-ink transition-colors group-hover:text-accent">
                      {room.code || room.roomNumber || room.id}
                    </span>
                    <span className="text-xs font-medium text-ink-3">ชั้น {room.floor}</span>
                  </div>
                  <span className="text-xs font-medium text-ink-3 transition-colors group-hover:text-ink">
                    ดูห้อง →
                  </span>
                </div>

                {/* Room Name Thai */}
                <span className="text-xs font-medium text-ink-2">
                  {room.nameThai || 'ไม่ระบุชื่อห้อง'}
                </span>

                {/* Top 2 Matching Schedule Slots Preview */}
                {roomSchedules.length > 0 && (
                  <div className="mt-1.5 w-full space-y-1">
                    {topSchedules.map((schedule, idx) => {
                      const isCodeNameDuplicate =
                        schedule.eventName &&
                        schedule.eventName.replace(/\s+/g, '').toLowerCase() ===
                          schedule.eventCode.replace(/\s+/g, '').toLowerCase()
                      const dayTh =
                        DAY_SHORT_TH[schedule.dayOfWeek.toUpperCase()] ?? schedule.dayOfWeek

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between border border-line-soft bg-surface-2 px-2.5 py-1 text-xs"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-mono text-xs font-bold text-ink">
                              {schedule.eventCode}
                            </span>
                            {isExamSchedule(schedule) && (
                              <span className="rounded-full border border-line bg-tertiary px-1.5 text-xs font-bold text-ink">
                                สอบ
                              </span>
                            )}
                            {schedule.eventName && !isCodeNameDuplicate && (
                              <span className="max-w-[130px] truncate text-xs text-ink-3">
                                {schedule.eventName}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-right font-mono text-xs font-medium text-ink-2">
                            <span className="block">
                              {dayTh} {schedule.startTime}-{schedule.endTime}
                            </span>
                            {getExamDateLabel(schedule) && (
                              <span className="block font-bold text-ink">
                                {getExamDateLabel(schedule)}
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}

                    {/* More Matching Slots Indicator */}
                    {remainingCount > 0 && (
                      <div className="flex items-center gap-1 pt-0.5 pl-0.5 text-xs font-medium text-ink">
                        <span>+ อีก {remainingCount} คาบที่ตรงกัน</span>
                        <span className="font-normal text-ink-3">· คลิกดูตารางเต็ม</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {schedulesLoading && (
        <p className="px-4 py-2 text-center text-xs text-ink-3">กำลังโหลดตารางเรียน...</p>
      )}
      {schedulesError && (
        <p className="px-4 py-2 text-center text-xs text-ink">
          ไม่สามารถโหลดรายละเอียดตารางเรียนได้
        </p>
      )}
    </div>
  )
}
