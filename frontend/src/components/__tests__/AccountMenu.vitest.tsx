import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AccountMenu from '../AccountMenu'
import type { AuthSession } from '../../types/auth'

let currentSession: AuthSession | null = null

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../services/authService', () => ({
  getSession: () => currentSession,
  getUserRole: (session: AuthSession | null = currentSession) => {
    if (!session) return 'guest'
    if (session.user.groups.includes('admin')) return 'admin'
    if (session.user.groups.includes('staff')) return 'staff'
    if (session.user.groups.includes('user')) return 'user'
    return 'guest'
  },
  signOut: vi.fn(() => {
    currentSession = null
  }),
}))

describe('AccountMenu', () => {
  beforeEach(() => {
    currentSession = null
    mockNavigate.mockReset()
    vi.clearAllMocks()
  })

  it('renders nothing when there is no active session', () => {
    currentSession = null
    const { container } = render(
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders email and role badge for admin and shows all allowed links in dropdown', async () => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'admin@torch.dev',
        sub: 'sub-admin',
        groups: ['admin'],
      },
    }

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>,
    )

    expect(screen.getByText('admin@torch.dev')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()

    // Click trigger to open menu
    const trigger = screen.getByRole('button', { name: /บัญชีผู้ใช้|admin@torch.dev/i })
    await user.click(trigger)

    // Admin should see Admin Console, Staff Console, and Map links
    expect(screen.getByRole('link', { name: /Admin Console/i })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: /Staff Console/i })).toHaveAttribute('href', '/staff')
    expect(screen.getByRole('link', { name: /แผนที่|Map/i })).toHaveAttribute('href', '/map')
  })

  it('renders only staff and map links for staff role (no admin link)', async () => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'staff@torch.dev',
        sub: 'sub-staff',
        groups: ['staff'],
      },
    }

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>,
    )

    expect(screen.getByText('staff@torch.dev')).toBeInTheDocument()
    expect(screen.getByText('staff')).toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: /บัญชีผู้ใช้|staff@torch.dev/i })
    await user.click(trigger)

    expect(screen.getByRole('link', { name: /Staff Console/i })).toHaveAttribute('href', '/staff')
    expect(screen.getByRole('link', { name: /แผนที่|Map/i })).toHaveAttribute('href', '/map')
    expect(screen.queryByRole('link', { name: /Admin Console/i })).not.toBeInTheDocument()
  })

  it('calls signOut and navigates to / on sign out click', async () => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'staff@torch.dev',
        sub: 'sub-staff',
        groups: ['staff'],
      },
    }

    const { signOut } = await import('../../services/authService')
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>,
    )

    const trigger = screen.getByRole('button', { name: /บัญชีผู้ใช้|staff@torch.dev/i })
    await user.click(trigger)

    const signOutBtn = screen.getByRole('button', { name: /ออกจากระบบ|Sign out/i })
    await user.click(signOutBtn)

    expect(signOut).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
