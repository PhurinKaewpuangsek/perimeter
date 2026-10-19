import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '../LandingPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../hooks/useRooms', () => ({
  useRooms: () => ({
    rooms: [],
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
    mockNavigate.mockReset()
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

    // Desktop Sign in button has dark tone styling
    const desktopSignIn = signInButtons[0]
    expect(desktopSignIn.className).toContain('bg-slate-900')
    expect(desktopSignIn.className).toContain('text-white')

    // Clicking Sign in navigates to /login
    fireEvent.click(desktopSignIn)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(mockNavigate).toHaveBeenCalledWith('/login')
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
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/map'))
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
    expect(mockNavigate).toHaveBeenCalledWith('/map')
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
    expect(mockNavigate).toHaveBeenCalledWith('/map')
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
