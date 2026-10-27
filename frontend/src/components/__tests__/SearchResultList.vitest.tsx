import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SearchResultList from '../SearchResultList'
import type { Room } from '../../types/room'
import type { ScheduleSlot } from '../../types/schedule'

const room: Room = {
  id: 'LC3-F1-R103',
  code: 'LC3-103',
  roomNumber: '103',
  nameThai: 'ห้องบรรยาย',
  building: 'LC3',
  floor: 1,
  category: 'lecture_room',
  coordinates: { x: 320, y: 180 },
  landmarks: [],
  aliases: ['LC3-103'],
}

const exam = (eventCode: string, eventDate?: string): ScheduleSlot => ({
  roomCode: room.code,
  eventCode,
  eventName: `Exam ${eventCode}`,
  dayOfWeek: 'MON',
  startTime: '09:00',
  endTime: '12:00',
  eventType: 'exam',
  ...(eventDate ? { eventDate } : {}),
})

const activity: ScheduleSlot = {
  roomCode: 'LC3-105',
  eventCode: 'OPEN-HOUSE',
  eventName: 'Open House',
  dayOfWeek: 'FRI',
  startTime: '13:00',
  endTime: '15:00',
  eventType: 'other',
  eventDate: '2026-10-30',
}

describe('SearchResultList exam dates', () => {
  it('shows a direct exam card with date, time, room and navigation action', async () => {
    const onNavigateToRoom = vi.fn()
    const user = userEvent.setup()

    render(
      <SearchResultList
        rooms={[room]}
        allRooms={[room]}
        schedules={[]}
        examResults={[exam('BAS350', '2026-05-18')]}
        examSearchActive
        schedulesLoading={false}
        schedulesError={null}
        loading={false}
        error={null}
        onSelectRoom={vi.fn()}
        onNavigateToRoom={onNavigateToRoom}
      />
    )

    expect(screen.getByText('สอบ: BAS350')).toBeInTheDocument()
    expect(screen.getByText('จ. 18 พ.ค. 2569 09:00–12:00')).toBeInTheDocument()
    expect(screen.getByText('อาคาร LC3 · ห้อง LC3-103 ชั้น 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'นำทางไปห้องสอบ LC3-103' }))
    expect(onNavigateToRoom).toHaveBeenCalledWith(room.id)
  })

  it('shows the existing pin action when the user is signed in', () => {
    localStorage.setItem(
      'perimeter_auth_session',
      JSON.stringify({
        expiresAt: Date.now() + 60_000,
        user: { email: 'student@example.edu', sub: 'student-1', groups: ['user'] },
      })
    )

    try {
      render(
        <MemoryRouter>
          <SearchResultList
            rooms={[room]}
            allRooms={[room]}
            schedules={[]}
            examResults={[exam('BAS350', '2027-05-18')]}
            examSearchActive
            schedulesLoading={false}
            schedulesError={null}
            loading={false}
            error={null}
            onSelectRoom={vi.fn()}
          />
        </MemoryRouter>
      )

      expect(screen.getByTestId('pin-button-LC3-103-MON#09:00#BAS350')).toBeInTheDocument()
    } finally {
      localStorage.removeItem('perimeter_auth_session')
    }
  })

  it('shows the date and fallback for exam schedule previews', () => {
    render(
      <SearchResultList
        rooms={[room]}
        schedules={[exam('EXAM-A', '2026-05-18'), exam('EXAM-B')]}
        schedulesLoading={false}
        schedulesError={null}
        loading={false}
        error={null}
        onSelectRoom={vi.fn()}
      />
    )

    expect(screen.getByText('2026-05-18')).toBeInTheDocument()
    expect(screen.getByText('date to be announced')).toBeInTheDocument()
  })

  it('shows the updated room for an activity and navigates to its current room', async () => {
    const updatedRoom: Room = {
      ...room,
      id: 'LC3-F1-R105',
      code: 'LC3-105',
      roomNumber: '105',
      nameThai: 'ห้องใหม่',
    }
    const onNavigateToRoom = vi.fn()
    const user = userEvent.setup()

    render(
      <SearchResultList
        rooms={[updatedRoom]}
        allRooms={[room, updatedRoom]}
        schedules={[]}
        activityResults={[activity]}
        schedulesLoading={false}
        schedulesError={null}
        loading={false}
        error={null}
        onSelectRoom={vi.fn()}
        onNavigateToRoom={onNavigateToRoom}
      />
    )

    expect(screen.getByText('Open House')).toBeInTheDocument()
    expect(screen.getByText('อาคาร LC3 · ห้อง LC3-105 ชั้น 1')).toBeInTheDocument()
    expect(screen.queryByText('อาคาร LC3 · ห้อง LC3-103 ชั้น 1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ดูห้อง/ })).toBeInTheDocument()
    expect(screen.getByText('LC3-105')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'นำทางไปกิจกรรม Open House' }))
    expect(onNavigateToRoom).toHaveBeenCalledWith(updatedRoom.id)
  })

  it('shows a closed room reason and prevents navigation to an activity', () => {
    const updatedRoom: Room = {
      ...room,
      id: 'LC3-F1-R105',
      code: 'LC3-105',
      roomNumber: '105',
    }
    const onNavigateToRoom = vi.fn()

    render(
      <SearchResultList
        rooms={[updatedRoom]}
        allRooms={[updatedRoom]}
        schedules={[]}
        activityResults={[activity]}
        roomClosures={new Map([[updatedRoom.id, { closed: true, closedReason: 'ปรับปรุงห้อง' }]])}
        schedulesLoading={false}
        schedulesError={null}
        loading={false}
        error={null}
        onSelectRoom={vi.fn()}
        onNavigateToRoom={onNavigateToRoom}
      />
    )

    expect(screen.getByText('ห้องนี้ปิดชั่วคราว')).toBeInTheDocument()
    expect(screen.getByText('เหตุผล: ปรับปรุงห้อง')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'นำทางไปกิจกรรม Open House' })).toBeDisabled()
    expect(onNavigateToRoom).not.toHaveBeenCalled()
  })

  it('shows an exam date in the legacy search result format', () => {
    render(
      <SearchResultList
        rooms={[room]}
        schedules={[exam('EXAM-A', '2026-05-18'), exam('EXAM-B')]}
        schedulesLoading={false}
        schedulesError={null}
        loading={false}
        error={null}
        onSelectRoom={vi.fn()}
        variant="legacy"
      />
    )

    expect(screen.getByText(/MON 09:00-12:00 · 2026-05-18/)).toBeInTheDocument()
    expect(screen.getByText(/MON 09:00-12:00 · date to be announced/)).toBeInTheDocument()
  })
})
