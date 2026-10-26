import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TopBar from '../TopBar'
import { PinsContext, defaultContextValue } from '../../hooks/usePins'
import { rootZIndex } from '../../test/stacking'
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
  getSession: () => {
    if (mockSession && mockSession.expiresAt <= Date.now()) {
      mockSession = null
    }
    return mockSession
  },
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders back-to-home link pointing directly to /', () => {
    renderTopBar()
    const homeLink = screen.getByTestId('back-to-home')
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('renders enlarged Perimeter logo inside back-to-home link', () => {
    renderTopBar()
    const homeLink = screen.getByTestId('back-to-home')
    const logoImg = screen.getByAltText('Perimeter')
    expect(homeLink).toContainElement(logoImg)
    expect(logoImg).toHaveAttribute('src', expect.stringContaining('perimeter_logo_negative_dark_nobg'))
    expect(logoImg).toHaveClass('h-12')
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

  it('refreshes the session when the window regains focus', () => {
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
    expect(screen.getByRole('button', { name: /staff@example.com/i })).toBeInTheDocument()

    mockSession = null
    fireEvent(window, new Event('focus'))

    expect(screen.getByTestId('login-link')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /staff@example.com/i })).not.toBeInTheDocument()
  })

  it('switches to the login entry when the session expires without another render', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T00:00:00.000Z'))
    mockSession = {
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
      expiresAt: Date.now() + 1000,
      user: {
        email: 'staff@example.com',
        sub: 'mock-sub-1',
        groups: ['staff'],
      },
    }

    renderTopBar()
    expect(screen.getByRole('button', { name: /staff@example.com/i })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1001)
    })

    expect(screen.getByTestId('login-link')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /staff@example.com/i })).not.toBeInTheDocument()
  })

  it('renders the sidebar toggle button without hiding it on mobile viewports (BUG-03)', () => {
    const onToggleSidebar = vi.fn()
    renderTopBar({ onToggleSidebar, isSidebarCollapsed: false })

    const toggleBtn = screen.getByRole('button', { name: 'ซ่อนแผงด้านซ้าย' })
    expect(toggleBtn).toBeInTheDocument()
    expect(toggleBtn).toHaveClass('inline-flex')
    expect(toggleBtn).not.toHaveClass('hidden')
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
    expect(screen.getByText('เข้าสู่ระบบด้วย')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ออกจากระบบ/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /staff console/i })).toHaveAttribute('href', '/staff')
  })

  it('displays admin role in AccountMenu when user is logged in as admin', async () => {
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
    expect(screen.getByText('เข้าสู่ระบบด้วย')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ออกจากระบบ/i })).toBeInTheDocument()
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

  it('renders dynamic workspace switcher for staff with navigation links and no sign out button', async () => {
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
    const workspaceTrigger = screen.getByTestId('workspace-switcher-trigger')
    expect(workspaceTrigger).toBeInTheDocument()

    // Popover is not open initially
    expect(screen.queryByRole('link', { name: /แผงจัดการข้อมูล staff/i })).not.toBeInTheDocument()

    // Click to open popover
    await user.click(workspaceTrigger)
    expect(screen.getByRole('link', { name: /แผงจัดการข้อมูล staff/i })).toHaveAttribute('href', '/staff')
    expect(screen.getByRole('link', { name: /ดูผังอาคาร lc3/i })).toHaveAttribute('href', '/map')

    // Navigation dock switcher does NOT have sign out button (strictly in AccountMenu)
    expect(screen.queryByTestId('workspace-sign-out')).not.toBeInTheDocument()
  })

  it('renders admin console navigation link in workspace switcher for admin users', async () => {
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
    const workspaceTrigger = screen.getByTestId('workspace-switcher-trigger')
    await user.click(workspaceTrigger)

    expect(screen.getByRole('link', { name: /แผงจัดการระบบ admin/i })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: /แผงจัดการข้อมูล staff/i })).toHaveAttribute('href', '/staff')
    expect(screen.getByRole('link', { name: /ดูผังอาคาร lc3/i })).toHaveAttribute('href', '/map')
  })

  it('does not render workspace switcher for guest users', () => {
    renderTopBar()
    expect(screen.queryByTestId('workspace-switcher-trigger')).not.toBeInTheDocument()
  })

  describe('with the My Schedule drawer (issue #139)', () => {
    function topBarWithDrawer(isDrawerOpen: boolean) {
      return (
        <PinsContext.Provider value={{ ...defaultContextValue, isDrawerOpen }}>
          <MemoryRouter>
            <TopBar currentFloor={1} onFloorChange={vi.fn()} />
          </MemoryRouter>
        </PinsContext.Provider>
      )
    }

    it('hides the bottom dock only while the drawer is open', () => {
      const { rerender } = render(topBarWithDrawer(false))
      expect(screen.getByRole('navigation', { name: 'แถบควบคุมแผนที่' })).toBeInTheDocument()

      rerender(topBarWithDrawer(true))
      expect(screen.queryByRole('navigation', { name: 'แถบควบคุมแผนที่' })).not.toBeInTheDocument()

      rerender(topBarWithDrawer(false))
      expect(screen.getByRole('navigation', { name: 'แถบควบคุมแผนที่' })).toBeInTheDocument()
    })

    it('opens the account menu above the open drawer', async () => {
      const user = userEvent.setup()
      mockSession = {
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        expiresAt: Date.now() + 3600000,
        user: { email: 'staff@example.com', sub: 'mock-sub-1', groups: ['staff'] },
      }
      render(topBarWithDrawer(true))

      await user.click(screen.getByRole('button', { name: /staff@example.com/i }))

      expect(rootZIndex(screen.getByRole('button', { name: /ออกจากระบบ/i }))).toBeGreaterThan(
        rootZIndex(screen.getByTestId('drawer-backdrop')),
      )
    })
  })
})
