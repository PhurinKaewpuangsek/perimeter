import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminPage from '../AdminPage'
import type { Room } from '../../types/room'
import type { ScheduleSlot } from '../../types/schedule'
import type { AuthSession } from '../../types/auth'

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
    landmarks: [{ kind: 'near_toilet', text_th: 'ใกล้ห้องน้ำชาย' }],
    aliases: [],
  },
  {
    id: 'LC3-201',
    code: 'LC3-201',
    roomNumber: '201',
    nameThai: 'ห้องปฏิบัติการ 201',
    floor: 2,
    building: 'LC3',
    category: 'laboratory',
    capacity: 30,
    coordinates: { x: 200, y: 200 },
    landmarks: [{ kind: 'near_stairs', text_th: 'ใกล้บันได 2' }],
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
    eventName: 'Introduction to Computer Science',
    eventType: 'lecture',
  },
  {
    roomCode: 'LC3-201',
    dayOfWeek: 'TUE',
    startTime: '13:30',
    endTime: '16:30',
    eventCode: 'CS201',
    eventName: 'Data Structures Lab',
    eventType: 'lab',
  },
  {
    roomCode: 'LC3-201',
    dayOfWeek: 'MON',
    startTime: '13:00',
    endTime: '16:00',
    eventCode: 'BAS350',
    eventName: 'Exam - BAS350',
    eventType: 'exam',
    eventDate: '2026-05-18',
  },
]

const adminServiceMock = vi.hoisted(() => ({
  updateRoom: vi.fn(async () => {}),
  deleteRoom: vi.fn(async () => {}),
  createSchedule: vi.fn(async () => ({ message: 'ok', schedule_slot: 'slot' })),
  updateSchedule: vi.fn(async () => {}),
  deleteSchedule: vi.fn(async () => {}),
}))

vi.mock('../../services/adminService', () => adminServiceMock)

let currentSession: AuthSession | null = null

vi.mock('../../services/authService', () => ({
  getSession: () => currentSession,
  signIn: vi.fn(async (email: string) => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email,
        sub: 'mock-sub',
        groups: [email.includes('admin') ? 'admin' : 'staff'],
      },
    }
    return { challenge: null, session: currentSession }
  }),
  completeNewPassword: vi.fn(async (email: string) => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email,
        sub: 'mock-sub',
        groups: [email.includes('admin') ? 'admin' : 'staff'],
      },
    }
    return currentSession
  }),
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

vi.mock('../../hooks/usePreloadImages', () => ({
  usePreloadImages: () => true,
}))

vi.mock('../map/MapContainer', () => ({
  default: ({ currentFloor, onSelectRoom }: { currentFloor: number; onSelectRoom: (id: string) => void }) => (
    <div data-testid="map-container" data-floor={currentFloor}>
      <button data-testid="select-marker-button" onClick={() => onSelectRoom('LC3-101')}>
        Click Room 101
      </button>
    </div>
  ),
}))

