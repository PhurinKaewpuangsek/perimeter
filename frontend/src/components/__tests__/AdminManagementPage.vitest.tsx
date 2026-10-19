import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminManagementPage from '../AdminManagementPage'
import type { AuthSession } from '../../types/auth'
import type { ManagedUser } from '../../services/adminUserService'
import type { Room } from '../../types/room'
import type { ScheduleSlot } from '../../types/schedule'

let currentSession: AuthSession | null = null
let mockUsersList: ManagedUser[] = []

const mockRooms: Room[] = [
  {
    id: 'LC3-101',
    code: 'LC3-101',
    roomNumber: '101',
    nameThai: 'ห้องบรรยาย 101',
    floor: 1,
    building: 'LC3',
    category: 'lecture_room',
    capacity: 50,
    coordinates: { x: 100, y: 100 },
    landmarks: [],
    aliases: [],
  },
]

const mockSchedules: ScheduleSlot[] = [
  {
    roomCode: 'LC3-101',
    dayOfWeek: 'MON',
    startTime: '09:30',
    endTime: '12:30',
    eventCode: 'CS101',
    eventName: 'Intro to CS',
    eventType: 'lecture',
  },
]

vi.mock('../../services/authService', () => ({
  getSession: () => currentSession,
  signIn: vi.fn(),
  completeNewPassword: vi.fn(),
  signOut: vi.fn(() => {
    currentSession = null
  }),
  isAdmin: () => currentSession?.user.groups.includes('admin') ?? false,
  isStaff: () => (currentSession?.user.groups.includes('staff') || currentSession?.user.groups.includes('admin')) ?? false,
  getUserRole: () => {
    if (currentSession?.user.groups.includes('admin')) return 'admin'
    if (currentSession?.user.groups.includes('staff')) return 'staff'
    return 'guest'
  },
}))

vi.mock('../../services/adminUserService', () => ({
  listUsers: vi.fn(async () => mockUsersList),
  createUser: vi.fn(async (payload: { email: string; role: 'admin' | 'staff' | 'user' }) => {
    const newUser: ManagedUser = {
      username: payload.email,
      email: payload.email,
      role: payload.role,
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
    }
    mockUsersList.push(newUser)
    return newUser
  }),
  updateUser: vi.fn(async (username: string, payload: { role?: 'admin' | 'staff' | 'user'; enabled?: boolean }) => {
    const user = mockUsersList.find((u) => u.username === username)
    if (user) {
      if (payload.role !== undefined) user.role = payload.role
      if (payload.enabled !== undefined) user.enabled = payload.enabled
    }
  }),
  deleteUser: vi.fn(async (username: string) => {
    mockUsersList = mockUsersList.filter((u) => u.username !== username)
  }),
}))

vi.mock('../../services/adminService', () => ({
  deleteRoom: vi.fn(async () => {}),
  deleteSchedule: vi.fn(async () => {}),
}))

