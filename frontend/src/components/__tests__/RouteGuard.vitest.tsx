import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RouteGuard from '../RouteGuard'
import type { AuthSession } from '../../types/auth'

let currentSession: AuthSession | null = null
let currentExpired = false

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
  checkSession: () => ({ session: currentSession, expired: currentExpired }),
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

describe('RouteGuard', () => {
  beforeEach(() => {
    currentSession = null
    currentExpired = false
    mockNavigate.mockReset()
    vi.clearAllMocks()
  })

  it('renders children when user role is allowed', () => {
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

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RouteGuard allowedRoles={['admin']}>
                <div data-testid="protected-content">Admin Content</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('redirects signed-out user to /login?redirect=<path>', () => {
    currentSession = null

    render(
      <MemoryRouter initialEntries={['/staff']}>
        <Routes>
          <Route
            path="/staff"
            element={
              <RouteGuard allowedRoles={['staff', 'admin']}>
                <div>Staff Content</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(mockNavigate).toHaveBeenCalledWith('/login?redirect=%2Fstaff', { replace: true })
    expect(screen.queryByText('Staff Content')).not.toBeInTheDocument()
  })

  it('redirects to /login?redirect=<path>&expired=true when session is expired', () => {
    currentSession = null
    currentExpired = true

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RouteGuard allowedRoles={['admin']}>
                <div>Admin Content</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(mockNavigate).toHaveBeenCalledWith('/login?redirect=%2Fadmin&expired=true', { replace: true })
  })

  it('renders "Admins only" screen when staff attempts to access /admin', async () => {
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
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RouteGuard allowedRoles={['admin']}>
                <div>Admin Secret</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    // No silent redirect, content is blocked
    expect(screen.queryByText('Admin Secret')).not.toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()

    // Screen displays Admins only warning
    expect(screen.getByText(/Admins only|สำหรับ Admin เท่านั้น/i)).toBeInTheDocument()

    // Own home button points to staff home (/staff)
    const homeBtn = screen.getByRole('button', { name: /กลับสู่หน้า Staff|Staff Console/i })
    expect(homeBtn).toBeInTheDocument()
    await user.click(homeBtn)
    expect(mockNavigate).toHaveBeenCalledWith('/staff')

    // Sign out button
    const signOutBtn = screen.getByRole('button', { name: /ออกจากระบบ|Sign out/i })
    expect(signOutBtn).toBeInTheDocument()
    await user.click(signOutBtn)
    expect(signOut).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('renders "Staff only" screen when regular user attempts to access /staff', async () => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'user@torch.dev',
        sub: 'sub-user',
        groups: ['user'],
      },
    }

    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/staff']}>
        <Routes>
          <Route
            path="/staff"
            element={
              <RouteGuard allowedRoles={['staff', 'admin']}>
                <div>Staff Secret</div>
              </RouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByText('Staff Secret')).not.toBeInTheDocument()
    expect(screen.getByText(/Staff only|สำหรับ Staff เท่านั้น/i)).toBeInTheDocument()

    // Own home button points to map (/map)
    const homeBtn = screen.getByRole('button', { name: /กลับสู่แผนที่หลัก|หน้าหลัก/i })
    expect(homeBtn).toBeInTheDocument()
    await user.click(homeBtn)
    expect(mockNavigate).toHaveBeenCalledWith('/map')
  })
})
