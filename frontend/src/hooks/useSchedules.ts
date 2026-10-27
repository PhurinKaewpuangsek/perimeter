import { useCallback, useEffect, useRef, useState } from 'react'
import { getSchedules, SCHEDULES_CACHE_TTL_MS } from '../services/schedulesService.ts'
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

let inFlightSchedulesPromise: Promise<ScheduleSlot[]> | null = null
let inFlightSchedulesIsFresh = false
let inMemorySchedules: ScheduleSlot[] | null = null
let inMemorySchedulesFetchedAt = 0
let schedulesRequestId = 0

export function _resetSchedulesCacheForTesting(): void {
  inFlightSchedulesPromise = null
  inFlightSchedulesIsFresh = false
  inMemorySchedules = null
  inMemorySchedulesFetchedAt = 0
  schedulesRequestId = 0
}

function fetchSchedulesDeduplicated(force = false, deduplicateFresh = false): Promise<ScheduleSlot[]> {
  const now = Date.now()
  if (!force && inMemorySchedules && now - inMemorySchedulesFetchedAt < SCHEDULES_CACHE_TTL_MS) {
    return Promise.resolve(inMemorySchedules)
  }
  if (
    inFlightSchedulesPromise &&
    (!force || (deduplicateFresh && inFlightSchedulesIsFresh))
  ) {
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
        inFlightSchedulesIsFresh = false
      }
    })

  inFlightSchedulesPromise = promise
  inFlightSchedulesIsFresh = force
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
  const hookRequestIdRef = useRef(0)

  useEffect(() => {
    let isMounted = true

    const fetchSchedules = (force = false, deduplicateFresh = false) => {
      const currentHookId = ++hookRequestIdRef.current
      fetchSchedulesDeduplicated(force, deduplicateFresh)
        .then((data) => {
          if (currentHookId !== hookRequestIdRef.current) return
          if (isMounted) {
            hasSchedulesRef.current = data.length > 0
            setSchedules(data)
            setError(null)
            setLoading(false)
          }
          const waiters = waitersRef.current
          waitersRef.current = []
          waiters.forEach((w) => w.resolve())
        })
        .catch((err) => {
          const error = err instanceof Error ? err : new Error(String(err))
          if (currentHookId !== hookRequestIdRef.current) return
          const waiters = waitersRef.current
          waitersRef.current = []
          waiters.forEach((w) => w.reject(error))
          if (!isMounted) return
          setLoading(false)
          if (!hasSchedulesRef.current) {
            setError(error)
          }
        })
    }

    const cacheExpired =
      inMemorySchedules === null ||
      Date.now() - inMemorySchedulesFetchedAt >= SCHEDULES_CACHE_TTL_MS
    fetchSchedules(attempt > 0 || cacheExpired, attempt === 0 && cacheExpired)

    const refreshIfExpired = () => {
      if (Date.now() - inMemorySchedulesFetchedAt >= SCHEDULES_CACHE_TTL_MS) {
        fetchSchedules(true, true)
      }
    }
    const refreshDelay =
      attempt > 0 || inMemorySchedules === null
        ? SCHEDULES_CACHE_TTL_MS
        : Math.max(0, SCHEDULES_CACHE_TTL_MS - (Date.now() - inMemorySchedulesFetchedAt))
    let refreshInterval: number | undefined
    const refreshTimer = window.setTimeout(() => {
      fetchSchedules(true, true)
      refreshInterval = window.setInterval(
        () => fetchSchedules(true),
        SCHEDULES_CACHE_TTL_MS
      )
    }, refreshDelay)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', refreshIfExpired)
    }

    return () => {
      isMounted = false
      window.clearTimeout(refreshTimer)
      if (refreshInterval !== undefined) window.clearInterval(refreshInterval)
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', refreshIfExpired)
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
