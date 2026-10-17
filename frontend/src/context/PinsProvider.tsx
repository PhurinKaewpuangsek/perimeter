import { useState, useEffect, useCallback, type ReactNode } from 'react'
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

  const reloadPins = useCallback(async () => {
    const session = getSession()
    if (!session) {
      setPins([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await getPins()
      setPins(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchInitialPins = () => {
      const session = getSession()
      if (!session) {
        return
      }

      getPins()
        .then((data) => {
          if (isMounted) {
            setPins(data)
            setError(null)
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err instanceof Error ? err : new Error(String(err)))
          }
        })
    }

    fetchInitialPins()

    const onFocus = () => {
      if (getSession()) {
        fetchInitialPins()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus)
    }
    return () => {
      isMounted = false
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus)
      }
    }
  }, [])

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
    setPins((prev) => {
      const filtered = prev.filter(
        (p) => !(p.roomCode === roomCode && p.scheduleSlot === scheduleSlot),
      )
      return [...filtered, newPin]
    })
  }, [])

  const removePin = useCallback(async (roomCode: string, scheduleSlot: string) => {
    await deletePin(roomCode, scheduleSlot)
    setPins((prev) =>
      prev.filter((p) => !(p.roomCode === roomCode && p.scheduleSlot === scheduleSlot)),
    )
  }, [])

  const togglePin = useCallback(
    async (slot: ScheduleSlot | PinnedSchedule): Promise<boolean> => {
      const roomCode = slot.roomCode
      const scheduleSlot = computeScheduleSlot(slot)
      const currentlyPinned = isPinned(roomCode, scheduleSlot)

      if (currentlyPinned) {
        await removePin(roomCode, scheduleSlot)
        return false
      } else {
        await addPin(slot)
        return true
      }
    },
    [isPinned, addPin, removePin],
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
