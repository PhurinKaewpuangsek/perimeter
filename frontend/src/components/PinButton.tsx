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
      void addPin(slot).catch((err) => {
        console.error('Failed to refresh pin event date:', err)
        setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      })
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
        className={`mochi-btn text-xs font-bold ${
          pinned ? 'mochi-btn-pinned' : 'mochi-btn-unpinned'
        } ${
          showLabel ? 'h-8 w-8 sm:w-auto sm:px-3 sm:h-8' : 'h-8 px-3'
        } ${className}`}
      >
        {submitting ? (
          <CircleNotch size={14} weight="bold" className="animate-spin" />
        ) : (
          <BookmarkSimple size={14} weight={pinned ? 'fill' : 'bold'} />
        )}
        {showLabel && (
          <span className="hidden sm:inline">
            {pinned ? 'บันทึกแล้ว' : 'บันทึก'}
          </span>
        )}
      </button>
      {error && (
        <span
          role="alert"
          className="text-xs font-medium text-ink"
        >
          {error}
        </span>
      )}
    </div>
  )
}
