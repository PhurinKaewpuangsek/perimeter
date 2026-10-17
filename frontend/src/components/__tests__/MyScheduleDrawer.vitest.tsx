import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MyScheduleDrawer from '../MyScheduleDrawer'
import { PinsContext, type PinsContextType } from '../../hooks/usePins'
import * as authService from '../../services/authService'
import * as calendarExport from '../../services/calendarExport'
import type { PinnedSchedule } from '../../types/pin'

const mockedNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  }
})

describe('MyScheduleDrawer Component', () => {
  const samplePin: PinnedSchedule = {
    userId: 'user-1',
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

  const sampleExamPin: PinnedSchedule = {
    userId: 'user-1',
    pinKey: 'LC3-201#WED#13:30#CS102',
    roomCode: 'LC3-201',
    scheduleSlot: 'WED#13:30#CS102',
    eventCode: 'CS102',
    eventName: 'Programming Fundamentals',
    dayOfWeek: 'WED',
    startTime: '13:30',
    endTime: '16:30',
    eventType: 'exam',
    eventDate: '2026-10-21',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    mockedNavigate.mockReset()
  })

  function renderDrawer(contextOverrides: Partial<PinsContextType> = {}) {
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
          <MyScheduleDrawer />
        </PinsContext.Provider>
      </MemoryRouter>,
    )

    return { ...utils, mockContext }
  }

  it('renders trigger button with My Schedule label and placeholder testid', () => {
    renderDrawer()
    const trigger = screen.getByTestId('my-schedule-placeholder')
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent('My Schedule')
  })

  it('redirects unauthenticated user to /login when trigger is clicked', async () => {
    vi.spyOn(authService, 'getSession').mockReturnValue(null)
    const { mockContext } = renderDrawer()
    const user = userEvent.setup()

    const trigger = screen.getByTestId('my-schedule-placeholder')
    await user.click(trigger)

    expect(mockedNavigate).toHaveBeenCalledWith('/login')
    expect(mockContext.setIsDrawerOpen).not.toHaveBeenCalled()
  })

  it('opens drawer dialog when trigger is clicked while authenticated', async () => {
    vi.spyOn(authService, 'getSession').mockReturnValue({
      idToken: 'token',
      accessToken: 'token',
      expiresAt: Date.now() + 100000,
      user: { sub: 'sub-1', email: 'test@tu.ac.th', groups: ['user'] },
    })

    const { mockContext } = renderDrawer()
    const user = userEvent.setup()

    const trigger = screen.getByTestId('my-schedule-placeholder')
    await user.click(trigger)

    expect(mockContext.setIsDrawerOpen).toHaveBeenCalledWith(true)
  })

  it('renders badge with count when user has pinned schedules', () => {
    renderDrawer({ pins: [samplePin, sampleExamPin] })
    const badge = screen.getByTestId('pins-count-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('2')
  })

  it('renders drawer contents with items and handles remove and close', async () => {
    const { mockContext } = renderDrawer({
      isDrawerOpen: true,
      pins: [samplePin, sampleExamPin],
    })
    const user = userEvent.setup()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('CS333')).toBeInTheDocument()
    expect(screen.getByText('CS102')).toBeInTheDocument()
    expect(screen.getByText(/วันสอบ: 2026-10-21/)).toBeInTheDocument()

    // Test remove item
    const removeBtn = screen.getByTestId('remove-pin-LC3-105-MON#09:00#CS333')
    await user.click(removeBtn)
    expect(mockContext.removePin).toHaveBeenCalledWith('LC3-105', 'MON#09:00#CS333')

    // Test close drawer
    const closeBtn = screen.getByTestId('close-my-schedule-drawer')
    await user.click(closeBtn)
    expect(mockContext.setIsDrawerOpen).toHaveBeenCalledWith(false)
  })

  it('triggers .ics file download when export button is clicked', async () => {
    const downloadSpy = vi.spyOn(calendarExport, 'downloadIcsFile').mockImplementation(() => {})
    renderDrawer({
      isDrawerOpen: true,
      pins: [samplePin],
    })
    const user = userEvent.setup()

    const exportBtn = screen.getByTestId('export-ics-button')
    await user.click(exportBtn)

    expect(downloadSpy).toHaveBeenCalledWith('my-schedule.ics', expect.stringContaining('BEGIN:VCALENDAR'))
  })

  it('displays warning notice when exporting with unannounced exam rows', async () => {
    const unannouncedExam: PinnedSchedule = {
      userId: 'user-1',
      pinKey: 'LC3-205#FRI#09:00#CS999',
      roomCode: 'LC3-205',
      scheduleSlot: 'FRI#09:00#CS999',
      eventCode: 'CS999',
      eventName: 'Unannounced Exam',
      dayOfWeek: 'FRI',
      startTime: '09:00',
      endTime: '12:00',
      eventType: 'exam',
      // No eventDate
    }

    vi.spyOn(calendarExport, 'downloadIcsFile').mockImplementation(() => {})
    renderDrawer({
      isDrawerOpen: true,
      pins: [unannouncedExam],
    })
    const user = userEvent.setup()

    const exportBtn = screen.getByTestId('export-ics-button')
    await user.click(exportBtn)

    expect(screen.getByRole('status')).toHaveTextContent(/ข้ามการสอบที่ยังไม่ระบุวันจัดสอบจริง \(CS999\)/)
  })
})
