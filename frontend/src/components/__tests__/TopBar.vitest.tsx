import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TopBar from '../TopBar'
import type { AuthSession } from '../../types/auth'

let mockSession: AuthSession | null = null

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../services/authService', () => ({
  getSession: () => mockSession,
  signOut: vi.fn(() => {
    mockSession = null
  }),
  getUserRole: (session: AuthSession | null = mockSession) => {
    if (!session) return 'guest'
    if (session.user.groups.includes('admin')) return 'admin'
    if (session.user.groups.includes('staff')) return 'staff'
    return 'user'
  },
}))

function renderTopBar(props = {}) {
  return render(
    <MemoryRouter>
      <TopBar {...props} />
    </MemoryRouter>
  )
}

describe('TopBar (Shared Component)', () => {
  beforeEach(() => {
    mockSession = null
    mockNavigate.mockReset()
    vi.clearAllMocks()
  })

  it('renders back-to-home link pointing directly to /', () => {
    renderTopBar()
    const homeLink = screen.getByTestId('back-to-home')
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('renders My Schedule placeholder slot with clear label and styling', () => {
    renderTopBar()
    const placeholder = screen.getByTestId('my-schedule-placeholder')
    expect(placeholder).toBeInTheDocument()
    expect(placeholder).toHaveTextContent('My Schedule')
  })

  it('renders login entry pointing to /login when user is not logged in', () => {
    renderTopBar()
    const loginLink = screen.getByTestId('login-link')
    expect(loginLink).toBeInTheDocument()
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('mounts AccountMenu with user role and options when user is logged in as staff', async () => {
    const user = userEvent.setup()
    mockSession = {
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'staff@example.com',
        sub: 'mock-sub-1',
        groups: ['staff'],
      },
    }

    renderTopBar()
    expect(screen.queryByTestId('login-link')).not.toBeInTheDocument()

    // Trigger button showing email and role badge
    const trigger = screen.getByRole('button', { name: /staff@example.com/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent(/staff/i)

    // Open dropdown
    await user.click(trigger)
    expect(screen.getByRole('link', { name: /staff console/i })).toHaveAttribute('href', '/staff')
    expect(screen.getByRole('button', { name: /ออกจากระบบ/i })).toBeInTheDocument()
  })

  it('displays admin role and links when user is logged in as admin', async () => {
    const user = userEvent.setup()
    mockSession = {
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'admin@example.com',
        sub: 'mock-sub-2',
        groups: ['admin'],
      },
    }

    renderTopBar()
    const trigger = screen.getByRole('button', { name: /admin@example.com/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent(/admin/i)

    await user.click(trigger)
    expect(screen.getByRole('link', { name: /admin console/i })).toHaveAttribute('href', '/admin')
  })

  it('signing out via AccountMenu redirects to /', async () => {
    const user = userEvent.setup()
    mockSession = {
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'staff@example.com',
        sub: 'mock-sub-1',
        groups: ['staff'],
      },
    }

    renderTopBar()
    const trigger = screen.getByRole('button', { name: /staff@example.com/i })
    await user.click(trigger)

    const signOutBtn = screen.getByRole('button', { name: /ออกจากระบบ/i })
    await user.click(signOutBtn)

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
