import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleSlot } from '../../types/schedule'

const { getSchedules } = vi.hoisted(() => ({
  getSchedules: vi.fn<(options?: { roomCode?: string; bypassCache?: boolean }) => Promise<ScheduleSlot[]>>(),
}))

vi.mock('../../services/schedulesService.ts', () => ({ getSchedules }))

import { useRoomSchedules } from '../useRoomSchedules'

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
    expect(getSchedules).toHaveBeenCalledWith({ roomCode: 'LC3-103' })
    expect(result.current.schedules).toEqual([roomSchedule])
    expect(result.current.error).toBeNull()
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
})
