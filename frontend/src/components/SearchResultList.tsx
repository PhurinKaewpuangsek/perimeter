import type { Room } from '../types/room.ts'
import type { ScheduleSlot } from '../types/schedule.ts'

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
      <p className="px-4 py-6 text-center text-sm text-slate-500">กำลังโหลดข้อมูลห้อง...</p>
    )
  }

  if (error) {
    return (
      <p className="px-4 py-6 text-center text-sm text-red-600">
        เกิดข้อผิดพลาดในการโหลดข้อมูลห้อง: {error.message}
      </p>
    )
  }

  if (rooms.length === 0) {
    if (schedulesLoading) {
      return (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          กำลังโหลดตารางเรียนหรือไม่พบห้องที่ค้นหา...
        </p>
      )
    }

    return (
      <p className="px-4 py-6 text-center text-sm text-slate-500">
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
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {rooms.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-900">
                  {room.code || room.roomNumber || room.id}
                </span>
                <span className="text-sm text-slate-600">{room.nameThai || 'ไม่มีชื่อห้อง'}</span>
                {schedules
                  .filter((schedule) => schedule.roomCode.toLowerCase() === room.code.toLowerCase())
                  .map((schedule) => (
                    <span
                      key={`${schedule.roomCode}-${schedule.dayOfWeek}-${schedule.startTime}-${schedule.eventCode}`}
                      className="text-xs text-slate-500"
                    >
                      {schedule.eventCode} · {schedule.eventName || 'ไม่มีชื่อวิชา'} ·{' '}
                      {schedule.dayOfWeek} {schedule.startTime}-{schedule.endTime} · {room.code}
                    </span>
                  ))}
              </button>
            </li>
          ))}
        </ul>
        {schedulesLoading && (
          <p className="px-4 py-2 text-center text-xs text-slate-500">กำลังโหลดตารางเรียน...</p>
        )}
        {schedulesError && (
          <p className="px-4 py-2 text-center text-xs text-red-600">
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
                className="group flex w-full flex-col items-start gap-1 rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer active:scale-[0.99]"
              >
                {/* Header Row: Room Code + Floor + View CTA */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-extrabold font-mono text-slate-900 group-hover:text-rose-600 transition-colors">
                      {room.code || room.roomNumber || room.id}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      ชั้น {room.floor}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-700 transition-colors">
                    ดูห้อง →
                  </span>
                </div>

                {/* Room Name Thai */}
                <span className="text-xs font-semibold text-slate-600">
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
                          className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1 text-xs"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-bold font-mono text-slate-900 text-[11px]">
                              {schedule.eventCode}
                            </span>
                            {schedule.eventType.toLowerCase() === 'exam' && (
                              <span className="rounded bg-rose-100 px-1 py-0.2 text-[9px] font-bold text-rose-700">
                                สอบ
                              </span>
                            )}
                            {schedule.eventName && !isCodeNameDuplicate && (
                              <span className="text-slate-500 truncate text-[11px] max-w-[130px]">
                                {schedule.eventName}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] font-semibold text-slate-500 font-mono">
                            {dayTh} {schedule.startTime}-{schedule.endTime}
                          </span>
                        </div>
                      )
                    })}

                    {/* More Matching Slots Indicator */}
                    {remainingCount > 0 && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 pl-0.5 pt-0.5">
                        <span>+ อีก {remainingCount} คาบที่ตรงกัน</span>
                        <span className="text-slate-400 font-normal">· คลิกดูตารางเต็ม</span>
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
        <p className="px-4 py-2 text-center text-xs text-slate-500">กำลังโหลดตารางเรียน...</p>
      )}
      {schedulesError && (
        <p className="px-4 py-2 text-center text-xs text-red-600">
          ไม่สามารถโหลดรายละเอียดตารางเรียนได้
        </p>
      )}
    </div>
  )
}
