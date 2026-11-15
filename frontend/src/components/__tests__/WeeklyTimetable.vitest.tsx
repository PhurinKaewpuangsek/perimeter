import { describe, it, expect, afterEach } from 'vitest'
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
      expect(screen.getByTestId('timetable-entry-card')).toHaveTextContent('Exam - BAS350')
    })

    it('deselects when clicking the already-selected block', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="grid" renderActions={actions} />)
      const block = screen.getByRole('button', { name: /BAS350/ })
      await user.click(block)
      expect(screen.getByRole('button', { name: 'pin BAS350' })).toBeInTheDocument()
      await user.click(block)
      expect(screen.queryByRole('button', { name: 'pin BAS350' })).not.toBeInTheDocument()
    })
  })

  describe('compact week summary layout (interactive button replacing days table)', () => {
    it('renders the compact week summary with all courses and opens the full reg.tu modal on click', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="compact" title="ห้อง LC3-103" />)

      const summaryBtn = screen.getByTestId('compact-week-summary-btn')
      expect(summaryBtn).toBeInTheDocument()
      expect(summaryBtn).toHaveTextContent('เทอม 1/2569')
      expect(summaryBtn).toHaveTextContent('5 คาบ')

      // Shows day labels จ, อ, พ, พฤ, ศ, ส, อา
      for (const day of ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']) {
        expect(within(summaryBtn).getByText(day)).toBeInTheDocument()
      }

      // Shows course codes on the mini horizontal bars
      expect(within(summaryBtn).getByText('CS101')).toBeInTheDocument()
      expect(within(summaryBtn).getByText('MA624')).toBeInTheDocument()
      expect(within(summaryBtn).getByText('BAS350')).toBeInTheDocument()

      // Modal should not be open initially
      expect(screen.queryByTestId('tu-reg-timetable')).not.toBeInTheDocument()

      // Click anywhere on the summary button to open full modal
      await user.click(summaryBtn)

      // On PC (default JSDOM viewport >= 640px), modal displays full grid exclusively
      const modal = screen.getByRole('dialog')
      expect(screen.getByTestId('tu-reg-timetable')).toBeInTheDocument()
      expect(screen.getByText('วัน/เวลา')).toBeInTheDocument()
      expect(screen.queryByTestId('tu-great-timetable')).not.toBeInTheDocument()
      expect(within(modal).getByText('ตารางเรียนทั้งสัปดาห์')).toBeInTheDocument()

      // Quick jump bar and switcher buttons should NOT exist
      expect(screen.queryByText(/ข้ามเวลา/)).not.toBeInTheDocument()
      expect(screen.queryByTestId('view-mode-tu-great')).not.toBeInTheDocument()
      expect(screen.queryByTestId('view-mode-full-grid')).not.toBeInTheDocument()

      // Close modal
      const closeBtn = screen.getByTestId('close-tu-reg-modal')
      await user.click(closeBtn)
      expect(screen.queryByTestId('tu-reg-timetable')).not.toBeInTheDocument()
    })

    it('opens full week modal with TU Great layout exclusively on mobile layout', async () => {
      const originalInnerWidth = window.innerWidth
      window.innerWidth = 375
      try {
        const user = userEvent.setup()
        render(
          <WeeklyTimetable
            slots={[
              ...SLOTS,
              slot({ eventCode: 'NP310', eventName: 'NP 310', dayOfWeek: 'MON', startTime: '09:30', endTime: '11:30' }),
            ]}
            layout="compact"
            roomCode="LC3-103"
          />
        )

        const summaryBtn = screen.getByTestId('compact-week-summary-btn')
        await user.click(summaryBtn)

        // On mobile (< 640px), modal displays TU Great view exclusively
        const modal = screen.getByRole('dialog')
        expect(screen.getByTestId('tu-great-timetable')).toBeInTheDocument()
        expect(screen.queryByTestId('tu-reg-timetable')).not.toBeInTheDocument()

        // 5 collision-free major marks rendered without text collision
        expect(within(modal).getByText('08:00')).toBeInTheDocument()
        expect(within(modal).getByText('11:00')).toBeInTheDocument()
        expect(within(modal).getByText('14:00')).toBeInTheDocument()
        expect(within(modal).getByText('17:00')).toBeInTheDocument()
        expect(within(modal).getByText('20:00')).toBeInTheDocument()
        expect(within(modal).queryByText('09:30')).not.toBeInTheDocument()
        expect(within(modal).queryByText('18:30')).not.toBeInTheDocument()

        // Semester badge is in top modal header
        expect(within(modal).getByText('1/2569')).toBeInTheDocument()

        // No redundant inner header
        expect(within(modal).queryByRole('heading', { level: 3, name: 'ตารางเรียน' })).not.toBeInTheDocument()

        // Duplicate code subtitle NP 310 is suppressed for NP310
        const npCard = modal.querySelector('#tu-course-NP310')
        expect(npCard).not.toBeNull()
        expect(within(npCard as HTMLElement).getByText('NP310')).toBeInTheDocument()
        expect(within(npCard as HTMLElement).queryByText('NP 310')).not.toBeInTheDocument()

        // Switcher buttons should NOT exist
        expect(screen.queryByTestId('view-mode-tu-great')).not.toBeInTheDocument()
        expect(screen.queryByTestId('view-mode-full-grid')).not.toBeInTheDocument()
      } finally {
        window.innerWidth = originalInnerWidth
      }
    })

    it('shows "ไม่มีคาบ" on days without any classes', () => {
      render(<WeeklyTimetable slots={SLOTS} layout="compact" />)
      const summaryBtn = screen.getByTestId('compact-week-summary-btn')
      expect(within(summaryBtn).getAllByText('ไม่มีคาบ').length).toBeGreaterThan(0)
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
    expect(skipped).toBeInTheDocument()
    expect(within(skipped).getByText(/CS345 · MON/)).toBeInTheDocument()
    expect(within(skipped).getByRole('button', { name: 'pin CS345' })).toBeInTheDocument()
  })

  describe('auto layout', () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect

    afterEach(() => {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
    })

    function mockContainerWidth(width: number) {
      HTMLElement.prototype.getBoundingClientRect = function () {
        return {
          width,
          height: 100,
          top: 0,
          left: 0,
          bottom: 100,
          right: width,
          x: 0,
          y: 0,
          toJSON: () => {},
        }
      }
    }

    it('uses the compact week summary when the container is narrow', () => {
      mockContainerWidth(400)
      render(<WeeklyTimetable slots={SLOTS} />)
      expect(screen.getByTestId('compact-week-summary-btn')).toBeInTheDocument()
    })
  })

  describe('card styling: solid colors and rounded corners', () => {
    it('renders different classes with distinct solid colors and rounded corners in compact summary', () => {
      const testSlots = [
        slot({ eventCode: 'ST447', dayOfWeek: 'MON', startTime: '11:00', endTime: '12:30' }),
        slot({ eventCode: 'ST657/ST688', dayOfWeek: 'MON', startTime: '13:30', endTime: '16:30' }),
      ]
      render(<WeeklyTimetable slots={testSlots} layout="compact" />)
      const summaryBtn = screen.getByTestId('compact-week-summary-btn')
      const card1 = within(summaryBtn).getByText('ST447').parentElement!
      const card2 = within(summaryBtn).getByText('ST657/ST688').parentElement!

      // Rounded rectangle shape
      expect(card1).toHaveClass('rounded')
      expect(card2).toHaveClass('rounded')

      // Solid color without left-edge stripe
      expect(card1.className).not.toContain('border-l-4')
      expect(card2.className).not.toContain('border-l-4')
      expect(card1).toHaveClass('text-white')
      expect(card2).toHaveClass('text-white')

      // Each class has a different background color
      const colorClassRegex = /bg-\[#[0-9a-fA-F]+\]/
      const match1 = card1.className.match(colorClassRegex)?.[0]
      const match2 = card2.className.match(colorClassRegex)?.[0]
      expect(match1).toBeDefined()
      expect(match2).toBeDefined()
      expect(match1).not.toEqual(match2)
    })

    it('assigns the same solid color to repeated sessions of the same class across days', () => {
      const testSlots = [
        slot({ eventCode: 'ST447', dayOfWeek: 'MON', startTime: '11:00', endTime: '12:30' }),
        slot({ eventCode: 'ST447', dayOfWeek: 'WED', startTime: '11:00', endTime: '12:30' }),
      ]
      render(<WeeklyTimetable slots={testSlots} layout="compact" />)

      const summaryBtn = screen.getByTestId('compact-week-summary-btn')
      const cards = within(summaryBtn).getAllByText('ST447').map((el) => el.parentElement!)
      const colorClassRegex = /bg-\[#[0-9a-fA-F]+\]/
      const color1 = cards[0].className.match(colorClassRegex)?.[0]
      const color2 = cards[1].className.match(colorClassRegex)?.[0]

      expect(color1).toEqual(color2)
    })

    it('renders rounded-md buttons in grid view and rounded-xl in entry card', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="grid" />)
      const monday = screen.getByRole('group', { name: 'วันจันทร์' })
      const gridBtn = within(monday).getByRole('button', { name: /CS101/ })

      expect(gridBtn).toHaveClass('rounded-md')
      expect(gridBtn).not.toHaveClass('rounded-none')
      expect(gridBtn.className).not.toContain('border-l-4')

      await user.click(gridBtn)
      const entryCard = screen.getByTestId('timetable-entry-card')
      expect(entryCard).toHaveClass('rounded-xl')
      expect(entryCard).not.toHaveClass('rounded-none')
      expect(entryCard.className).not.toContain('border-l-4')
    })
  })

  describe('Week Schedule (reg.tu.ac.th style)', () => {
    it('renders TuRegTimetable directly when layout is tu-reg', () => {
      render(<WeeklyTimetable slots={SLOTS} layout="tu-reg" />)
      expect(screen.getByTestId('tu-reg-timetable')).toBeInTheDocument()

      // Has days as rows
      for (const day of ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']) {
        expect(screen.getByText(day)).toBeInTheDocument()
      }

      // Has course cards with solid color, white text, and rounded-xl
      const cs101 = screen.getByRole('button', { name: /CS101/ })
      expect(cs101).toHaveClass('rounded-xl')
      expect(cs101).toHaveClass('text-white')
      expect(cs101.className).toMatch(/bg-\[#[0-9a-fA-F]+\]/)
    })

    it('shows selected entry details card when a slot is tapped in TuRegTimetable', async () => {
      const user = userEvent.setup()
      render(<WeeklyTimetable slots={SLOTS} layout="tu-reg" renderActions={actions} />)

      const cs101 = screen.getByRole('button', { name: /CS101/ })
      await user.click(cs101)

      const card = screen.getByTestId('tu-reg-selected-card')
      expect(card).toBeInTheDocument()
      expect(card).toHaveTextContent('CS101')
      expect(within(card).getByRole('button', { name: 'pin CS101' })).toBeInTheDocument()
    })
  })
})
