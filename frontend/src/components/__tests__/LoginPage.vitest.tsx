import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../LoginPage'
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
  signIn: vi.fn(),
  completeNewPassword: vi.fn(),
  signOut: vi.fn(() => {
    currentSession = null
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    currentSession = null
    mockNavigate.mockReset()
    vi.clearAllMocks()
  })

  it('renders login form when unauthenticated', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^รหัสผ่าน/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /เข้าสู่ระบบ/ })).toBeInTheDocument()
    expect(screen.getByAltText('Perimeter')).toBeInTheDocument()
  })

  it('redirects signed-in user opening /login to their role home without showing form', () => {
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

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(mockNavigate).toHaveBeenCalledWith('/staff', { replace: true })
    expect(screen.queryByLabelText(/อีเมล \/ ชื่อผู้ใช้/)).not.toBeInTheDocument()
  })

  it('displays session expired alert when ?expired=true is present', () => {
    render(
      <MemoryRouter initialEntries={['/login?redirect=/staff&expired=true']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/เซสชันหมดอายุ/i)).toBeInTheDocument()
  })

  it('handles successful login and redirects staff to /staff', async () => {
    const { signIn } = await import('../../services/authService')
    const staffSession: AuthSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'staff@torch.dev',
        sub: 'sub-staff',
        groups: ['staff'],
      },
    }
    vi.mocked(signIn).mockResolvedValueOnce({
      challenge: null,
      session: staffSession,
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/), 'staff@torch.dev')
    await user.type(screen.getByLabelText(/^รหัสผ่าน/), 'Password123!')
    await user.click(screen.getByRole('button', { name: /เข้าสู่ระบบ/ }))

    expect(signIn).toHaveBeenCalledWith('staff@torch.dev', 'Password123!')
    expect(mockNavigate).toHaveBeenCalledWith('/staff', { replace: true })
  })

  it('handles allowed redirect param on login', async () => {
    const { signIn } = await import('../../services/authService')
    const adminSession: AuthSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'admin@torch.dev',
        sub: 'sub-admin',
        groups: ['admin'],
      },
    }
    vi.mocked(signIn).mockResolvedValueOnce({
      challenge: null,
      session: adminSession,
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login?redirect=/staff']}>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/), 'admin@torch.dev')
    await user.type(screen.getByLabelText(/^รหัสผ่าน/), 'Password123!')
    await user.click(screen.getByRole('button', { name: /เข้าสู่ระบบ/ }))

    expect(mockNavigate).toHaveBeenCalledWith('/staff', { replace: true })
  })

  it('displays error message on failed sign in', async () => {
    const { signIn } = await import('../../services/authService')
    vi.mocked(signIn).mockRejectedValueOnce(new Error('Incorrect username or password.'))

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/), 'wrong@torch.dev')
    await user.type(screen.getByLabelText(/^รหัสผ่าน/), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /เข้าสู่ระบบ/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password.')
  })

  it('handles NEW_PASSWORD_REQUIRED challenge flow with password rule hint, toggles, and back button', async () => {
    const { signIn, completeNewPassword } = await import('../../services/authService')
    vi.mocked(signIn).mockResolvedValueOnce({
      challenge: 'NEW_PASSWORD_REQUIRED',
      session: 'sess-challenge-token',
      email: 'firstlogin@torch.dev',
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/), 'firstlogin@torch.dev')
    await user.type(screen.getByLabelText(/^รหัสผ่าน/), 'TempPass123!')
    await user.click(screen.getByRole('button', { name: /เข้าสู่ระบบ/ }))

    // Now in challenge state
    expect(await screen.findByText('ตั้งรหัสผ่านใหม่')).toBeInTheDocument()
    // Verify password rule hint is visible
    expect(screen.getByText(/อย่างน้อย 8 ตัวอักษร/)).toBeInTheDocument()
    expect(screen.getByText(/ตัวพิมพ์ใหญ่/)).toBeInTheDocument()
    expect(screen.getByText(/ตัวพิมพ์เล็ก/)).toBeInTheDocument()
    expect(screen.getByText(/ตัวเลข/)).toBeInTheDocument()
    expect(screen.getByText(/อักขระพิเศษ/)).toBeInTheDocument()

    // Test Back button drops challenge
    const backBtn = screen.getByRole('button', { name: /ย้อนกลับ/ })
    await user.click(backBtn)
    expect(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/)).toBeInTheDocument()

    // Trigger challenge again
    vi.mocked(signIn).mockResolvedValueOnce({
      challenge: 'NEW_PASSWORD_REQUIRED',
      session: 'sess-challenge-token',
      email: 'firstlogin@torch.dev',
    })
    await user.click(screen.getByRole('button', { name: /เข้าสู่ระบบ/ }))
    expect(await screen.findByText('ตั้งรหัสผ่านใหม่')).toBeInTheDocument()

    // Test password mismatch
    await user.type(screen.getByLabelText(/^รหัสผ่านใหม่/), 'NewSecurePass1!')
    await user.type(screen.getByLabelText(/^ยืนยันรหัสผ่านใหม่/), 'DifferentPass1!')
    await user.click(screen.getByRole('button', { name: /บันทึกและเข้าใช้งาน/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ไม่ตรงกัน/)

    // Test password show/hide toggle
    const newPassInput = screen.getByLabelText(/^รหัสผ่านใหม่/) as HTMLInputElement
    expect(newPassInput.type).toBe('password')
    const toggleButtons = screen.getAllByLabelText(/แสดงรหัสผ่าน|ซ่อนรหัสผ่าน/)
    await user.click(toggleButtons[0])
    expect(newPassInput.type).toBe('text')
    await user.click(toggleButtons[0])
    expect(newPassInput.type).toBe('password')

    // Submit matching password
    const staffSession: AuthSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'firstlogin@torch.dev',
        sub: 'sub-staff',
        groups: ['staff'],
      },
    }
    vi.mocked(completeNewPassword).mockResolvedValueOnce(staffSession)

    const confirmInput = screen.getByLabelText(/^ยืนยันรหัสผ่านใหม่/)
    await user.clear(confirmInput)
    await user.type(confirmInput, 'NewSecurePass1!')
    await user.click(screen.getByRole('button', { name: /บันทึกและเข้าใช้งาน/ }))

    expect(completeNewPassword).toHaveBeenCalledWith('firstlogin@torch.dev', 'NewSecurePass1!', 'sess-challenge-token')
    expect(mockNavigate).toHaveBeenCalledWith('/staff', { replace: true })
  })
})
