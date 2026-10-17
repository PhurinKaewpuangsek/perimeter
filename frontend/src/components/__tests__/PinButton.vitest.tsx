import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PinButton from '../PinButton'
import { PinsContext, type PinsContextType } from '../../hooks/usePins'
import * as authService from '../../services/authService'
import type { ScheduleSlot } from '../../types/schedule'

const mockedNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  }
})

describe('PinButton Component', () => {
  const sampleSlot: ScheduleSlot = {
    roomCode: 'LC3-105',
    eventCode: 'CS333',
    eventName: 'Software Engineering',
    dayOfWeek: 'MON',
    startTime: '09:00',
    endTime: '12:00',
    eventType: 'class',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    mockedNavigate.mockReset()
  })

  function renderPinButton(contextOverrides: Partial<PinsContextType> = {}) {
    const mockContext: PinsContextType = {
      pins: [],
      loading: false,
      error: null,
      isPinned: vi.fn().mockReturnValue(false),
      togglePin: vi.fn().mockResolvedValue(true),
      addPin: vi.fn().mockResolvedValue(undefined),
      removePin: vi.fn().mockResolvedValue(undefined),
      reloadPins: vi.fn().mockResolvedValue(undefined),
      isDrawerOpen: false,
      setIsDrawerOpen: vi.fn(),
      ...contextOverrides,
    }

    const utils = render(
      <MemoryRouter>
        <PinsContext.Provider value={mockContext}>
          <PinButton slot={sampleSlot} />
        </PinsContext.Provider>
      </MemoryRouter>,
    )

    return { ...utils, mockContext }
  }

  it('renders unpinned button with bookmark icon', () => {
    renderPinButton({ isPinned: vi.fn().mockReturnValue(false) })
    const button = screen.getByRole('button', { name: /บันทึกในตารางของฉัน/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('data-testid', 'pin-button-LC3-105-MON#09:00#CS333')
  })

  it('redirects guest to /login when clicked while unauthenticated', async () => {
    vi.spyOn(authService, 'getSession').mockReturnValue(null)
    const { mockContext } = renderPinButton()
    const user = userEvent.setup()

    const button = screen.getByRole('button', { name: /บันทึกในตารางของฉัน/i })
    await user.click(button)

    expect(mockedNavigate).toHaveBeenCalledWith('/login')
    expect(mockContext.togglePin).not.toHaveBeenCalled()
  })

  it('toggles pin when clicked while authenticated', async () => {
    vi.spyOn(authService, 'getSession').mockReturnValue({
      idToken: 'token',
      accessToken: 'token',
      expiresAt: Date.now() + 100000,
      user: { sub: 'sub-1', email: 'test@tu.ac.th', groups: ['user'] },
    })

    const { mockContext } = renderPinButton({ isPinned: vi.fn().mockReturnValue(false) })
    const user = userEvent.setup()

    const button = screen.getByRole('button', { name: /บันทึกในตารางของฉัน/i })
    await user.click(button)

    expect(mockContext.togglePin).toHaveBeenCalledWith(sampleSlot)
    expect(mockedNavigate).not.toHaveBeenCalled()
  })

  it('renders pinned state and allows unpinning', async () => {
    vi.spyOn(authService, 'getSession').mockReturnValue({
      idToken: 'token',
      accessToken: 'token',
      expiresAt: Date.now() + 100000,
      user: { sub: 'sub-1', email: 'test@tu.ac.th', groups: ['user'] },
    })

    const { mockContext } = renderPinButton({ isPinned: vi.fn().mockReturnValue(true) })
    const user = userEvent.setup()

    const button = screen.getByRole('button', { name: /นำออกจากตารางของฉัน/i })
    expect(button).toBeInTheDocument()

    await user.click(button)
    expect(mockContext.togglePin).toHaveBeenCalledWith(sampleSlot)
  })

  it('displays an error message with a retry hint when togglePin fails', async () => {
    vi.spyOn(authService, 'getSession').mockReturnValue({
      idToken: 'token',
      accessToken: 'token',
      expiresAt: Date.now() + 100000,
      user: { sub: 'sub-1', email: 'test@tu.ac.th', groups: ['user'] },
    })

    const togglePinMock = vi.fn().mockRejectedValue(new Error('Network error'))
    renderPinButton({ togglePin: togglePinMock })
    const user = userEvent.setup()

    const button = screen.getByRole('button', { name: /บันทึกในตารางของฉัน/i })
    await user.click(button)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/บันทึกไม่สำเร็จ.*ลอง.*อีกครั้ง/i)
    expect(button).toBeEnabled()
  })

  it('resyncs pin by calling addPin when already pinned slot announces a new or different eventDate', () => {
    const addPinMock = vi.fn().mockResolvedValue(undefined)
    const storedPinWithoutDate = {
      userId: 'sub-1',
      pinKey: 'LC3-105#MON#09:00#CS333',
      roomCode: 'LC3-105',
      scheduleSlot: 'MON#09:00#CS333',
      eventCode: 'CS333',
      eventName: 'Software Engineering',
      dayOfWeek: 'MON',
      startTime: '09:00',
      endTime: '12:00',
      eventType: 'exam',
      eventDate: '',
    }

    const slotWithAnnouncedDate: ScheduleSlot = {
      ...sampleSlot,
      eventType: 'exam',
      eventDate: '2026-10-21',
    }

    render(
      <MemoryRouter>
        <PinsContext.Provider
          value={{
            pins: [storedPinWithoutDate],
            loading: false,
            error: null,
            isPinned: vi.fn().mockReturnValue(true),
            togglePin: vi.fn(),
            addPin: addPinMock,
            removePin: vi.fn(),
            reloadPins: vi.fn(),
            isDrawerOpen: false,
            setIsDrawerOpen: vi.fn(),
          }}
        >
          <PinButton slot={slotWithAnnouncedDate} />
        </PinsContext.Provider>
      </MemoryRouter>
    )

    expect(addPinMock).toHaveBeenCalledWith(slotWithAnnouncedDate)
  })
})