vi.mock('../../hooks/useRooms', () => ({
  useRooms: () => ({
    rooms: mockRooms,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))

vi.mock('../../hooks/useSchedules', () => ({
  useSchedules: () => ({
    schedules: mockSchedules,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))

describe('AdminManagementPage', () => {
  beforeEach(() => {
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

    mockUsersList = [
      {
        username: 'admin@torch.dev',
        email: 'admin@torch.dev',
        sub: 'sub-admin',
        role: 'admin',
        status: 'CONFIRMED',
        enabled: true,
      },
      {
        username: 'admin2@torch.dev',
        email: 'admin2@torch.dev',
        sub: 'sub-admin2',
        role: 'admin',
        status: 'CONFIRMED',
        enabled: true,
      },
      {
        username: 'staff@torch.dev',
        email: 'staff@torch.dev',
        sub: 'sub-staff',
        role: 'staff',
        status: 'CONFIRMED',
        enabled: true,
      },
      {
        username: 'student@torch.dev',
        email: 'student@torch.dev',
        sub: 'sub-student',
        role: 'user',
        status: 'FORCE_CHANGE_PASSWORD',
        enabled: false,
      },
    ]
  })

  it('renders user table for authenticated admin', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminManagementPage />
      </MemoryRouter>,
    )

    expect(screen.getAllByText(/Admin Console/)[0]).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /การจัดการผู้ใช้และสิทธิ์/ })).toBeInTheDocument()

    await waitFor(() => {
      const table = screen.getByRole('table')
      expect(within(table).getByText('admin@torch.dev')).toBeInTheDocument()
      expect(within(table).getByText('staff@torch.dev')).toBeInTheDocument()
      expect(within(table).getByText('student@torch.dev')).toBeInTheDocument()
    })
  })

  it('allows admin to add a new user', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminManagementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const table = screen.getByRole('table')
      expect(within(table).getByText('admin@torch.dev')).toBeInTheDocument()
    })

    const openAddBtn = screen.getByRole('button', { name: /เพิ่มผู้ใช้ใหม่/ })
    await user.click(openAddBtn)

    await user.type(screen.getByLabelText(/อีเมลผู้ใช้/), 'newstaff@torch.dev')
    await user.type(screen.getByLabelText(/รหัสผ่านเริ่มต้น/), 'NewStaffPass123!')
    await user.selectOptions(screen.getByLabelText(/สิทธิ์/), 'staff')

    const submitBtn = screen.getByRole('button', { name: /สร้างผู้ใช้/ })
    await user.click(submitBtn)

    await waitFor(() => {
      const table = screen.getByRole('table')
      expect(within(table).getByText('newstaff@torch.dev')).toBeInTheDocument()
    })
  })

  it('disables demote, disable, and delete actions for the caller themselves', async () => {
    render(
      <MemoryRouter>
        <AdminManagementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const table = screen.getByRole('table')
      expect(within(table).getByText('admin@torch.dev')).toBeInTheDocument()
    })

    // Caller is admin@torch.dev
    const table = screen.getByRole('table')
    const callerRow = within(table).getByText('admin@torch.dev').closest('tr')!
    const roleSelect = callerRow.querySelector('select')!
    expect(roleSelect).toBeDisabled()

    const toggleBtn = callerRow.querySelector('button[data-testid="toggle-enabled-btn"]')!
    expect(toggleBtn).toBeDisabled()

    const deleteBtn = callerRow.querySelector('button[data-testid="delete-user-btn"]')!
    expect(deleteBtn).toBeDisabled()
  })

  it('allows changing role for another user', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminManagementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('staff@torch.dev')).toBeInTheDocument()
    })

    const staffRow = screen.getByText('staff@torch.dev').closest('tr')!
    const roleSelect = staffRow.querySelector('select')!
    expect(roleSelect).not.toBeDisabled()

    await user.selectOptions(roleSelect, 'user')

    const { updateUser } = await import('../../services/adminUserService')
    expect(updateUser).toHaveBeenCalledWith('staff@torch.dev', { role: 'user' })
  })

  it('allows disabling and deleting another user', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminManagementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('staff@torch.dev')).toBeInTheDocument()
    })

    const staffRow = screen.getByText('staff@torch.dev').closest('tr')!
    const toggleBtn = staffRow.querySelector('button[data-testid="toggle-enabled-btn"]')!
    await user.click(toggleBtn)

    const { updateUser, deleteUser } = await import('../../services/adminUserService')
    expect(updateUser).toHaveBeenCalledWith('staff@torch.dev', { enabled: false })

    await waitFor(() => {
      expect(screen.getByText('staff@torch.dev')).toBeInTheDocument()
    })

    const updatedStaffRow = screen.getByText('staff@torch.dev').closest('tr')!
    const deleteBtn = updatedStaffRow.querySelector('button[data-testid="delete-user-btn"]')!
    await user.click(deleteBtn)

    // Confirm modal
    const confirmDeleteBtn = await screen.findByRole('button', { name: /ยืนยันการลบ/ })
    await user.click(confirmDeleteBtn)

    expect(deleteUser).toHaveBeenCalledWith('staff@torch.dev')
  })

  it('provides delete room and delete schedule actions for admin', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminManagementPage />
      </MemoryRouter>,
    )

    // Switch to Delete Building Data tab
    const buildingDataTab = screen.getByRole('button', { name: /จัดการข้อมูลอาคาร/ })
    await user.click(buildingDataTab)

    expect(screen.getByText(/ลบข้อมูลห้องและตารางเรียน/)).toBeInTheDocument()
    expect(screen.getByText('ห้อง 101')).toBeInTheDocument()

    const roomSelectBtn = screen.getByText('ห้อง 101').closest('button')!
    await user.click(roomSelectBtn)

    expect(screen.getByRole('button', { name: /ลบห้องนี้/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ลบตาราง/ })).toBeInTheDocument()
  })
})

