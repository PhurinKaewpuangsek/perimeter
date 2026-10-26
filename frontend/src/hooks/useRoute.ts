import { useCallback, useEffect, useState } from 'react'
import { getRoute } from '../services/routeService.ts'
import type { FoundRoute, RouteFailureReason, RouteResult } from '../types/route.ts'

export type RouteStatus = 'idle' | 'loading' | 'found' | 'not-found' | 'error'

export interface UseRouteResult {
  status: RouteStatus
  /** Set only when status is 'found'. */
  route: FoundRoute | null
  /** Set only when status is 'not-found'. */
  reason: RouteFailureReason | null
  error: Error | null
  retry: () => void
}

interface Settled {
  key: string
  result: RouteResult | null
  error: Error | null
}

/**
 * Route between two points. Asks again whenever `from` or `to` changes and aborts the
 * request for the previous pair, so a slow old answer never replaces the new one.
 * Either side null = idle (no request).
 */
export function useRoute(from: string | null, to: string | null): UseRouteResult {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)
  const key = from && to ? JSON.stringify([from, to, attempt]) : ''

  useEffect(() => {
    if (!from || !to) return
    const controller = new AbortController()
    const requestKey = JSON.stringify([from, to, attempt])
    getRoute({ from, to, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setSettled({ key: requestKey, result, error: null })
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setSettled({ key: requestKey, result: null, error })
      })
    return () => controller.abort()
  }, [from, to, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  // A result for another pair (or an older attempt) is stale: still loading.
  const current = key && settled?.key === key ? settled : null
  const result = current?.result ?? null
  const status: RouteStatus = !key
    ? 'idle'
    : !current
      ? 'loading'
      : current.error
        ? 'error'
        : result?.found
          ? 'found'
          : 'not-found'

  return {
    status,
    route: result?.found ? result : null,
    reason: result && !result.found ? result.reason : null,
    error: current?.error ?? null,
    retry,
  }
}
