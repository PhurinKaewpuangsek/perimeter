import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleSlot } from '../../types/schedule'

const { getSchedules } = vi.hoisted(() => ({
  getSchedules: vi.fn<(options?: { roomCode?: string; bypassCache?: boolean }) => Promise<ScheduleSlot[]>>(),
}))

vi.mock('../../services/schedulesService.ts', () => ({
  getSchedules,
  SCHEDULES_CACHE_TTL_MS: 60_000,
}))

import { useRoomSchedules } from '../useRoomSchedules'
import { SCHEDULES_CACHE_TTL_MS } from '../../services/schedulesService'

const roomSchedule: ScheduleSlot = {
  roomCode: 'LC3-103',
  eventCode: 'CS101',
  eventName: 'CS 101',
  dayOfWeek: 'MON',
  startTime: '09:00',
  endTime: '10:30',
  eventType: 'class',
}

describe('useRoomSchedules', () => {
  afterEach(() => {
    getSchedules.mockReset()
  })

  it('loads only the requested room schedule', async () => {
    getSchedules.mockResolvedValue([roomSchedule])

    const { result } = renderHook(() => useRoomSchedules('LC3-103'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getSchedules).toHaveBeenCalledWith({ roomCode: 'LC3-103', bypassCache: true })
    expect(result.current.schedules).toEqual([roomSchedule])
    expect(result.current.error).toBeNull()
  })

  it('refreshes room schedules at the 60-second cache TTL', async () => {
    vi.useFakeTimers()
    getSchedules.mockResolvedValueOnce([roomSchedule]).mockResolvedValueOnce([
      { ...roomSchedule, eventCode: 'UPDATED101' },
    ])
    const { result, unmount } = renderHook(() => useRoomSchedules('LC3-103'))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.schedules[0]?.eventCode).toBe('CS101')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SCHEDULES_CACHE_TTL_MS)
    })

    expect(result.current.schedules[0]?.eventCode).toBe('UPDATED101')
    expect(getSchedules).toHaveBeenLastCalledWith({
      roomCode: 'LC3-103',
      bypassCache: true,
    })
    unmount()
    vi.useRealTimers()
  })

  it('does not fetch when no room is selected', () => {
    const { result } = renderHook(() => useRoomSchedules(null))

    expect(getSchedules).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.schedules).toEqual([])
  })

  it('reports fetch failures and supports retrying', async () => {
    let resolveRetry: ((schedules: ScheduleSlot[]) => void) | undefined
    getSchedules
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRetry = resolve
      }))

    const { result } = renderHook(() => useRoomSchedules('LC3-103'))
    await waitFor(() => expect(result.current.error?.message).toBe('API unavailable'))

    act(() => result.current.reload())

    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.schedules).toEqual([])

    await act(async () => {
      resolveRetry?.([roomSchedule])
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.schedules).toEqual([roomSchedule])
    expect(result.current.error).toBeNull()
    expect(getSchedules).toHaveBeenCalledTimes(2)
    expect(getSchedules).toHaveBeenLastCalledWith({ roomCode: 'LC3-103', bypassCache: true })
  })

  it('keeps the loaded timetable when a focus refresh fails', async () => {
    getSchedules.mockResolvedValueOnce([roomSchedule]).mockRejectedValueOnce(new Error('Network unavailable'))

    const { result } = renderHook(() => useRoomSchedules('LC3-103'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(getSchedules).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.schedules).toEqual([roomSchedule])
    expect(result.current.error).toBeNull()
  })

  it('prevents a focus event or older request from replacing a fresh reload()', async () => {
    let resolveFocus!: (schedules: ScheduleSlot[]) => void
    let resolveReload!: (schedules: ScheduleSlot[]) => void
    const freshSchedule: ScheduleSlot = { ...roomSchedule, eventCode: 'FRESH101' }
    const staleSchedule: ScheduleSlot = { ...roomSchedule, eventCode: 'STALE101' }

    getSchedules
      .mockResolvedValueOnce([roomSchedule])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFocus = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve }))

    const { result } = renderHook(() => useRoomSchedules('LC3-103'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    act(() => {
      result.current.reload()
    })
    // A focus event firing while reload() is in-flight is ignored so it cannot overwrite the fresh reload
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(getSchedules).toHaveBeenCalledTimes(3)

    await act(async () => {
      resolveReload([freshSchedule])
    })
    await waitFor(() => expect(result.current.schedules).toEqual([freshSchedule]))

    await act(async () => {
      resolveFocus([staleSchedule])
    })
    expect(result.current.schedules).toEqual([freshSchedule])
  })
})
