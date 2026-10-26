import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { getPins, createPin, deletePin } from '../services/pinsService'
import { getSession } from '../services/authService'
import { PinsContext, computeScheduleSlot } from './pinsContextDef'
import type { PinnedSchedule } from '../types/pin'
import type { ScheduleSlot } from '../types/schedule'

export function PinsProvider({ children }: { children: ReactNode }) {
  const [pins, setPins] = useState<PinnedSchedule[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false)
  const location = useLocation()
  const lastSubRef = useRef<string | null>(null)

  const reloadPins = useCallback(async () => {
    const session = getSession()
    const sub = session?.user?.sub ?? null

    if (!session || !sub) {
      lastSubRef.current = null
      setPins([])
      setIsDrawerOpen(false)
      setError(null)
      setLoading(false)
      return
    }

    if (lastSubRef.current !== sub) {
      lastSubRef.current = sub
      setPins([])
      setIsDrawerOpen(false)
    }

    setLoading(true)
    setError(null)
    try {
      const data = await getPins()
      if (getSession()?.user?.sub === sub) {
        setPins(data)
      }
    } catch (err) {
      if (getSession()?.user?.sub === sub) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      if (getSession()?.user?.sub === sub) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const sub = getSession()?.user?.sub ?? null
    if (sub !== lastSubRef.current) {
      void reloadPins()
    }

    const onFocus = () => void reloadPins()

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus)
      }
    }
  }, [location.key, reloadPins])

  const isPinned = useCallback(
    (roomCode: string, scheduleSlotOrSlot: string | ScheduleSlot): boolean => {
      const scheduleSlot =
        typeof scheduleSlotOrSlot === 'string'
          ? scheduleSlotOrSlot
          : computeScheduleSlot(scheduleSlotOrSlot)
      const targetPinKey = `${roomCode}#${scheduleSlot}`
      return pins.some(
        (p) => p.pinKey === targetPinKey || (p.roomCode === roomCode && p.scheduleSlot === scheduleSlot),
      )
    },
    [pins],
  )

  const addPin = useCallback(async (slot: ScheduleSlot | PinnedSchedule) => {
    const subBefore = getSession()?.user?.sub ?? null
    if (!subBefore) return
    const roomCode = slot.roomCode
    const scheduleSlot = computeScheduleSlot(slot)
    const newPin = await createPin({
      roomCode,
      scheduleSlot,
      eventCode: slot.eventCode,
      eventName: slot.eventName,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      eventType: slot.eventType,
      eventDate: slot.eventDate,
    })
    if (getSession()?.user?.sub === subBefore) {
      setPins((prev) => {
        const filtered = prev.filter(
          (p) => !(p.roomCode === roomCode && p.scheduleSlot === scheduleSlot),
        )
        return [...filtered, newPin]
      })
    }
  }, [])

  const removePin = useCallback(async (roomCode: string, scheduleSlot: string) => {
    const subBefore = getSession()?.user?.sub ?? null
    if (!subBefore) return
    await deletePin(roomCode, scheduleSlot)
    if (getSession()?.user?.sub === subBefore) {
      setPins((prev) =>
        prev.filter((p) => !(p.roomCode === roomCode && p.scheduleSlot === scheduleSlot)),
      )
    }
  }, [])

  const togglePin = useCallback(
    async (slot: ScheduleSlot | PinnedSchedule): Promise<boolean> => {
      const roomCode = slot.roomCode
      const scheduleSlot = computeScheduleSlot(slot)
      const currentlyPinned = isPinned(roomCode, scheduleSlot)

      if (currentlyPinned) {
        const stored = pins.find(
          (p) =>
            p.roomCode === roomCode &&
            (p.scheduleSlot === scheduleSlot || p.pinKey === `${roomCode}#${scheduleSlot}`),
        )
        if (slot.eventDate && stored && (stored.eventDate || '') !== slot.eventDate) {
          await addPin(slot)
          return true
        }
        await removePin(roomCode, scheduleSlot)
        return false
      } else {
        await addPin(slot)
        return true
      }
    },
    [isPinned, addPin, removePin, pins],
  )

  return (
    <PinsContext.Provider
      value={{
        pins,
        loading,
        error,
        isPinned,
        togglePin,
        addPin,
        removePin,
        reloadPins,
        isDrawerOpen,
        setIsDrawerOpen,
      }}
    >
      {children}
    </PinsContext.Provider>
  )
}
