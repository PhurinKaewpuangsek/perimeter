import { useCallback, useEffect, useRef, useState } from 'react'
import { getSchedules, SCHEDULES_CACHE_TTL_MS } from '../services/schedulesService.ts'
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
  const latestRequestIdRef = useRef(0)
  const lastFetchedAtRef = useRef(0)

  useEffect(() => {
    let isMounted = true
    let bypassInFlight = false

    if (!roomCode) return

    const fetchRoomSchedules = (bypassCache = false) => {
      if (bypassInFlight) return
      const requestId = ++latestRequestIdRef.current
      lastFetchedAtRef.current = Date.now()
      if (bypassCache) {
        bypassInFlight = true
      }
      getSchedules({ roomCode, ...(bypassCache ? { bypassCache: true } : {}) })
        .then((data) => {
          if (!isMounted || requestId !== latestRequestIdRef.current) return
          setResult({ roomCode, schedules: data, loading: false, error: null })
        })
        .catch((err) => {
          if (!isMounted || requestId !== latestRequestIdRef.current) return
          const fetchError = err instanceof Error ? err : new Error(String(err))
          setResult((current) => {
            if (current.roomCode !== roomCode) return current
            if (current.schedules.length > 0) {
              return { ...current, loading: false }
            }
            return { ...current, loading: false, error: fetchError }
          })
        })
        .finally(() => {
          if (bypassCache) {
            bypassInFlight = false
          }
        })
    }

    fetchRoomSchedules(true)

    const refreshIfStale = () => {
      if (Date.now() - lastFetchedAtRef.current >= SCHEDULES_CACHE_TTL_MS) {
        fetchRoomSchedules(true)
      }
    }
    const onFocus = () => refreshIfStale()
    const refreshTimer = window.setInterval(refreshIfStale, SCHEDULES_CACHE_TTL_MS)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus)
    }

    return () => {
      isMounted = false
      window.clearInterval(refreshTimer)
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
