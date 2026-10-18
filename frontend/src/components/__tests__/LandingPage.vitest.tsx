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

  it('renders single Sign in button that navigates to /login without fake admin/regular login buttons', () => {
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

    // Clicking Sign in navigates to /login
    fireEvent.click(signInButtons[0])
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('keeps the enter map action intact', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    const enterMapBtn = screen.getByRole('button', { name: /ดูแผนที่เต็มจอ/i })
    fireEvent.click(enterMapBtn)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(mockNavigate).toHaveBeenCalledWith('/map')
  })
})
