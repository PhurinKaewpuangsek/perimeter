import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { PinsProvider } from '../PinsProvider'
import { usePins } from '../../hooks/usePins'
import * as authService from '../../services/authService'
import * as pinsService from '../../services/pinsService'
import type { PinnedSchedule } from '../../types/pin'

describe('PinsProvider', () => {
  const samplePin: PinnedSchedule = {
    userId: 'user-sub-1',
    pinKey: 'LC3-105#MON#09:00#CS333',
    roomCode: 'LC3-105',
    scheduleSlot: 'MON#09:00#CS333',
    eventCode: 'CS333',
    eventName: 'Software Engineering',
    dayOfWeek: 'MON',
    startTime: '09:00',
    endTime: '12:00',
    eventType: 'class',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function TestConsumer() {
    const { pins, loading, error, togglePin } = usePins()
    const navigate = useNavigate()

    return (
      <div>
        <span data-testid="pins-count">{pins.length}</span>
        <span data-testid="loading-state">{loading ? 'loading' : 'idle'}</span>
        {error && <span data-testid="error-state">{error.message}</span>}
        <button
          type="button"
          onClick={() => navigate('/other')}
          data-testid="navigate-btn"
        >
          Navigate
        </button>
        <button
          type="button"
          onClick={() =>
            togglePin({
              ...samplePin,
              eventDate: '2026-10-25',
            })
          }
          data-testid="toggle-pin-btn"
        >
          Toggle
        </button>
      </div>
    )
  }

  it('reloads pins when session subject changes across navigation and clears when signed out', async () => {
    let currentSub: string | null = 'user-sub-1'
    vi.spyOn(authService, 'getSession').mockImplementation(() =>
      currentSub
        ? {
            idToken: 'token',
            accessToken: 'token',
            expiresAt: Date.now() + 100000,
            user: { sub: currentSub, email: `${currentSub}@tu.ac.th`, groups: ['user'] },
          }
        : null
    )

    const getPinsSpy = vi.spyOn(pinsService, 'getPins').mockImplementation(async () => {
      if (currentSub === 'user-sub-1') return [samplePin]
      if (currentSub === 'user-sub-2') return [{ ...samplePin, userId: 'user-sub-2', pinKey: 'LC3-201#TUE#10:00#CS101' }]
      return []
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <PinsProvider>
          <TestConsumer />
        </PinsProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('pins-count')).toHaveTextContent('1')
    })

    // Simulate switching user and navigating
    currentSub = 'user-sub-2'
    await act(async () => {
      screen.getByTestId('navigate-btn').click()
    })

    await waitFor(() => {
      expect(getPinsSpy).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId('pins-count')).toHaveTextContent('1')
    })

    // Simulate signing out (currentSub = null) and navigating
    currentSub = null
    await act(async () => {
      screen.getByTestId('navigate-btn').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('pins-count')).toHaveTextContent('0')
    })
  })

  it('discards async pin results if session subject changed while request was in-flight', async () => {
    let currentSub: string | null = 'user-sub-1'
    vi.spyOn(authService, 'getSession').mockImplementation(() =>
      currentSub
        ? {
            idToken: 'token',
            accessToken: 'token',
            expiresAt: Date.now() + 100000,
            user: { sub: currentSub, email: `${currentSub}@tu.ac.th`, groups: ['user'] },
          }
        : null
    )

    let resolveFirstFetch: (pins: PinnedSchedule[]) => void = () => {}
    vi.spyOn(pinsService, 'getPins').mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFirstFetch = resolve
      })
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <PinsProvider>
          <TestConsumer />
        </PinsProvider>
      </MemoryRouter>
    )

    // User navigates / logs out while first fetch is pending
    currentSub = null
    await act(async () => {
      screen.getByTestId('navigate-btn').click()
    })

    // Now first fetch completes with user-sub-1 data
    await act(async () => {
      resolveFirstFetch([samplePin])
    })

    // Because session changed to null, user-sub-1's data should NOT be applied
    expect(screen.getByTestId('pins-count')).toHaveTextContent('0')
  })
})
