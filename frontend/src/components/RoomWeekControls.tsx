import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { addDays } from '../services/scheduleDisplay'
import { formatWeekRange } from '../services/roomWeek'

interface WeekNavigatorProps {
  /** Monday (YYYY-MM-DD) of the week shown. */
  weekStart: string
  /** Monday of the current week, for "สัปดาห์นี้". */
  thisWeekStart: string
  onChange: (weekStart: string) => void
}

/** ‹ week › that names the current week "สัปดาห์นี้" and offers a way back to it. */
export function WeekNavigator({ weekStart, thisWeekStart, onChange }: WeekNavigatorProps) {
  const isThisWeek = weekStart === thisWeekStart
  return (
    <div role="group" aria-label="เลือกสัปดาห์" className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(addDays(weekStart, -7))}
        aria-label="สัปดาห์ก่อน"
        className="btn btn-ghost btn-icon-sm shrink-0"
      >
        <CaretLeft size={14} weight="bold" />
      </button>
      <div className="min-w-[7.5rem] text-center leading-tight" aria-live="polite">
        <p className="text-xs font-bold text-ink">{isThisWeek ? 'สัปดาห์นี้' : formatWeekRange(weekStart)}</p>
        {isThisWeek && <p className="text-[10px] text-ink-3">{formatWeekRange(weekStart)}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(addDays(weekStart, 7))}
        aria-label="สัปดาห์หน้า"
        className="btn btn-ghost btn-icon-sm shrink-0"
      >
        <CaretRight size={14} weight="bold" />
      </button>
      {!isThisWeek && (
        <button
          type="button"
          onClick={() => onChange(thisWeekStart)}
          className="btn btn-secondary btn-sm shrink-0 px-2 py-0.5 text-[11px]"
        >
          สัปดาห์นี้
        </button>
      )}
    </div>
  )
}
