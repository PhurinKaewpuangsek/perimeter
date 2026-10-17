import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MyScheduleDrawer from '../MyScheduleDrawer'
import { PinsContext, type PinsContextType } from '../../hooks/usePins'
import * as authService from '../../services/authService'
import * as calendarExport from '../../services/calendarExport'
import * as googleSync from '../../services/googleCalendarSync'
import type { PinnedSchedule } from '../../types/pin'

vi.mock('../../services/googleCalendarSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/googleCalendarSync')>()),
  isGoogleSyncConfigured: vi.fn(() => false),
  loadGisScript: vi.fn(() => Promise.resolve()),
  syncPinsToGoogleCalendar: vi.fn(),
}))

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

  it('disables remove button while removal is in progress to prevent duplicate clicks', async () => {
    let resolveRemoval: () => void = () => {}
    const slowRemovePin = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolveRemoval = resolve
    }))

    renderDrawer({
      isDrawerOpen: true,
      pins: [samplePin],
      removePin: slowRemovePin,
    })
    const user = userEvent.setup()

    const removeBtn = screen.getByTestId('remove-pin-LC3-105-MON#09:00#CS333')
    await user.click(removeBtn)

    expect(slowRemovePin).toHaveBeenCalledTimes(1)
    expect(removeBtn).toBeDisabled()

    // Clicking while pending should not trigger another call
    await user.click(removeBtn)
    expect(slowRemovePin).toHaveBeenCalledTimes(1)

    resolveRemoval()
  })

  it('displays visible error message when removePin rejects and re-enables button', async () => {
    const rejectingRemovePin = vi.fn().mockRejectedValue(new Error('Delete failed'))

    renderDrawer({
      isDrawerOpen: true,
      pins: [samplePin],
      removePin: rejectingRemovePin,
    })
    const user = userEvent.setup()

    const removeBtn = screen.getByTestId('remove-pin-LC3-105-MON#09:00#CS333')
    await user.click(removeBtn)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/ลบรายการไม่สำเร็จ.*ลองใหม่อีกครั้ง/i)
    expect(removeBtn).toBeEnabled()
  })

  describe('Google Calendar sync', () => {
    const summary: googleSync.SyncSummary = {
      upserted: 2,
      deleted: 1,
      failed: 0,
      skippedExams: [],
      pruneSkipped: false,
    }

    beforeEach(() => {
      vi.mocked(googleSync.isGoogleSyncConfigured).mockReturnValue(true)
      vi.mocked(googleSync.loadGisScript).mockResolvedValue(undefined)
      vi.mocked(googleSync.syncPinsToGoogleCalendar).mockReset()
    })

    it('hides the sync button when no Google client ID is configured', () => {
      vi.mocked(googleSync.isGoogleSyncConfigured).mockReturnValue(false)
      renderDrawer({ isDrawerOpen: true, pins: [samplePin] })

      expect(screen.queryByTestId('sync-google-button')).not.toBeInTheDocument()
      expect(screen.getByTestId('export-ics-button')).toBeInTheDocument()
    })

    it('keeps sync available with no pins (so removing the last pin can be synced) and disables .ics', async () => {
      vi.mocked(googleSync.syncPinsToGoogleCalendar).mockResolvedValue({ ...summary, upserted: 0, deleted: 1 })
      renderDrawer({ isDrawerOpen: true, pins: [] })
      const user = userEvent.setup()

      expect(screen.getByTestId('export-ics-button')).toBeDisabled()
      const syncBtn = screen.getByTestId('sync-google-button')
      await waitFor(() => expect(syncBtn).toBeEnabled())
      await user.click(syncBtn)

      expect(googleSync.syncPinsToGoogleCalendar).toHaveBeenCalledWith([], { userId: '' })
      expect(await screen.findByTestId('sync-google-result')).toHaveTextContent('เพิ่ม/อัปเดต 0 ลบ 1')
    })

    it('syncs the pins on click and shows the add/update/delete summary', async () => {
      vi.mocked(googleSync.syncPinsToGoogleCalendar).mockResolvedValue(summary)
      renderDrawer({ isDrawerOpen: true, pins: [samplePin, sampleExamPin] })
      const user = userEvent.setup()

      const syncBtn = screen.getByTestId('sync-google-button')
      await waitFor(() => expect(syncBtn).toBeEnabled())
      await user.click(syncBtn)

      expect(googleSync.syncPinsToGoogleCalendar).toHaveBeenCalledWith([samplePin, sampleExamPin], { userId: '' })
      expect(await screen.findByTestId('sync-google-result')).toHaveTextContent('เพิ่ม/อัปเดต 2 ลบ 1')
    })

    it('reports failed items as an error so the user can retry', async () => {
      vi.mocked(googleSync.syncPinsToGoogleCalendar).mockResolvedValue({ ...summary, failed: 2 })
      renderDrawer({ isDrawerOpen: true, pins: [samplePin] })
      const user = userEvent.setup()

      const syncBtn = screen.getByTestId('sync-google-button')
      await waitFor(() => expect(syncBtn).toBeEnabled())
      await user.click(syncBtn)

      expect(await screen.findByRole('alert')).toHaveTextContent(/ล้มเหลว 2/)
    })

    it('shows the skipped-exam notice for unannounced exams', async () => {
      const unannounced = { ...sampleExamPin, pinKey: 'x', eventCode: 'CS999', eventDate: undefined }
      vi.mocked(googleSync.syncPinsToGoogleCalendar).mockResolvedValue({ ...summary, skippedExams: [unannounced] })
      renderDrawer({ isDrawerOpen: true, pins: [unannounced] })
      const user = userEvent.setup()

      const syncBtn = screen.getByTestId('sync-google-button')
      await waitFor(() => expect(syncBtn).toBeEnabled())
      await user.click(syncBtn)

      expect(await screen.findByText(/ข้ามการสอบที่ยังไม่ระบุวันจัดสอบจริง \(CS999\)/)).toBeInTheDocument()
    })

    it('keeps the app usable and explains when the user denies consent', async () => {
      vi.mocked(googleSync.syncPinsToGoogleCalendar).mockRejectedValue(new googleSync.GoogleSyncError('denied'))
      renderDrawer({ isDrawerOpen: true, pins: [samplePin] })
      const user = userEvent.setup()

      const syncBtn = screen.getByTestId('sync-google-button')
      await waitFor(() => expect(syncBtn).toBeEnabled())
      await user.click(syncBtn)

      expect(await screen.findByRole('alert')).toHaveTextContent(/ไม่ได้รับอนุญาตจาก Google/)
      expect(syncBtn).toBeEnabled()
      expect(screen.getByTestId('export-ics-button')).toBeEnabled()
    })

    it('disables the button while the sync is running', async () => {
      let finish: (value: googleSync.SyncSummary) => void = () => {}
      vi.mocked(googleSync.syncPinsToGoogleCalendar).mockReturnValue(new Promise((resolve) => (finish = resolve)))
      renderDrawer({ isDrawerOpen: true, pins: [samplePin] })
      const user = userEvent.setup()

      const syncBtn = screen.getByTestId('sync-google-button')
      await waitFor(() => expect(syncBtn).toBeEnabled())
      await user.click(syncBtn)

      expect(syncBtn).toBeDisabled()
      finish(summary)
      await waitFor(() => expect(syncBtn).toBeEnabled())
    })

    // A failed/in-flight pins fetch leaves `pins` stale or empty; syncing then could delete synced events.
    it('disables sync while pins are loading', async () => {
      renderDrawer({ isDrawerOpen: true, pins: [samplePin], loading: true })
      await waitFor(() => expect(googleSync.loadGisScript).toHaveBeenCalled())
      expect(screen.getByTestId('sync-google-button')).toBeDisabled()
    })

    it('disables sync when pins failed to load', async () => {
      renderDrawer({ isDrawerOpen: true, pins: [samplePin], error: new Error('fetch failed') })
      await waitFor(() => expect(googleSync.loadGisScript).toHaveBeenCalled())
      expect(screen.getByTestId('sync-google-button')).toBeDisabled()
    })
  })
})
