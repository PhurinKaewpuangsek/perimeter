import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRoute } from '../useRoute'
import type { GetRouteOptions } from '../../services/routeService'
import type { FoundRoute, RouteResult } from '../../types/route'

const getRouteMock = vi.hoisted(() => vi.fn<(options: GetRouteOptions) => Promise<RouteResult>>())
vi.mock('../../services/routeService.ts', () => ({ getRoute: getRouteMock }))

const route = (to: string): FoundRoute => ({
  found: true,
  distance: 10,
  floors: [1],
  path: [
    { nodeId: 'start', floor: 1, x: 0, y: 0 },
    { nodeId: to, floor: 1, x: 10, y: 0 },
  ],
  closuresAvoided: [],
})

/** A getRoute call that settles only when the test says so. */
function deferred() {
  let resolve!: (value: RouteResult) => void
  const promise = new Promise<RouteResult>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useRoute', () => {
  beforeEach(() => {
    getRouteMock.mockReset()
  })

  it('stays idle and asks nothing until both points are set', () => {
    const { result } = renderHook(() => useRoute('LC3_Junction_SM', null))
    expect(result.current.status).toBe('idle')
    expect(result.current.route).toBeNull()
    expect(getRouteMock).not.toHaveBeenCalled()
  })

  it('goes from loading to found', async () => {
    getRouteMock.mockResolvedValue(route('LC3-F1-R105'))
    const { result } = renderHook(() => useRoute('LC3_Junction_SM', 'LC3-F1-R105'))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('found'))
    expect(result.current.route?.path.at(-1)?.nodeId).toBe('LC3-F1-R105')
    expect(getRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'LC3_Junction_SM', to: 'LC3-F1-R105' }),
    )
  })

  it('reports why there is no route', async () => {
    getRouteMock.mockResolvedValue({ found: false, reason: 'DESTINATION_CLOSED' })
    const { result } = renderHook(() => useRoute('LC3_Junction_SM', 'LC3-F2-R203'))
    await waitFor(() => expect(result.current.status).toBe('not-found'))
    expect(result.current.reason).toBe('DESTINATION_CLOSED')
    expect(result.current.route).toBeNull()
  })

  it('reports an error and asks again on retry', async () => {
    getRouteMock.mockRejectedValueOnce(new Error('คำนวณเส้นทางไม่สำเร็จ (500)'))
    getRouteMock.mockResolvedValueOnce(route('LC3-F1-R105'))
    const { result } = renderHook(() => useRoute('LC3_Junction_SM', 'LC3-F1-R105'))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.message).toBe('คำนวณเส้นทางไม่สำเร็จ (500)')

    act(() => result.current.retry())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('found'))
    expect(getRouteMock).toHaveBeenCalledTimes(2)
  })

  it('aborts the old request when the points change and ignores its late answer', async () => {
    const first = deferred()
    const second = deferred()
    getRouteMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ to }) => useRoute('LC3_Junction_SM', to), {
      initialProps: { to: 'LC3-F1-R105' },
    })
    const firstSignal = getRouteMock.mock.calls[0][0].signal

    rerender({ to: 'LC3-F2-R201' })
    expect(firstSignal?.aborted).toBe(true)
    expect(result.current.status).toBe('loading')

    // The aborted request answering late must not show the old route.
    await act(async () => first.resolve(route('LC3-F1-R105')))
    expect(result.current.status).toBe('loading')

    await act(async () => second.resolve(route('LC3-F2-R201')))
    expect(result.current.status).toBe('found')
    expect(result.current.route?.path.at(-1)?.nodeId).toBe('LC3-F2-R201')
  })

  it('goes back to idle when the destination is cleared', async () => {
    getRouteMock.mockResolvedValue(route('LC3-F1-R105'))
    const { result, rerender } = renderHook(({ to }: { to: string | null }) => useRoute('LC3_Junction_SM', to), {
      initialProps: { to: 'LC3-F1-R105' as string | null },
    })
    await waitFor(() => expect(result.current.status).toBe('found'))
    rerender({ to: null })
    expect(result.current.status).toBe('idle')
    expect(result.current.route).toBeNull()
  })
})
