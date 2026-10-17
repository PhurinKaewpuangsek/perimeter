import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookmarkSimple, CircleNotch } from '@phosphor-icons/react'
import { usePins, computeScheduleSlot } from '../hooks/usePins'
import { getSession } from '../services/authService'
import type { ScheduleSlot } from '../types/schedule'
import type { PinnedSchedule } from '../types/pin'

export interface PinButtonProps {
  slot: ScheduleSlot | PinnedSchedule
  className?: string
  showLabel?: boolean
}

export default function PinButton({ slot, className = '', showLabel = false }: PinButtonProps) {
  const navigate = useNavigate()
  const { pins, isPinned, togglePin, addPin } = usePins()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scheduleSlot = computeScheduleSlot(slot)
  const pinned = isPinned(slot.roomCode, scheduleSlot)

  useEffect(() => {
    if (!pinned || !slot.eventDate) return
    const storedPin = pins.find(
      (p) =>
        p.roomCode === slot.roomCode &&
        (p.scheduleSlot === scheduleSlot || p.pinKey === `${slot.roomCode}#${scheduleSlot}`),
    )
    if (storedPin && (storedPin.eventDate || '') !== slot.eventDate) {
      void addPin(slot)
    }
  }, [pinned, slot, scheduleSlot, pins, addPin])

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const session = getSession()
    if (!session) {
      // Guests are redirected to /login per spec
      navigate('/login')
      return
    }

    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await togglePin(slot)
    } catch (err) {
      console.error('Failed to toggle pin:', err)
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const title = pinned ? 'นำออกจากตารางของฉัน' : 'บันทึกในตารางของฉัน'
  const testId = `pin-button-${slot.roomCode}-${scheduleSlot}`

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        data-testid={testId}
        aria-label={title}
        title={title}
        className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all cursor-pointer ${
          pinned
            ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 shadow-2xs'
            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 hover:text-slate-900'
        } ${className}`}
      >
        {submitting ? (
          <CircleNotch size={14} weight="bold" className="animate-spin text-slate-500" />
        ) : (
          <BookmarkSimple
            size={14}
            weight={pinned ? 'fill' : 'bold'}
            className={pinned ? 'text-amber-600' : 'text-slate-400 group-hover:text-slate-600'}
          />
        )}
        {showLabel && <span>{pinned ? 'บันทึกแล้ว' : 'บันทึก'}</span>}
      </button>
      {error && (
        <span
          role="alert"
          className="text-[10px] font-medium text-rose-600 animate-fadeIn"
        >
          {error}
        </span>
      )}
    </div>
  )
}
