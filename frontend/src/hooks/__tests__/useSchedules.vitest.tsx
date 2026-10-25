import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSchedules, _resetSchedulesCacheForTesting } from '../useSchedules'
import type { ScheduleSlot } from '../../types/schedule'

const getSchedulesMock = vi.hoisted(() => vi.fn<() => Promise<ScheduleSlot[]>>())
vi.mock('../../services/schedulesService.ts', () => ({ getSchedules: getSchedulesMock }))

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
    _resetSchedulesCacheForTesting()
    getSchedulesMock.mockReset()
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
})
