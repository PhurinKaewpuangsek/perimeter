import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, it, expect, vi } from 'vitest'
import RoomSearchPanel from '../RoomSearchPanel'
import type { Room } from '../../types/room'
import type { ScheduleSlot } from '../../types/schedule'

const mockRooms: Room[] = [
  {
    id: 'LC3-F1-R101',
    code: 'LC3-101',
    roomNumber: '101',
    nameThai: 'ห้องเรียน 101',
    building: 'LC3',
    floor: 1,
    category: 'lecture_room',
    coordinates: { x: 100, y: 200 },
    aliases: ['101', 'lab 1'],
    landmarks: [],
  },
  {
    id: 'LC3-F2-R201',
    code: 'LC3-201',
    roomNumber: '201',
    nameThai: 'ห้องปฏิบัติการ 201',
    building: 'LC3',
    floor: 2,
    category: 'laboratory',
    coordinates: { x: 300, y: 400 },
    aliases: [],
    landmarks: [],
  },
  {
    id: 'LC3-F1-R103',
    code: 'LC3-103',
    roomNumber: '103',
    nameThai: 'ห้อง 103',
    building: 'LC3',
    floor: 1,
    category: 'lecture_room',
    coordinates: { x: 200, y: 300 },
    aliases: [],
    landmarks: [],
  },
]

const mockSchedules: ScheduleSlot[] = [
  {
    roomCode: 'LC3-103',
    eventCode: 'CS361',
    eventName: 'CS 361',
    dayOfWeek: 'TUE',
    startTime: '08:00',
    endTime: '11:00',
    eventType: 'class',
  },
]

const mockSchedulesForRoom: ScheduleSlot[] = [
  ...mockSchedules,
  {
    roomCode: 'LC3-103',
    eventCode: 'BAS350',
    eventName: 'BAS 350',
    dayOfWeek: 'MON',
    startTime: '13:00',
    endTime: '16:00',
    eventType: 'class',
  },
]