describe('AdminPage', () => {
  beforeEach(() => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'admin@torch.dev',
        sub: 'admin-sub',
        groups: ['admin'],
      },
    }
  })

  it('renders Staff Login form when unauthenticated', () => {
    currentSession = null
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('เข้าสู่ระบบสำหรับเจ้าหน้าที่')).toBeInTheDocument()
    expect(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/)).toBeInTheDocument()
    expect(screen.getByLabelText(/รหัสผ่าน/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /เข้าสู่ระบบ/ })).toBeInTheDocument()
  })

  it('allows user to sign in from login form', async () => {
    currentSession = null
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/), 'admin@torch.dev')
    await user.type(screen.getByLabelText(/รหัสผ่าน/), 'Password123!')
    await user.click(screen.getByRole('button', { name: /เข้าสู่ระบบ/ }))

    expect(await screen.findByText('Staff Console')).toBeInTheDocument()
    expect(screen.getByText('ห้องและพื้นที่')).toBeInTheDocument()
  })

  it('handles NEW_PASSWORD_REQUIRED challenge on first-time login', async () => {
    currentSession = null
    const { signIn, completeNewPassword } = await import('../../services/authService')
    vi.mocked(signIn).mockResolvedValueOnce({
      challenge: 'NEW_PASSWORD_REQUIRED',
      session: 'sess-123',
      email: 'newuser@torch.dev',
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/อีเมล \/ ชื่อผู้ใช้/), 'newuser@torch.dev')
    await user.type(screen.getByLabelText(/รหัสผ่าน/), 'TempPass123!')
    await user.click(screen.getByRole('button', { name: /เข้าสู่ระบบ/ }))

    expect(await screen.findByText('ตั้งรหัสผ่านใหม่')).toBeInTheDocument()
    expect(screen.getByLabelText(/^รหัสผ่านใหม่/)).toBeInTheDocument()
    expect(screen.getByLabelText(/ยืนยันรหัสผ่านใหม่/)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^รหัสผ่านใหม่/), 'PermanentPass123!')
    await user.type(screen.getByLabelText(/ยืนยันรหัสผ่านใหม่/), 'PermanentPass123!')
    await user.click(screen.getByRole('button', { name: /บันทึกและเข้าใช้งาน/ }))

    expect(completeNewPassword).toHaveBeenCalledWith('newuser@torch.dev', 'PermanentPass123!', 'sess-123')
  })

  it('renders Perimeter branding, Staff Console badge, and room count for admin', () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Staff Console')).toBeInTheDocument()
    expect(screen.getByTestId('user-role-badge')).toHaveTextContent('admin')
    expect(screen.getByText('ห้องและพื้นที่')).toBeInTheDocument()
    expect(screen.getByText('ตารางเวลาทั้งหมด')).toBeInTheDocument()
    expect(screen.getByText('ห้อง 101')).toBeInTheDocument()
    expect(screen.getByText('ห้อง 201')).toBeInTheDocument()
  })

  it('filters rooms by floor when floor pills are clicked', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    // Initially both rooms are visible
    expect(screen.getByText('ห้อง 101')).toBeInTheDocument()
    expect(screen.getByText('ห้อง 201')).toBeInTheDocument()

    // Click Floor 1 pill
    const floor1Pill = screen.getByRole('button', { name: /^ชั้น 1/ })
    await user.click(floor1Pill)

    expect(screen.getByText('ห้อง 101')).toBeInTheDocument()
    expect(screen.queryByText('ห้อง 201')).not.toBeInTheDocument()

    // Click Floor 2 pill
    const floor2Pill = screen.getByRole('button', { name: /^ชั้น 2/ })
    await user.click(floor2Pill)

    expect(screen.queryByText('ห้อง 101')).not.toBeInTheDocument()
    expect(screen.getByText('ห้อง 201')).toBeInTheDocument()
  })

  it('shows Danger Zone and schedule delete buttons when logged in as admin', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    const roomButton = screen.getByText('ห้อง 101').closest('button')!
    await user.click(roomButton)

    expect(screen.getByText('กลับไปรายการห้อง')).toBeInTheDocument()
    expect(screen.getByText('แก้ไขข้อมูลห้อง')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ห้องบรรยาย 101')).toBeInTheDocument()
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
    expect(screen.getByText('CS101')).toBeInTheDocument()

    // Admin sees Danger Zone and delete button for schedule
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลบตาราง' })).toBeInTheDocument()
  })

  it('hides Danger Zone and schedule delete buttons when logged in as staff', async () => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: {
        email: 'staff@torch.dev',
        sub: 'staff-sub',
        groups: ['staff'],
      },
    }
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('user-role-badge')).toHaveTextContent('staff')

    const roomButton = screen.getByText('ห้อง 101').closest('button')!
    await user.click(roomButton)

    expect(screen.getByText('แก้ไขข้อมูลห้อง')).toBeInTheDocument()
    // Staff can see edit controls but NOT delete controls
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ลบตาราง' })).not.toBeInTheDocument()
    // But edit button is still available
    expect(screen.getByRole('button', { name: 'แก้ไขตาราง' })).toBeInTheDocument()
  })

  it('switches to All Schedules view tab', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    const schedulesTab = screen.getByRole('button', { name: /ตารางเวลาทั้งหมด/ })
    await user.click(schedulesTab)

    expect(screen.getByText(/สำรวจตารางเวลาทั้งหมด/)).toBeInTheDocument()
    expect(screen.getByText('CS101')).toBeInTheDocument()
    expect(screen.getByText('CS201')).toBeInTheDocument()
  })

  it('signs out and shows login form when sign out button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    const signOutBtn = screen.getByRole('button', { name: 'ออกจากระบบ' })
    await user.click(signOutBtn)

    expect(screen.getByText('เข้าสู่ระบบสำหรับเจ้าหน้าที่')).toBeInTheDocument()
  })
})

