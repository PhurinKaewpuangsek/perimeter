import { useCallback, useEffect, useRef, useState } from 'react'
import { getSchedules } from '../services/schedulesService.ts'
import type { ScheduleSlot } from '../types/schedule.ts'

export interface UseSchedulesResult {
  schedules: ScheduleSlot[]
  loading: boolean
  error: Error | null
  /**
   * Fetches the schedules again, e.g. from a "try again" button after an error.
   * The promise resolves once the new list is in state and rejects if that fetch fails,
   * so callers can wait for the refresh (callers that ignore it behave as before).
   */
  reload: (background?: boolean) => Promise<void>
}

const SCHEDULES_CACHE_TTL_MS = 60 * 1000 // 60 seconds TTL

let inFlightSchedulesPromise: Promise<ScheduleSlot[]> | null = null
let inMemorySchedules: ScheduleSlot[] | null = null
let inMemorySchedulesFetchedAt = 0
let schedulesRequestId = 0

export function _resetSchedulesCacheForTesting(): void {
  inFlightSchedulesPromise = null
  inMemorySchedules = null
  inMemorySchedulesFetchedAt = 0
  schedulesRequestId = 0
}

function fetchSchedulesDeduplicated(force = false): Promise<ScheduleSlot[]> {
  const now = Date.now()
  if (!force && inMemorySchedules && now - inMemorySchedulesFetchedAt < SCHEDULES_CACHE_TTL_MS) {
    return Promise.resolve(inMemorySchedules)
  }
  if (!force && inFlightSchedulesPromise) {
    return inFlightSchedulesPromise
  }

  const currentId = ++schedulesRequestId
  const promise = getSchedules({ bypassCache: force })
    .then((data) => {
      if (currentId === schedulesRequestId) {
        inMemorySchedules = data
        inMemorySchedulesFetchedAt = Date.now()
      }
      return data
    })
    .finally(() => {
      if (inFlightSchedulesPromise === promise) {
        inFlightSchedulesPromise = null
      }
    })

  inFlightSchedulesPromise = promise
  return promise
}

export function useSchedules(): UseSchedulesResult {
  const [schedules, setSchedules] = useState<ScheduleSlot[]>(() => inMemorySchedules ?? [])
  const [loading, setLoading] = useState<boolean>(() => inMemorySchedules === null)
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)
  const hasSchedulesRef = useRef(inMemorySchedules !== null && inMemorySchedules.length > 0)
  // Callers of reload() waiting for the next fetch started by it.
  const waitersRef = useRef<Array<{ resolve: () => void; reject: (err: Error) => void }>>([])

  useEffect(() => {
    let isMounted = true
    let hookRequestId = 0

    const fetchSchedules = (force = false, waiters: typeof waitersRef.current = []) => {
      const currentHookId = ++hookRequestId
      fetchSchedulesDeduplicated(force)
        .then((data) => {
          if (isMounted && currentHookId === hookRequestId) {
            hasSchedulesRef.current = data.length > 0
            setSchedules(data)
            setError(null)
            setLoading(false)
          }
          waiters.forEach((w) => w.resolve())
        })
        .catch((err) => {
          const error = err instanceof Error ? err : new Error(String(err))
          waiters.forEach((w) => w.reject(error))
          if (!isMounted || currentHookId !== hookRequestId) return
          setLoading(false)
          if (!hasSchedulesRef.current) {
            setError(error)
          }
        })
    }

    const waiters = waitersRef.current
    waitersRef.current = []
    fetchSchedules(attempt > 0, waiters)

    const onFocus = () => {
      if (Date.now() - inMemorySchedulesFetchedAt >= SCHEDULES_CACHE_TTL_MS) {
        fetchSchedules(false)
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
  }, [attempt])

  const reload = useCallback((background = false) => {
    const done = new Promise<void>((resolve, reject) => {
      waitersRef.current.push({ resolve, reject })
    })
    // Callers that do not await reload() (e.g. retry buttons) must not see an
    // unhandled rejection; callers that await it still receive the error.
    done.catch(() => {})
    if (!background) setLoading(true)
    setError(null)
    setAttempt((n) => n + 1)
    return done
  }, [])

  return { schedules, loading, error, reload }
}
