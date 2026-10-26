import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '../LandingPage'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  rooms: [
    {
      id: 'LC3-F1-R103',
      code: 'LC3-103',
      roomNumber: '103',
      nameThai: 'ห้อง 103',
      building: 'LC3',
      floor: 1,
      category: 'lecture_room',
      coordinates: { x: 100, y: 200 },
      aliases: ['LC3-103', '103'],
      landmarks: [],
    },
  ],
  schedules: [
    {
      roomCode: 'LC3-103',
      eventCode: 'BAS350',
      eventName: 'Exam - BAS350',
      dayOfWeek: 'MON',
      startTime: '13:00',
      endTime: '16:00',
      eventType: 'exam',
      eventDate: '2027-05-18',
    },
  ],
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock('../../hooks/useRooms', () => ({
  useRooms: () => ({
    rooms: mocks.rooms,
    loading: false,
    error: null,
  }),
}))

vi.mock('../../hooks/useSchedules', () => ({
  useSchedules: () => ({
    schedules: mocks.schedules,
    loading: false,
    error: null,
  }),
}))

vi.mock('../../hooks/usePreloadImages', () => ({
  usePreloadImages: () => true,
}))

vi.mock('../map/MapContainer', () => ({
  default: () => <div data-testid="map-container" />,
}))

describe('LandingPage', () => {
  beforeEach(() => {
    mocks.navigate.mockReset()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders dark-toned Sign in button that navigates to /login without fake admin/regular login buttons', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    // Verify old split login buttons are gone
    expect(screen.queryByText(/Log in as ADMIN/i)).not.toBeInTheDocument()

    // Find Sign in button
    const signInButtons = screen.getAllByRole('button', { name: /เข้าสู่ระบบ|Sign in/i })
    expect(signInButtons.length).toBeGreaterThanOrEqual(1)

    // Desktop Sign in button is the black primary pill (DesignMD primary button)
    const desktopSignIn = signInButtons[0]
    expect(desktopSignIn.className).toContain('btn-primary')
    expect(desktopSignIn.className).toContain('btn')

    // Clicking Sign in navigates to /login
    fireEvent.click(desktopSignIn)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(mocks.navigate).toHaveBeenCalledWith('/login')
  })

  it('submitting search does not navigate away to /map', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    const input = screen.getByRole('textbox', { name: /ค้นหา/i })
    fireEvent.change(input, { target: { value: '101' } })

    const submitBtn = screen.getByRole('button', { name: /ค้นหา/i })
    fireEvent.click(submitBtn)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    // Crucial requirement: User stays on landing page, does not navigate to /map
    expect(mocks.navigate).not.toHaveBeenCalledWith(expect.stringContaining('/map'))
  })

  it('lets a guest find an exam and opens map navigation to its room', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByRole('textbox', { name: /ค้นหา/i }), {
      target: { value: 'BAS350 13:00' },
    })

    expect(screen.getByText('สอบ: BAS350')).toBeInTheDocument()
    expect(screen.getByText('อาคาร LC3 · ห้อง LC3-103 ชั้น 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'นำทางไปห้องสอบ LC3-103' }))
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(mocks.navigate).toHaveBeenCalledWith('/map?q=BAS350+13%3A00&navigate=LC3-F1-R103')
  })

  it('shows an exam-specific empty state for a course code without exam rows', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByRole('textbox', { name: /ค้นหา/i }), {
      target: { value: 'NOPE123' },
    })

    expect(
      screen.getByText('ไม่พบการสอบที่ตรงกับรหัสวิชา ลองตรวจสอบรหัสวิชาอีกครั้ง')
    ).toBeInTheDocument()
  })

  it('removes full-screen button and keeps enter map action intact via logo', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    // Full screen map button is removed
    expect(screen.queryByRole('button', { name: /ดูแผนที่เต็มจอ/i })).not.toBeInTheDocument()

    // Copyright footer with C icon is present
    expect(screen.getByText(/Perimeter Navigation System · Faculty Map/i)).toBeInTheDocument()
    expect(screen.getByText('©')).toBeInTheDocument()

    // Clicking logo enters /map
    const logoImg = screen.getByAltText(/Perimeter/i)
    fireEvent.click(logoImg)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(mocks.navigate).toHaveBeenCalledWith('/map')
  })

  it('offers a no-login way into the map on phones', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /ดูแผนที่ \(ไม่ต้องเข้าสู่ระบบ\)/ }))
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(mocks.navigate).toHaveBeenCalledWith('/map')
  })

  it('does not mount the background map on phones, where it is hidden', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
    try {
      render(
        <MemoryRouter>
          <LandingPage />
        </MemoryRouter>,
      )
      expect(screen.queryByTestId('map-container')).not.toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })
})
