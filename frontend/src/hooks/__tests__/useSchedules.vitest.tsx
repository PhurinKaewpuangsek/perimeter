import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSchedules, _resetSchedulesCacheForTesting } from '../useSchedules'
import type { ScheduleSlot } from '../../types/schedule'

const getSchedulesMock = vi.hoisted(() => vi.fn<(options?: { bypassCache?: boolean }) => Promise<ScheduleSlot[]>>())
vi.mock('../../services/schedulesService.ts', () => ({
  getSchedules: getSchedulesMock,
  SCHEDULES_CACHE_TTL_MS: 60_000,
}))

import { SCHEDULES_CACHE_TTL_MS } from '../../services/schedulesService'

const slot = (eventCode: string): ScheduleSlot => ({
  roomCode: 'LC3-104',
  dayOfWeek: 'MON',
  startTime: '09:00',
  endTime: '12:00',
  eventCode,
  eventName: eventCode,
  eventType: 'lecture',
})

describe('useSchedules reload()', () => {
  beforeEach(() => {
    vi.useRealTimers()
    _resetSchedulesCacheForTesting()
    getSchedulesMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves after the refreshed list is in state', async () => {
    getSchedulesMock.mockResolvedValueOnce([slot('OLD')]).mockResolvedValueOnce([slot('NEW')])
    const { result } = renderHook(() => useSchedules())
    await waitFor(() => expect(result.current.schedules[0]?.eventCode).toBe('OLD'))

    // The fetch starts in an effect, so start reload() inside act and await it after.
    let done!: Promise<void>
    act(() => { done = result.current.reload(true) })
    await act(() => done)
    expect(result.current.schedules[0].eventCode).toBe('NEW')
  })

  it('rejects when the refresh fails and keeps the previous list', async () => {
    getSchedulesMock.mockResolvedValueOnce([slot('OLD')]).mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useSchedules())
    await waitFor(() => expect(result.current.schedules).toHaveLength(1))

    let done!: Promise<void>
    act(() => { done = result.current.reload(true) })
    await act(async () => {
      await expect(done).rejects.toThrow('network')
    })
    expect(result.current.schedules[0].eventCode).toBe('OLD')
    expect(result.current.error).toBeNull()
  })

  it('does not raise an unhandled rejection when a failed reload is not awaited', async () => {
    getSchedulesMock.mockResolvedValueOnce([slot('OLD')]).mockRejectedValueOnce(new Error('network'))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const { result } = renderHook(() => useSchedules())
    await waitFor(() => expect(result.current.schedules).toHaveLength(1))

    act(() => { void result.current.reload(true) })
    await waitFor(() => expect(getSchedulesMock).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 20))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent fetches so only one request goes to the network', async () => {
    getSchedulesMock.mockResolvedValue([slot('EVENT1')])
    const { result: hook1 } = renderHook(() => useSchedules())
    const { result: hook2 } = renderHook(() => useSchedules())

    await waitFor(() => expect(hook1.current.schedules).toHaveLength(1))
    await waitFor(() => expect(hook2.current.schedules).toHaveLength(1))

    expect(getSchedulesMock).toHaveBeenCalledTimes(1)
  })

  it('passes bypassCache: true on reload', async () => {
    getSchedulesMock.mockResolvedValueOnce([slot('EVENT1')]).mockResolvedValueOnce([slot('EVENT2')])
    const { result } = renderHook(() => useSchedules())
    await waitFor(() => expect(result.current.schedules).toHaveLength(1))
    expect(getSchedulesMock).toHaveBeenLastCalledWith({ bypassCache: true })

    let done!: Promise<void>
    act(() => { done = result.current.reload(true) })
    await act(() => done)
    expect(getSchedulesMock).toHaveBeenLastCalledWith({ bypassCache: true })
  })

  it('refreshes schedules from the server at the 60-second cache TTL', async () => {
    vi.useFakeTimers()
    getSchedulesMock.mockResolvedValueOnce([slot('OLD')]).mockResolvedValueOnce([slot('NEW')])
    const { result, unmount } = renderHook(() => useSchedules())

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.schedules[0]?.eventCode).toBe('OLD')
    expect(SCHEDULES_CACHE_TTL_MS).toBe(60_000)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SCHEDULES_CACHE_TTL_MS - 1)
    })
    expect(getSchedulesMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.schedules[0]?.eventCode).toBe('NEW')
    expect(getSchedulesMock).toHaveBeenLastCalledWith({ bypassCache: true })
    unmount()
  })

  it('transfers waiters across superseded reloads so they resolve only when the latest succeeds', async () => {
    let resolveFirst!: (val: ScheduleSlot[]) => void
    let resolveSecond!: (val: ScheduleSlot[]) => void

    getSchedulesMock
      .mockResolvedValueOnce([slot('INITIAL')])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))

    const { result } = renderHook(() => useSchedules())
    await waitFor(() => expect(result.current.schedules[0]?.eventCode).toBe('INITIAL'))

    let done1!: Promise<void>
    act(() => {
      done1 = result.current.reload(true)
    })

    let done2!: Promise<void>
    act(() => {
      done2 = result.current.reload(true)
    })

    let done1Settled = false
    done1.then(() => {
      done1Settled = true
    })

    await act(async () => {
      resolveFirst([slot('SUPERSEDED')])
    })

    expect(done1Settled).toBe(false)
    expect(result.current.schedules[0]?.eventCode).toBe('INITIAL')

    await act(async () => {
      resolveSecond([slot('LATEST')])
    })

    await act(async () => {
      await done1
      await done2
    })

    expect(done1Settled).toBe(true)
    expect(result.current.schedules[0]?.eventCode).toBe('LATEST')
  })

  it('rejects pending waiters when the latest reload fails', async () => {
    let resolveFirst!: (val: ScheduleSlot[]) => void
    let rejectSecond!: (err: Error) => void

    getSchedulesMock
      .mockResolvedValueOnce([slot('INITIAL')])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectSecond = reject }))

    const { result } = renderHook(() => useSchedules())
    await waitFor(() => expect(result.current.schedules[0]?.eventCode).toBe('INITIAL'))

    let done1!: Promise<void>
    act(() => {
      done1 = result.current.reload(true)
    })

    let done2!: Promise<void>
    act(() => {
      done2 = result.current.reload(true)
    })

    let done1Settled = false
    done1.catch(() => {
      done1Settled = true
    })

    await act(async () => {
      resolveFirst([slot('SUPERSEDED')])
    })

    expect(done1Settled).toBe(false)

    await act(async () => {
      rejectSecond(new Error('latest reload failed'))
    })

    await act(async () => {
      await expect(done1).rejects.toThrow('latest reload failed')
      await expect(done2).rejects.toThrow('latest reload failed')
    })

    expect(result.current.schedules[0]?.eventCode).toBe('INITIAL')
  })
})
