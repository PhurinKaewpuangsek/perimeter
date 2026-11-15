import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import ExamAgendaList from '../ExamAgendaList'
import {
  formatThaiDateHeader,
  extractSeatsInfo,
} from '../../services/scheduleDisplay'
import type { ScheduleSlot } from '../../types/schedule'

const SAMPLE_EXAMS: ScheduleSlot[] = [
  {
    roomCode: 'LC3-104',
    eventCode: 'NP307',
    eventName: 'Exam - NP307 (Seats 1-7) (8 พ.ค. 2569)',
    dayOfWeek: 'FRI',
    startTime: '09:00',
    endTime: '12:00',
    eventType: 'exam',
    eventDate: '2026-05-08',
  },
  {
    roomCode: 'LC3-104',
    eventCode: 'CS352',
    eventName: 'Exam - CS352 (Seats 8-14) (8 พ.ค. 2569)',
    dayOfWeek: 'FRI',
    startTime: '09:00',
    endTime: '12:00',
    eventType: 'exam',
    eventDate: '2026-05-08',
  },
  {
    roomCode: 'LC3-104',
    eventCode: 'ST218',
    eventName: 'Exam - ST218 (Seats 1-10) (15 พ.ค. 2569)',
    dayOfWeek: 'FRI',
    startTime: '09:00',
    endTime: '12:00',
    eventType: 'exam',
    eventDate: '2026-05-15',
  },
]

describe('ExamAgendaList', () => {
  it('renders empty state when slots array is empty', () => {
    render(
      <MemoryRouter>
        <ExamAgendaList slots={[]} roomCode="LC3-104" />
      </MemoryRouter>
    )

    expect(screen.getByText('ไม่มีข้อมูลการสอบในห้องนี้')).toBeInTheDocument()
    expect(screen.queryByTestId('exam-agenda-list')).not.toBeInTheDocument()
  })

  it('groups exams by date into distinct chronological sections (no date-flattening collision)', () => {
    render(
      <MemoryRouter>
        <ExamAgendaList slots={SAMPLE_EXAMS} roomCode="LC3-104" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('exam-agenda-list')).toBeInTheDocument()

    // Date headers
    expect(screen.getByText(/8 พฤษภาคม 2569/)).toBeInTheDocument()
    expect(screen.getByText(/15 พฤษภาคม 2569/)).toBeInTheDocument()

    // 8 May group has (2 วิชา)
    expect(screen.getByText('(2 วิชา)')).toBeInTheDocument()
    // 15 May group has (1 วิชา)
    expect(screen.getByText('(1 วิชา)')).toBeInTheDocument()

    // All course codes rendered
    expect(screen.getByText('NP307')).toBeInTheDocument()
    expect(screen.getByText('CS352')).toBeInTheDocument()
    expect(screen.getByText('ST218')).toBeInTheDocument()

    // Seating info extracted and rendered as badges
    expect(screen.getByText('Seats 1-7')).toBeInTheDocument()
    expect(screen.getByText('Seats 8-14')).toBeInTheDocument()
    expect(screen.getByText('Seats 1-10')).toBeInTheDocument()

    // Dates rendered on each card
    expect(screen.getAllByText('วันสอบ: 2026-05-08')).toHaveLength(2)
    expect(screen.getByText('วันสอบ: 2026-05-15')).toBeInTheDocument()
  })

  it('renders unannounced exams with fallback label', () => {
    const unannouncedExam: ScheduleSlot = {
      roomCode: 'LC3-104',
      eventCode: 'MA101',
      eventName: 'Exam - MA101',
      dayOfWeek: 'MON',
      startTime: '13:00',
      endTime: '16:00',
      eventType: 'exam',
      eventDate: '',
    }

    render(
      <MemoryRouter>
        <ExamAgendaList slots={[unannouncedExam]} roomCode="LC3-104" />
      </MemoryRouter>
    )

    expect(screen.getByText('MA101')).toBeInTheDocument()
    expect(screen.getByText('date to be announced')).toBeInTheDocument()
    expect(screen.getByText('ยังไม่ประกาศวันสอบ')).toBeInTheDocument()
  })

  it('renders custom actions via renderActions prop', () => {
    render(
      <MemoryRouter>
        <ExamAgendaList
          slots={SAMPLE_EXAMS.slice(0, 1)}
          renderActions={(slot) => (
            <button type="button" data-testid={`custom-action-${slot.eventCode}`}>
              Custom Button
            </button>
          )}
        />
      </MemoryRouter>
    )

    expect(screen.getByTestId('custom-action-NP307')).toBeInTheDocument()
  })

  it('highlights the searched exam card with a badge when highlightEventCode matches', () => {
    render(
      <MemoryRouter>
        <ExamAgendaList
          slots={SAMPLE_EXAMS}
          roomCode="LC3-104"
          highlightEventCode="CS352"
        />
      </MemoryRouter>
    )

    const highlightedCard = screen.getByTestId('exam-card-highlighted')
    expect(highlightedCard).toBeInTheDocument()
    expect(highlightedCard).toHaveAttribute('data-highlighted', 'true')
    expect(screen.getByText('วิชาที่ค้นหา')).toBeInTheDocument()
  })

  it('scrolls into view smoothly when highlightEventCode matches', async () => {
    const scrollIntoViewMock = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

    render(
      <MemoryRouter>
        <ExamAgendaList
          slots={SAMPLE_EXAMS}
          roomCode="LC3-104"
          highlightEventCode="ST218"
        />
      </MemoryRouter>
    )

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })
  })

  describe('formatThaiDateHeader', () => {
    it('formats ISO date to full Thai date string', () => {
      expect(formatThaiDateHeader('2026-05-08', 'FRI')).toBe('วันศุกร์ที่ 8 พฤษภาคม 2569')
      expect(formatThaiDateHeader('2026-10-20', 'TUE')).toBe('วันอังคารที่ 20 ตุลาคม 2569')
    })

    it('returns fallback when date is missing', () => {
      expect(formatThaiDateHeader('', 'MON')).toBe('ยังไม่ประกาศวันสอบ')
      expect(formatThaiDateHeader(undefined, 'MON')).toBe('ยังไม่ประกาศวันสอบ')
    })
  })

  describe('extractSeatsInfo', () => {
    it('extracts seat range from parenthesized event name', () => {
      expect(extractSeatsInfo('Exam - NP307 (Seats 1-7) (8 พ.ค. 2569)')).toBe('Seats 1-7')
      expect(extractSeatsInfo('Exam - CS352 (Seat A1-A20)')).toBe('Seat A1-A20')
    })

    it('returns null when no seats info exists', () => {
      expect(extractSeatsInfo('Exam - CS140 (8 พ.ค. 2569)')).toBeNull()
      expect(extractSeatsInfo('CS352 Final Exam')).toBeNull()
    })
  })
})

