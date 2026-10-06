import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminPage from '../AdminPage'
import type { Room } from '../../types/room'
import type { ScheduleSlot } from '../../types/schedule'

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
]

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
  it('renders Perimeter branding, Admin Console badge, and room count', () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Admin Console')).toBeInTheDocument()
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

  it('opens room edit panel when a room is clicked', async () => {
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
})

