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

export function useSchedules(): UseSchedulesResult {
  const [schedules, setSchedules] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Callers of reload() waiting for the next fetch started by it.
  const waitersRef = useRef<Array<{ resolve: () => void; reject: (err: Error) => void }>>([])

  useEffect(() => {
    let isMounted = true

    const fetchSchedules = (waiters: typeof waitersRef.current = []) => {
      getSchedules()
        .then((data) => {
          if (isMounted) {
            setSchedules(data)
            setError(null)
            setLoading(false)
          }
          waiters.forEach((w) => w.resolve())
        })
        .catch((err) => {
          const error = err instanceof Error ? err : new Error(String(err))
          waiters.forEach((w) => w.reject(error))
          if (!isMounted) return
          setLoading(false)
          setSchedules((prev) => { if (prev.length === 0) setError(error); return prev })
        })
    }

    // Only the fetch started by this attempt settles the reload() calls that requested it.
    const waiters = waitersRef.current
    waitersRef.current = []
    fetchSchedules(waiters)

    const onFocus = () => fetchSchedules()
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