const examSchedule: ScheduleSlot = {
  roomCode: 'LC3-103',
  eventCode: 'BAS350',
  eventName: 'Exam - BAS350',
  dayOfWeek: 'TUE',
  startTime: '13:00',
  endTime: '16:00',
  eventType: 'exam',
  eventDate: '2027-05-18',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RoomSearchPanel Component', () => {
  it('renders the TORCH brand logo at the top of the panel', () => {
    render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />)

    const logo = screen.getByRole('img', { name: /TORCH Faculty Nav System/i })
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveClass('h-7')
  })

  it('does not render the search result list when query is empty and category is all', () => {
    render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />)

    expect(screen.getByPlaceholderText(/ค้นหาห้อง/i)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText('LC3-101')).not.toBeInTheDocument()
  })

  it('renders matching results when user types a search query', async () => {
    const user = userEvent.setup()
    render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />)

    const input = screen.getByPlaceholderText(/ค้นหาห้อง/i)
    await user.type(input, '101')

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('LC3-101')).toBeInTheDocument()
    expect(screen.queryByText('LC3-201')).not.toBeInTheDocument()
  })

  it('keeps Thai room-name searches with digits in the room-result flow', async () => {
    const user = userEvent.setup()
    render(
      <RoomSearchPanel
        rooms={mockRooms}
        schedules={[examSchedule]}
        onSelectRoom={vi.fn()}
      />
    )

    await user.type(screen.getByPlaceholderText(/ค้นหาห้อง/i), 'ห้องเรียน 1')

    expect(screen.getByText('LC3-101')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ผลการค้นหาการสอบ' })).not.toBeInTheDocument()
  })

  it('shows schedule details and selects its classroom for map zoom', async () => {
    const user = userEvent.setup()
    const handleSelectRoom = vi.fn()
    render(
      <RoomSearchPanel
        rooms={mockRooms}
        schedules={mockSchedules}
        onSelectRoom={handleSelectRoom}
      />
    )

    await user.type(screen.getByPlaceholderText(/ค้นหาห้อง/i), 'CS361')

    expect(screen.getByText('CS361 · CS 361 · TUE 08:00-11:00 · LC3-103')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /CS 361/ }))

    expect(handleSelectRoom).toHaveBeenCalledWith('LC3-F1-R103')
  })

  it('only renders the schedule matching the subject query', async () => {
    const user = userEvent.setup()
    render(
      <RoomSearchPanel
        rooms={mockRooms}
        schedules={mockSchedulesForRoom}
        onSelectRoom={vi.fn()}
      />
    )

    await user.type(screen.getByPlaceholderText(/ค้นหาห้อง/i), 'CS361')

    expect(screen.getByText('CS361 · CS 361 · TUE 08:00-11:00 · LC3-103')).toBeInTheDocument()
    expect(screen.queryByText('BAS350 · BAS 350 · MON 13:00-16:00 · LC3-103')).not.toBeInTheDocument()
  })

  it('shows an exam card and navigates directly to its room', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-01T12:00:00'))
    const onNavigateToRoom = vi.fn()
    render(
      <RoomSearchPanel
        rooms={mockRooms}
        schedules={[examSchedule]}
        onSelectRoom={vi.fn()}
        onNavigateToRoom={onNavigateToRoom}
      />
    )

    fireEvent.change(screen.getByPlaceholderText(/ค้นหาห้อง/i), {
      target: { value: 'bas 350 13.00' },
    })

    expect(screen.getByText('สอบ: BAS350')).toBeInTheDocument()
    expect(screen.getByText('อ. 18 พ.ค. 2570 13:00–16:00')).toBeInTheDocument()
    expect(screen.getByText('อาคาร LC3 · ห้อง LC3-103 ชั้น 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'นำทางไปห้องสอบ LC3-103' }))
    expect(onNavigateToRoom).toHaveBeenCalledWith('LC3-F1-R103')
  })

  it('shows the exam-specific empty state for an unknown course code', async () => {
    const user = userEvent.setup()
    render(
      <RoomSearchPanel
        rooms={mockRooms}
        schedules={mockSchedules}
        onSelectRoom={vi.fn()}
      />
    )

    await user.type(screen.getByPlaceholderText(/ค้นหาห้อง/i), 'NOPE123')

    expect(
      screen.getByText('ไม่พบการสอบที่ตรงกับรหัสวิชา ลองตรวจสอบรหัสวิชาอีกครั้ง')
    ).toBeInTheDocument()
    expect(screen.queryByText('ไม่พบห้องที่ค้นหา ลองเปลี่ยนคำค้นหาหรือหมวดหมู่ดูนะ')).not.toBeInTheDocument()
  })

  it('preserves direct room-code search instead of treating it as a course code', async () => {
    const user = userEvent.setup()
    render(
      <RoomSearchPanel
        rooms={mockRooms}
        schedules={[examSchedule]}
        onSelectRoom={vi.fn()}
      />
    )

    await user.type(screen.getByPlaceholderText(/ค้นหาห้อง/i), 'LC3-103')

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('LC3-103')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ผลการค้นหาการสอบ' })).not.toBeInTheDocument()
  })

  it('keeps direct room results available while schedules are loading', async () => {
    const user = userEvent.setup()
    const handleSelectRoom = vi.fn()
    render(
      <RoomSearchPanel
        rooms={mockRooms}
        schedulesLoading
        onSelectRoom={handleSelectRoom}
      />
    )

    await user.type(screen.getByPlaceholderText(/ค้นหาห้อง/i), '101')

    expect(screen.getByText('LC3-101')).toBeInTheDocument()
    expect(screen.getByText('กำลังโหลดตารางเรียน...')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /LC3-101/i }))

    expect(handleSelectRoom).toHaveBeenCalledWith('LC3-F1-R101')
  })

  it('keeps direct room results available when schedules fail', async () => {
    const user = userEvent.setup()
    const handleSelectRoom = vi.fn()
    render(
      <RoomSearchPanel
        rooms={mockRooms}
        schedulesError={new Error('schedule service unavailable')}
        onSelectRoom={handleSelectRoom}
      />
    )

    await user.type(screen.getByPlaceholderText(/ค้นหาห้อง/i), '101')

    expect(screen.getByText('LC3-101')).toBeInTheDocument()
    expect(screen.getByText('ไม่สามารถโหลดรายละเอียดตารางเรียนได้')).toBeInTheDocument()
    expect(screen.queryByText('schedule service unavailable')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /LC3-101/i }))

    expect(handleSelectRoom).toHaveBeenCalledWith('LC3-F1-R101')
  })

  it('renders filtered results when user selects a category', async () => {
    const user = userEvent.setup()
    render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />)

    const labButton = screen.getByRole('button', { name: 'ห้องปฏิบัติการ' })
    await user.click(labButton)


    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('LC3-201')).toBeInTheDocument()
    expect(screen.queryByText('LC3-101')).not.toBeInTheDocument()
  })

  it('collapses dropdown and retains query when a room is selected', async () => {
    const user = userEvent.setup()
    const handleSelectRoom = vi.fn()
    render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={handleSelectRoom} />)

    const input = screen.getByPlaceholderText(/ค้นหาห้อง/i)
    await user.type(input, '101')

    expect(screen.getByRole('list')).toBeInTheDocument()

    const resultButton = screen.getByRole('button', { name: /LC3-101/i })
    await user.click(resultButton)

    // Selection called
    expect(handleSelectRoom).toHaveBeenCalledWith('LC3-F1-R101')
    // Dropdown collapsed
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    // Query retained
    expect(input).toHaveValue('101')
  })

  it('re-opens dropdown when search input is focused again with existing query', async () => {
    const user = userEvent.setup()
    render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />)

    const input = screen.getByPlaceholderText(/ค้นหาห้อง/i)
    await user.type(input, '101')

    const resultButton = screen.getByRole('button', { name: /LC3-101/i })
    await user.click(resultButton)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    // Focus input again
    await user.click(input)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('LC3-101')).toBeInTheDocument()
  })

  it('dismisses dropdown when Escape key is pressed', async () => {
    const user = userEvent.setup()
    render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />)

    const input = screen.getByPlaceholderText(/ค้นหาห้อง/i)
    await user.type(input, '101')
    expect(screen.getByRole('list')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(input).toHaveValue('101')
  })

  it('dismisses dropdown when clicking outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />
      </div>
    )

    const input = screen.getByPlaceholderText(/ค้นหาห้อง/i)
    await user.type(input, '101')
    expect(screen.getByRole('list')).toBeInTheDocument()

    const outside = screen.getByTestId('outside-area')
    await user.click(outside)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('starts with filter collapsed by default on mobile viewport (< 640px)', () => {
    const originalWidth = window.innerWidth
    window.innerWidth = 375

    try {
      render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />)
      const toggleButton = screen.getByRole('button', { name: /แสดงตัวกรอง/i })
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
    } finally {
      window.innerWidth = originalWidth
    }
  })

  it('auto-collapses filter bar on mobile when a room is selected', async () => {
    const originalWidth = window.innerWidth
    window.innerWidth = 375
    const user = userEvent.setup()

    try {
      render(<RoomSearchPanel rooms={mockRooms} onSelectRoom={vi.fn()} />)
      const toggleButton = screen.getByRole('button', { name: /แสดงตัวกรอง/i })
      // Expand filter
      await user.click(toggleButton)
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true')

      // Type and select a room
      const input = screen.getByPlaceholderText(/ค้นหาห้อง/i)
      await user.type(input, '101')
      const resultButton = screen.getByRole('button', { name: /LC3-101/i })
      await user.click(resultButton)

      // Filter bar should now be auto-collapsed
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
    } finally {
      window.innerWidth = originalWidth
    }
  })
})
