import type { Room } from '../types/room.ts'
import type { ScheduleSlot } from '../types/schedule.ts'
import type { Closure } from '../types/graph.ts'
import {
  getExamDateLabel,
  formatExamDateTime,
  getThaiShortDayLabel,
  isExamSchedule,
} from '../services/scheduleDisplay.ts'
import { getSession } from '../services/authService.ts'
import PinButton from './PinButton.tsx'

interface SearchResultListProps {
  rooms: Room[]
  allRooms?: Room[]
  schedules: ScheduleSlot[]
  activityResults?: ScheduleSlot[]
  roomClosures?: ReadonlyMap<string, Closure>
  closureStatusUnavailable?: boolean
  examResults?: ScheduleSlot[]
  examSearchActive?: boolean
  pastExamsAvailable?: boolean
  showPastExams?: boolean
  onToggleShowPastExams?: () => void
  schedulesLoading: boolean
  schedulesError: Error | null
  loading: boolean
  error: Error | null
  onSelectRoom: (roomId: string) => void
  onNavigateToRoom?: (roomId: string) => void
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

export default function SearchResultList({
  rooms,
  allRooms = rooms,
  schedules,
  activityResults = [],
  roomClosures,
  closureStatusUnavailable = false,
  examResults = [],
  examSearchActive = false,
  pastExamsAvailable = false,
  showPastExams = false,
  onToggleShowPastExams,
  schedulesLoading,
  schedulesError,
  loading,
  error,
  onSelectRoom,
  onNavigateToRoom,
  variant = 'preview',
}: SearchResultListProps) {
  const examResultsSection = examSearchActive ? (
    <section className="space-y-2" aria-label="ผลการค้นหาการสอบ">
      {examResults.length > 0 ? (
        <ul className="space-y-2">
          {examResults.map((schedule) => {
            const room = allRooms.find(
              (candidate) => candidate.code.toLowerCase() === schedule.roomCode.toLowerCase()
            )

            return (
              <li
                key={`${schedule.roomCode}-${schedule.eventCode}-${schedule.eventDate}-${schedule.startTime}`}
                className="card space-y-2 p-3"
              >
                <div>
                  <h3 className="text-button font-bold text-ink">สอบ: {schedule.eventCode}</h3>
                  <p className="mt-1 text-button text-ink-2">{formatExamDateTime(schedule)}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    {room
                      ? `อาคาร ${room.building} · ห้อง ${room.code} ชั้น ${room.floor}`
                      : `ห้อง ${schedule.roomCode} · ไม่พบข้อมูลตำแหน่งห้อง`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!room}
                    onClick={() => {
                      if (!room) return
                      if (onNavigateToRoom) onNavigateToRoom(room.id)
                      else onSelectRoom(room.id)
                    }}
                    className="btn btn-primary btn-sm"
                    aria-label={`นำทางไปห้องสอบ ${schedule.roomCode}`}
                  >
                    นำทางไปห้องสอบ
                  </button>
                  {Boolean(getSession()) && <PinButton slot={schedule} />}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-4 py-4 text-center text-button text-ink-3">
          {schedulesLoading
            ? 'กำลังโหลดตารางสอบ...'
            : pastExamsAvailable
              ? 'ไม่พบการสอบที่กำลังจะมาถึง'
              : 'ไม่พบการสอบที่ตรงกับรหัสวิชา ลองตรวจสอบรหัสวิชาอีกครั้ง'}
        </p>
      )}
      {pastExamsAvailable && onToggleShowPastExams && (
        <button
          type="button"
          onClick={onToggleShowPastExams}
          className="btn btn-ghost btn-sm w-full"
        >
          {showPastExams ? 'แสดงเฉพาะการสอบที่ยังไม่ผ่าน' : 'แสดงการสอบทั้งหมด รวมการสอบที่ผ่านมา'}
        </button>
      )}
      {schedulesError && (
        <p className="px-4 py-2 text-center text-xs text-ink">
          ไม่สามารถโหลดรายละเอียดตารางสอบได้
        </p>
      )}
    </section>
  ) : null

  const activityResultsSection = activityResults.length > 0 ? (
    <section className="space-y-2" aria-label="ผลการค้นหากิจกรรม">
      <ul className="space-y-2">
        {activityResults.map((schedule) => {
          const room = allRooms.find(
            (candidate) => candidate.code.toLowerCase() === schedule.roomCode.toLowerCase()
          )
          const closure = room ? roomClosures?.get(room.id) : undefined
          const eventName = schedule.eventName || schedule.eventCode || 'กิจกรรม'
          const dayLabel = getThaiShortDayLabel(schedule.dayOfWeek)
          const scheduleDate = schedule.eventDate ? `${dayLabel} ${schedule.eventDate}` : dayLabel
          const closed = Boolean(closure?.closed)

          return (
            <li
              key={`${schedule.roomCode}-${schedule.eventCode}-${schedule.eventDate ?? ''}-${schedule.dayOfWeek}-${schedule.startTime}`}
              className="card space-y-2 p-3"
            >
              <div>
                <h3 className="text-button font-bold text-ink">{eventName}</h3>
                {schedule.eventCode && schedule.eventCode !== eventName && (
                  <p className="mt-1 text-xs text-ink-3">{schedule.eventCode}</p>
                )}
                <p className="mt-1 text-button text-ink-2">
                  {scheduleDate} {schedule.startTime}–{schedule.endTime}
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  {room
                    ? `อาคาร ${room.building} · ห้อง ${room.code} ชั้น ${room.floor}`
                    : `ห้อง ${schedule.roomCode} · ไม่พบข้อมูลตำแหน่งห้อง`}
                </p>
                {closed && (
                  <div role="status" className="mt-2 border border-ink bg-surface-2 p-2 text-xs text-ink">
                    <p className="font-bold">ห้องนี้ปิดชั่วคราว</p>
                    {closure?.closedReason && <p className="mt-0.5">เหตุผล: {closure.closedReason}</p>}
                  </div>
                )}
                {!closed && closureStatusUnavailable && (
                  <p role="status" className="mt-2 text-xs text-ink-2">
                    ตรวจสอบสถานะห้องปิดไม่ได้ในขณะนี้
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={!room || closed || closureStatusUnavailable}
                onClick={() => {
                  if (!room || closed || closureStatusUnavailable) return
                  if (onNavigateToRoom) onNavigateToRoom(room.id)
                  else onSelectRoom(room.id)
                }}
                className="btn btn-primary btn-sm"
                aria-label={`นำทางไปกิจกรรม ${eventName}`}
              >
                นำทาง
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  ) : null

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
    if (examSearchActive || activityResults.length > 0) {
      return (
        <>
          {activityResultsSection}
          {examResultsSection}
        </>
      )
    }
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
        {activityResultsSection}
        {examResultsSection}
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
      {activityResultsSection}
      {examResultsSection}
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
                      const dayTh = getThaiShortDayLabel(schedule.dayOfWeek)

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
