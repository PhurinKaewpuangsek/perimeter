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

  it('renders email, role badge, and sign out button for admin', async () => {
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

    expect(screen.getByText('เข้าสู่ระบบด้วย')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ออกจากระบบ/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /แผนที่อาคารเรียนรวม 3/i })).toHaveAttribute('href', '/map')
    expect(screen.getByRole('link', { name: /staff console/i })).toHaveAttribute('href', '/staff')
    expect(screen.getByRole('link', { name: /admin console/i })).toHaveAttribute('href', '/admin')
  })

  it('renders email, role badge, mobile workspace links, and sign out button for staff (BUG-03)', async () => {
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

    expect(screen.getByText('เข้าสู่ระบบด้วย')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ออกจากระบบ/i })).toBeInTheDocument()
    const mapLink = screen.getByRole('link', { name: /แผนที่อาคารเรียนรวม 3/i })
    const staffLink = screen.getByRole('link', { name: /staff console/i })
    expect(mapLink).toHaveAttribute('href', '/map')
    expect(staffLink).toHaveAttribute('href', '/staff')
    expect(screen.queryByRole('link', { name: /admin console/i })).not.toBeInTheDocument()

    // Clicking a workspace link closes the menu
    await user.click(staffLink)
    expect(screen.queryByText('เข้าสู่ระบบด้วย')).not.toBeInTheDocument()
  })

  it('does not render workspace switcher links in AccountMenu for standard user role', async () => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'student@torch.dev',
        sub: 'sub-user',
        groups: ['user'],
      },
    }

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /บัญชีผู้ใช้|student@torch.dev/i }))
    expect(screen.getByText('เข้าสู่ระบบด้วย')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
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
