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
    const { pins, loading, error, togglePin, addPin, removePin } = usePins()
    const navigate = useNavigate()

    return (
      <div>
        <span data-testid="pins-count">{pins.length}</span>
        <span data-testid="pins-keys">{pins.map((p) => p.pinKey).join(',')}</span>
        <span data-testid="pins-users">{pins.map((p) => p.userId).join(',')}</span>
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
        <button
          type="button"
          onClick={() => void addPin(samplePin)}
          data-testid="add-pin-btn"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => void removePin(samplePin.roomCode, samplePin.scheduleSlot)}
          data-testid="remove-pin-btn"
        >
          Remove
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
      expect(screen.getByTestId('pins-keys')).toHaveTextContent('LC3-105#MON#09:00#CS333')
      expect(screen.getByTestId('pins-users')).toHaveTextContent('user-sub-1')
    })

    // Simulate switching user and navigating
    currentSub = 'user-sub-2'
    await act(async () => {
      screen.getByTestId('navigate-btn').click()
    })

    await waitFor(() => {
      expect(getPinsSpy).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId('pins-count')).toHaveTextContent('1')
      expect(screen.getByTestId('pins-keys')).toHaveTextContent('LC3-201#TUE#10:00#CS101')
      expect(screen.getByTestId('pins-users')).toHaveTextContent('user-sub-2')
      expect(screen.getByTestId('pins-keys')).not.toHaveTextContent('LC3-105#MON#09:00#CS333')
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

  it('discards async addPin mutation if session subject changed while mutation was in-flight', async () => {
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

    vi.spyOn(pinsService, 'getPins').mockResolvedValue([])

    let resolveCreatePin: (pin: PinnedSchedule) => void = () => {}
    vi.spyOn(pinsService, 'createPin').mockImplementation(() => {
      return new Promise((resolve) => {
        resolveCreatePin = resolve
      })
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <PinsProvider>
          <TestConsumer />
        </PinsProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('pins-count')).toHaveTextContent('0')
    })

    // Trigger addPin while logged in as user-sub-1
    await act(async () => {
      screen.getByTestId('add-pin-btn').click()
    })

    // Change session to user-sub-2 before mutation completes
    currentSub = 'user-sub-2'

    // Mutation resolves
    await act(async () => {
      resolveCreatePin(samplePin)
    })

    // samplePin belongs to user-sub-1, so it should not be stored in user-sub-2's state
    expect(screen.getByTestId('pins-count')).toHaveTextContent('0')
  })

  it('discards async removePin mutation if session subject changed while mutation was in-flight', async () => {
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

    const user2Pin: PinnedSchedule = {
      ...samplePin,
      userId: 'user-sub-2',
      pinKey: 'LC3-105#MON#09:00#CS333',
    }

    vi.spyOn(pinsService, 'getPins').mockResolvedValue([user2Pin])

    let resolveDeletePin: () => void = () => {}
    vi.spyOn(pinsService, 'deletePin').mockImplementation(() => {
      return new Promise((resolve) => {
        resolveDeletePin = resolve
      })
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

    // Trigger removePin while user-sub-1
    await act(async () => {
      screen.getByTestId('remove-pin-btn').click()
    })

    // Session switches to user-sub-2
    currentSub = 'user-sub-2'

    // Delete mutation resolves
    await act(async () => {
      resolveDeletePin()
    })

    // user-sub-2's pin should not have been removed by user-sub-1's in-flight removal
    expect(screen.getByTestId('pins-count')).toHaveTextContent('1')
  })
})