describe('AdminPage exam date (event_date)', () => {
  beforeEach(() => {
    currentSession = {
      idToken: 'mock-token',
      accessToken: 'mock-access',
      expiresAt: Date.now() + 3600000,
      user: { email: 'staff@torch.dev', sub: 'staff-sub', groups: ['staff'] },
    }
    Object.values(adminServiceMock).forEach((fn) => fn.mockClear())
  })

  async function openCreateForm() {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('ห้อง 101').closest('button')!)
    await user.click(screen.getByRole('button', { name: /เพิ่มตาราง/ }))
    const form = screen.getByText('เพิ่มตารางสอนใหม่').closest('form')!
    return { user, form: within(form) }
  }

  async function fillRequired(user: ReturnType<typeof userEvent.setup>, form: ReturnType<typeof within>) {
    await user.type(form.getByPlaceholderText('CS333'), 'BAS350')
    await user.type(form.getByPlaceholderText('09:00'), '13:00')
  }

  it('shows the date picker only for exam and event rows', async () => {
    const { user, form } = await openCreateForm()
    const typeSelect = form.getByDisplayValue('บรรยาย (Lecture)')

    expect(form.queryByLabelText(/วันสอบ/)).not.toBeInTheDocument()

    await user.selectOptions(typeSelect, 'exam')
    expect(form.getByLabelText(/วันสอบ/)).toHaveAttribute('type', 'date')

    await user.selectOptions(typeSelect, 'other')
    expect(form.getByLabelText(/วันที่จัด/)).toBeInTheDocument()

    await user.selectOptions(typeSelect, 'lab')
    expect(form.queryByLabelText(/วันที่จัด|วันสอบ/)).not.toBeInTheDocument()
  })

  it('blocks creating an exam without a date', async () => {
    const { user, form } = await openCreateForm()
    await fillRequired(user, form)
    await user.selectOptions(form.getByDisplayValue('บรรยาย (Lecture)'), 'exam')
    await user.click(form.getByRole('button', { name: /บันทึกตารางสอน/ }))

    expect(form.getByLabelText(/วันสอบ/)).toBeInvalid()
    expect(adminServiceMock.createSchedule).not.toHaveBeenCalled()
  })

  it('blocks turning a row into an exam without a date and explains why', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('ห้อง 201').closest('button')!)
    const labRow = screen.getByText('CS201').closest('div.group') as HTMLElement
    await user.click(within(labRow).getByRole('button', { name: 'แก้ไขตาราง' }))
    await user.selectOptions(screen.getByDisplayValue('ปฏิบัติการ (Lab)'), 'exam')
    await user.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }))

    expect(screen.getByText(/กรุณาเลือกวันสอบ/)).toBeInTheDocument()
    expect(adminServiceMock.updateSchedule).not.toHaveBeenCalled()
  })

  it('sends event_date when creating an exam', async () => {
    const { user, form } = await openCreateForm()
    await fillRequired(user, form)
    await user.selectOptions(form.getByDisplayValue('บรรยาย (Lecture)'), 'exam')
    await user.type(form.getByLabelText(/วันสอบ/), '2026-05-18')
    await user.click(form.getByRole('button', { name: /บันทึกตารางสอน/ }))

    expect(adminServiceMock.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ event_code: 'BAS350', event_type: 'exam', event_date: '2026-05-18' }),
    )
  })

  it('does not send event_date for a lecture', async () => {
    const { user, form } = await openCreateForm()
    await fillRequired(user, form)
    await user.click(form.getByRole('button', { name: /บันทึกตารางสอน/ }))

    expect(adminServiceMock.createSchedule).toHaveBeenCalledTimes(1)
    expect(adminServiceMock.createSchedule).toHaveBeenCalledWith(
      expect.not.objectContaining({ event_date: expect.anything() }),
    )
  })

  it('shows the error message returned by the API', async () => {
    adminServiceMock.createSchedule.mockRejectedValueOnce(
      new Error('Invalid event_date: use a real calendar date in YYYY-MM-DD format'),
    )
    const { user, form } = await openCreateForm()
    await fillRequired(user, form)
    await user.selectOptions(form.getByDisplayValue('บรรยาย (Lecture)'), 'exam')
    await user.type(form.getByLabelText(/วันสอบ/), '2026-05-18')
    await user.click(form.getByRole('button', { name: /บันทึกตารางสอน/ }))

    expect(await form.findByText(/Invalid event_date/)).toBeInTheDocument()
  })

  it('pre-fills the stored exam date when editing and sends it on save', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('ห้อง 201').closest('button')!)
    const examRow = screen.getByText('BAS350').closest('div.group') as HTMLElement
    await user.click(within(examRow).getByRole('button', { name: 'แก้ไขตาราง' }))

    expect(screen.getByLabelText(/วันสอบ/)).toHaveValue('2026-05-18')
    await user.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }))

    expect(adminServiceMock.updateSchedule).toHaveBeenCalledWith(
      'LC3-201',
      'MON#13:00#BAS350',
      expect.objectContaining({ event_type: 'exam', event_date: '2026-05-18' }),
    )
  })

  it('clears the date when an edited row is no longer an exam or event', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('ห้อง 201').closest('button')!)
    const examRow = screen.getByText('BAS350').closest('div.group') as HTMLElement
    await user.click(within(examRow).getByRole('button', { name: 'แก้ไขตาราง' }))
    await user.selectOptions(screen.getByDisplayValue('การสอบ (Exam)'), 'lab')
    await user.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }))

    expect(adminServiceMock.updateSchedule).toHaveBeenCalledWith(
      'LC3-201',
      'MON#13:00#BAS350',
      expect.objectContaining({ event_type: 'lab', event_date: null }),
    )
  })
})
