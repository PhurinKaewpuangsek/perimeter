import { useCallback, useEffect, useRef, useState } from 'react'
import { getGraph } from '../services/graphService.ts'
import type { Graph } from '../types/graph.ts'

export interface UseGraphResult {
  graph: Graph | null
  loading: boolean
  error: Error | null
  /**
   * Fetches the graph again, e.g. after staff change a closure. Resolves once the new graph
   * is in state and rejects if that fetch fails, so callers can wait for it.
   */
  reload: () => Promise<void>
}

/**
 * Reads the LC3 routing graph (GET /api/graph) with each node's and edge's closure.
 * Shared by the staff closure tab (#147), navigation UI (#145) and event search (#148).
 */
export function useGraph(): UseGraphResult {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)
  const hasGraphRef = useRef(false)
  /** Only the newest request may update state, so a slow older one cannot undo a newer graph. */
  const latestRequestRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++latestRequestRef.current
    const isLatest = () => mountedRef.current && requestId === latestRequestRef.current
    try {
      const data = await getGraph()
      if (isLatest()) {
        hasGraphRef.current = true
        setGraph(data)
        setError(null)
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      // Keep the last good graph on a failed refresh; only a first load shows the error.
      if (isLatest() && !hasGraphRef.current) setError(e)
      throw e
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load().catch(() => {})
    return () => {
      mountedRef.current = false
    }
  }, [load])

  const reload = useCallback(() => {
    const done = load()
    // Callers that do not await reload() must not see an unhandled rejection.
    done.catch(() => {})
    return done
  }, [load])

  return { graph, loading, error, reload }
}
