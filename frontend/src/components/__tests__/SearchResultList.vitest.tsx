import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

describe('SearchResultList exam dates', () => {
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
