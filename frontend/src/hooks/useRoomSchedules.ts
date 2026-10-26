import { useCallback, useEffect, useState } from 'react'
import { getSchedules } from '../services/schedulesService.ts'
import type { ScheduleSlot } from '../types/schedule.ts'

export interface UseRoomSchedulesResult {
  schedules: ScheduleSlot[]
  loading: boolean
  error: Error | null
  reload: (background?: boolean) => void
}

export function useRoomSchedules(roomCode: string | null | undefined): UseRoomSchedulesResult {
  const [result, setResult] = useState<{
    roomCode: string
    schedules: ScheduleSlot[]
    loading: boolean
    error: Error | null
  }>(() => ({
    roomCode: roomCode ?? '',
    schedules: [],
    loading: Boolean(roomCode),
    error: null,
  }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isMounted = true

    if (!roomCode) return

    const fetchRoomSchedules = (bypassCache = false) => {
      getSchedules({ roomCode, ...(bypassCache ? { bypassCache: true } : {}) })
        .then((data) => {
          if (!isMounted) return
          setResult({ roomCode, schedules: data, loading: false, error: null })
        })
        .catch((err) => {
          if (!isMounted) return
          const fetchError = err instanceof Error ? err : new Error(String(err))
          setResult((current) => {
            if (current.roomCode !== roomCode) return current
            if (current.schedules.length > 0) {
              return { ...current, loading: false }
            }
            return { ...current, loading: false, error: fetchError }
          })
        })
    }

    fetchRoomSchedules(attempt > 0)

    const onFocus = () => fetchRoomSchedules(false)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus)
    }

    return () => {
      isMounted = false
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus)
      }
    }
  }, [roomCode, attempt])

  const reload = useCallback((background = false) => {
    if (roomCode) {
      setResult((current) =>
        current.roomCode === roomCode
          ? { ...current, loading: !background, error: null }
          : current,
      )
    }
    setAttempt((value) => value + 1)
  }, [roomCode])

  const isCurrentRoom = Boolean(roomCode) && result.roomCode === roomCode
  return {
    schedules: isCurrentRoom ? result.schedules : [],
    loading: Boolean(roomCode) && (!isCurrentRoom || result.loading),
    error: isCurrentRoom ? result.error : null,
    reload,
  }
}
