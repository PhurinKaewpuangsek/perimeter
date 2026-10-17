import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeeklyTimetable from '../WeeklyTimetable'
import type { ScheduleSlot } from '../../types/schedule'

const slot = (overrides: Partial<ScheduleSlot>): ScheduleSlot => ({
  roomCode: 'LC3-103',
  eventCode: 'CS101',
  eventName: 'CS 101',
  dayOfWeek: 'MON',
  startTime: '09:00',
  endTime: '10:30',
  eventType: 'class',
  ...overrides,
})

const SLOTS: ScheduleSlot[] = [
  slot({ eventCode: 'CS101', dayOfWeek: 'MON', startTime: '09:30', endTime: '11:00' }),
  slot({ eventCode: 'MA624', dayOfWeek: 'WED', startTime: '13:00', endTime: '14:30' }),
  slot({
    eventCode: 'BAS350',
    eventName: 'Exam - BAS350',
    dayOfWeek: 'MON',
    startTime: '13:00',
    endTime: '16:00',
    eventType: 'exam',
    eventDate: '2026-05-18',
  }),
  slot({
    eventCode: 'CS140',
    dayOfWeek: 'FRI',
    startTime: '09:00',
    endTime: '12:00',
    eventType: 'exam',
    eventDate: '',
  }),
  slot({ eventCode: 'ST326', dayOfWeek: 'FRI', startTime: '09:00', endTime: '12:00', eventType: 'exam', eventDate: '2026-05-15' }),
]

const actions = (s: ScheduleSlot) => <button type="button">pin {s.eventCode}</button>

describe('WeeklyTimetable', () => {
  it('shows an empty message for a room with no schedule', () => {
    render(<WeeklyTimetable slots={[]} />)
    expect(screen.getByTestId('timetable-empty')).toHaveTextContent('ยังไม่มีตาราง')
  })

  describe('grid layout (desktop)', () => {
    it('shows all seven days and every entry in its day column', () => {
      render(<WeeklyTimetable slots={SLOTS} layout="grid" />)
      for (const day of ['วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์']) {
        expect(screen.getByRole('group', { name: day })).toBeInTheDocument()
      }
      const monday = screen.getByRole('group', { name: 'วันจันทร์' })
      expect(within(monday).getByRole('button', { name: /CS101.*09:30–11:00/ })).toBeInTheDocument()
      expect(within(monday).getByRole('button', { name: /BAS350.*13:00–16:00/ })).toBeInTheDocument()
      const wednesday = screen.getByRole('group', { name: 'วันพุธ' })
      expect(within(wednesday).getByRole('button', { name: /MA624/ })).toBeInTheDocument()
    })

    it('shows overlapping entries side by side', () => {
      render(<WeeklyTimetable slots={SLOTS} layout="grid" />)
      const friday = screen.getByRole('group', { name: 'วันศุกร์' })
      const cs140 = within(friday).getByRole('button', { name: /CS140/ })
      const st326 = within(friday).getByRole('button', { name: /ST326/ })
      expect(cs140.style.width).toContain('50%')
      expect(st326.style.width).toContain('50%')
      expect(cs140.style.left).not.toBe(st326.style.left)
    })

    it('shows details, exam date and actions for the tapped entry', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="grid" renderActions={actions} />)
      await user.click(screen.getByRole('button', { name: /BAS350/ }))
      const card = screen.getByTestId('timetable-entry-card')
      expect(card).toHaveTextContent('Exam - BAS350')
      expect(card).toHaveTextContent('วันจันทร์ 13:00–16:00')
      expect(card).toHaveTextContent('วันสอบ: 2026-05-18')
      expect(within(card).getByRole('button', { name: 'pin BAS350' })).toBeInTheDocument()
    })

    it('labels an exam without a date as date to be announced', () => {
      render(<WeeklyTimetable slots={SLOTS} layout="grid" />)
      expect(screen.getByRole('button', { name: /CS140.*date to be announced/ })).toBeInTheDocument()
    })

    it('shows an undated exam as "date to be announced" without a "สอบ" prefix', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="grid" />)
      await user.click(screen.getByRole('button', { name: /CS140/ }))
      const card = screen.getByTestId('timetable-entry-card')
      expect(card).toHaveTextContent('date to be announced')
      expect(card).not.toHaveTextContent('สอบ date')
    })

    it('keeps the opened details when the parent passes a fresh copy of the same slots', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<WeeklyTimetable slots={SLOTS} layout="grid" />)
      await user.click(screen.getByRole('button', { name: /BAS350/ }))
      rerender(<WeeklyTimetable slots={SLOTS.map((s) => ({ ...s }))} layout="grid" />)
      expect(screen.getByTestId('timetable-entry-card')).toHaveTextContent('BAS350')
    })

    it('never puts action buttons inside a grid block (no nested buttons)', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="grid" renderActions={actions} />)
      const block = screen.getByRole('button', { name: /BAS350/ })
      expect(within(block).queryByRole('button')).not.toBeInTheDocument()
      await user.click(block)
      expect(screen.getByRole('button', { name: 'pin BAS350' })).toBeInTheDocument()
    })
  })

  describe('day layout (mobile)', () => {
    it('opens on the first day that has entries and switches days with tabs', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="day" renderActions={actions} />)

      expect(screen.getByRole('tab', { name: /วันจันทร์/ })).toHaveAttribute('aria-selected', 'true')
      const monday = screen.getByRole('tabpanel', { name: 'วันจันทร์' })
      expect(within(monday).getByRole('listitem', { name: /CS101/ })).toBeInTheDocument()
      expect(within(monday).getByRole('button', { name: 'pin CS101' })).toBeInTheDocument()
      expect(within(monday).getByText('วันสอบ: 2026-05-18')).toBeInTheDocument()

      await user.click(screen.getByRole('tab', { name: /วันพุธ/ }))
      const wednesday = screen.getByRole('tabpanel', { name: 'วันพุธ' })
      expect(within(wednesday).getByRole('listitem', { name: /MA624/ })).toBeInTheDocument()
      expect(screen.queryByRole('listitem', { name: /CS101/ })).not.toBeInTheDocument()
    })

    it('shows a message for a day with no entries', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="day" />)
      await user.click(screen.getByRole('tab', { name: /วันอาทิตย์/ }))
      expect(screen.getByText('ไม่มีคาบในวันอาทิตย์')).toBeInTheDocument()
    })
  })

  it('lists entries with malformed times instead of hiding them', () => {
    render(
      <WeeklyTimetable
        slots={[...SLOTS, slot({ eventCode: 'CS345', startTime: '13.00', endTime: '15.00' })]}
        layout="grid"
        renderActions={actions}
      />
    )
    const skipped = screen.getByTestId('timetable-skipped')
    expect(skipped).toHaveTextContent('CS345')
    expect(within(skipped).getByRole('button', { name: 'pin CS345' })).toBeInTheDocument()
  })

  describe('auto layout', () => {
    afterEach(() => vi.restoreAllMocks())

    const mockContainerWidth = (width: number) =>
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect)

    it('uses day tabs in a narrow container such as the 400px room panel', () => {
      mockContainerWidth(400)
      render(<WeeklyTimetable slots={SLOTS} />)
      expect(screen.getByTestId('timetable-day')).toBeInTheDocument()
      expect(screen.queryByTestId('timetable-grid')).not.toBeInTheDocument()
    })

    it('uses the Mon–Sun grid when the container is wide', () => {
      mockContainerWidth(800)
      render(<WeeklyTimetable slots={SLOTS} />)
      expect(screen.getByTestId('timetable-grid')).toBeInTheDocument()
    })
  })
})
