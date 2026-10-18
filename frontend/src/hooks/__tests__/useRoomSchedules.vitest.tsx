import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleSlot } from '../../types/schedule'

const { getSchedules } = vi.hoisted(() => ({
  getSchedules: vi.fn<(options?: { roomCode?: string }) => Promise<ScheduleSlot[]>>(),
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
    getSchedules.mockRejectedValueOnce(new Error('API unavailable')).mockResolvedValueOnce([roomSchedule])

    const { result } = renderHook(() => useRoomSchedules('LC3-103'))
    await waitFor(() => expect(result.current.error?.message).toBe('API unavailable'))

    act(() => result.current.reload())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.schedules).toEqual([roomSchedule])
    expect(result.current.error).toBeNull()
    expect(getSchedules).toHaveBeenCalledTimes(2)
  })
})
