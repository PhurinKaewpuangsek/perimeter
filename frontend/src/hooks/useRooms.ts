import { useCallback, useEffect, useRef, useState } from 'react'
import { getRooms } from '../services/roomsService.ts'
import type { Room } from '../types/room.ts'

export interface UseRoomsResult {
  rooms: Room[]
  loading: boolean
  error: Error | null
  /** Fetches the rooms again, e.g. from a "try again" button after an error. */
  reload: (background?: boolean) => void
}

/**
 * Last good response, so a returning visitor gets the map instantly.
 *
 * The locations API takes one to two seconds. Room positions almost never change, so the
 * cached copy is shown straight away and quietly replaced once the fresh one arrives —
 * only a first visit (or cleared storage) waits on the network.
 */
export const ROOMS_CACHE_KEY = 'torch_rooms_cache_v1'

function readCachedRooms(): Room[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(ROOMS_CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Room[]) : null
  } catch {
    return null
  }
}

function writeCachedRooms(rooms: Room[]): void {
  try {
    globalThis.localStorage?.setItem(ROOMS_CACHE_KEY, JSON.stringify(rooms))
  } catch {
    // Storage full or blocked (private mode): the app still works, just without the head start.
  }
}

const ROOMS_CACHE_TTL_MS = 60 * 1000 // 60 seconds TTL

let inFlightRoomsPromise: Promise<Room[]> | null = null
let inMemoryRooms: Room[] | null = null
let inMemoryRoomsFetchedAt = 0
let roomsRequestId = 0

export function _resetRoomsCacheForTesting(): void {
  inFlightRoomsPromise = null
  inMemoryRooms = null
  inMemoryRoomsFetchedAt = 0
  roomsRequestId = 0
}

function fetchRoomsDeduplicated(force = false): Promise<Room[]> {
  const now = Date.now()
  if (!force && inMemoryRooms && now - inMemoryRoomsFetchedAt < ROOMS_CACHE_TTL_MS) {
    return Promise.resolve(inMemoryRooms)
  }
  if (!force && inFlightRoomsPromise) {
    return inFlightRoomsPromise
  }

  const currentId = ++roomsRequestId
  const promise = getRooms({ bypassCache: force })
    .then((data) => {
      if (currentId === roomsRequestId) {
        inMemoryRooms = data
        inMemoryRoomsFetchedAt = Date.now()
        writeCachedRooms(data)
      }
      return data
    })
    .finally(() => {
      if (inFlightRoomsPromise === promise) {
        inFlightRoomsPromise = null
      }
    })

  inFlightRoomsPromise = promise
  return promise
}

export function useRooms(): UseRoomsResult {
  const [cached] = useState<Room[] | null>(() => inMemoryRooms ?? readCachedRooms())
  const [rooms, setRooms] = useState<Room[]>(cached ?? [])
  const [loading, setLoading] = useState<boolean>(cached === null)
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)
  const hasRoomsRef = useRef(cached !== null)

  useEffect(() => {
    let isMounted = true
    let hookRequestId = 0

    const fetchRooms = (force = false) => {
      const currentHookId = ++hookRequestId
      fetchRoomsDeduplicated(force)
        .then((data) => {
          if (isMounted && currentHookId === hookRequestId) {
            hasRoomsRef.current = true
            setRooms(data)
            setError(null)
            setLoading(false)
          }
        })
        .catch((err) => {
          if (!isMounted || currentHookId !== hookRequestId) return
          setLoading(false)
          // With a cached copy on screen, a failed refresh is not worth interrupting the user.
          if (!hasRoomsRef.current) setError(err instanceof Error ? err : new Error(String(err)))
        })
    }

    fetchRooms(attempt > 0)

    const onFocus = () => {
      if (Date.now() - inMemoryRoomsFetchedAt >= ROOMS_CACHE_TTL_MS) {
        fetchRooms(false)
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
    if (!background) setLoading(true)
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { rooms, loading, error, reload }
}
