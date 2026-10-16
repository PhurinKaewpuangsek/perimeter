import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Room } from '../../types/room'
import type { ScheduleSlot } from '../../types/schedule'

const room = (id: string, code: string, x: number, y: number): Room => ({
  id,
  code,
  roomNumber: code.slice(code.indexOf('-') + 1),
  nameThai: 'ห้องบรรยายเรียนรวม',
  building: 'LC3',
  floor: 1,
  category: 'lecture_room',
  coordinates: { x, y },
  aliases: [code],
  landmarks: [],
})

const ROOMS: Room[] = [
  room('LC3-F1-R105', 'LC3-105', 318, 148),
  room('LC3-F1-R121', 'LC3-121', 408, 531),
  room('LC3-F1-R122', 'LC3-122', 408, 458),
]

const slot = (roomCode: string, dayOfWeek: string): ScheduleSlot => ({
  roomCode,
  eventCode: 'CS102',
  eventName: 'CS 102',
  dayOfWeek,
  startTime: '11:00',
  endTime: '12:30',
  eventType: 'class',
})

const SCHEDULES: ScheduleSlot[] = [
  slot('LC3-121', 'TUE'),
  slot('LC3-121', 'THU'),
  slot('LC3-122', 'TUE'),
  slot('LC3-122', 'THU'),
]

vi.mock('../../hooks/useRooms', () => ({
  useRooms: () => ({ rooms: ROOMS, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('../../hooks/useSchedules', () => ({
  useSchedules: () => ({ schedules: SCHEDULES, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('../../hooks/usePreloadImages', () => ({
  usePreloadImages: () => true,
}))

const { default: MapPage } = await import('../MapPage')

/** Make useIsDesktop() report a phone-width viewport (< 640px). */
function mockViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isDesktop,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

/**
 * jsdom does not load Tailwind, so the browser's pointer-events inheritance has to be
 * resolved from the class names: the nearest ancestor that sets pointer-events wins.
 */
function effectivePointerEvents(el: Element): 'auto' | 'none' {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const classes = node.classList
    if (classes.contains('pointer-events-auto')) return 'auto'
    if (classes.contains('pointer-events-none')) return 'none'
  }
  return 'auto'
}

function renderMap(path = '/map') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MapPage />
    </MemoryRouter>
  )
}

const originalMatchMedia = window.matchMedia

describe('MapPage course search (issue #91)', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  describe.each([
    ['mobile', false],
    ['desktop', true],
  ])('%s layout', (_layout, isDesktop) => {
    beforeEach(() => mockViewport(isDesktop))

    it('lists only rooms that have CS102 and every result can receive taps', async () => {
      const user = userEvent.setup()
      renderMap()

      await user.type(screen.getByRole('textbox'), 'CS102')

      const results = screen.getAllByRole('button', { name: /ดูห้อง/ })
      expect(results.map((b) => within(b).getByText(/^LC3-/).textContent)).toEqual([
        'LC3-121',
        'LC3-122',
      ])
      for (const result of results) {
        // A result that inherits pointer-events: none lets the tap fall through to
        // the map, which then pins whatever room is underneath instead.
        expect(effectivePointerEvents(result)).toBe('auto')
      }
    })

    it('choosing a result pins that room, replacing the previously pinned one', async () => {
      const user = userEvent.setup()
      renderMap('/map?room=LC3-F1-R105')

      if (!isDesktop) {
        await user.click(screen.getByRole('button', { name: 'ปิดรายละเอียดห้อง' }))
      }
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), 'CS102')
      const target = screen
        .getAllByRole('button', { name: /ดูห้อง/ })
        .find((b) => within(b).queryByText('LC3-122'))!
      await user.click(target)

      const pinned = document.querySelectorAll('[role="button"][aria-pressed="true"]')
      expect(pinned).toHaveLength(1)
      expect(pinned[0]).toHaveTextContent('122')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('122')
    })
  })

  it('mobile backdrop catches taps so they cannot select a room pin underneath', async () => {
    mockViewport(false)
    const user = userEvent.setup()
    renderMap()

    await user.type(screen.getByRole('textbox'), 'CS102')

    expect(effectivePointerEvents(screen.getByTestId('mobile-search-backdrop'))).toBe('auto')
    expect(effectivePointerEvents(screen.getByTestId('mobile-search-results'))).toBe('auto')
    // The search box must stay usable above the backdrop.
    expect(effectivePointerEvents(screen.getByRole('textbox'))).toBe('auto')
  })

  describe('MapPage navigation and clear/dismiss behavior (issue #99)', () => {
    describe.each([
      ['mobile', false],
      ['desktop', true],
    ])('%s layout', (_layout, isDesktop) => {
      beforeEach(() => mockViewport(isDesktop))

      it('renders top bar with back-to-home link pointing to /', () => {
        renderMap()
        const backToHome = screen.getByTestId('back-to-home')
        expect(backToHome).toBeInTheDocument()
        expect(backToHome).toHaveAttribute('href', '/')
      })

      it('renders My Schedule placeholder slot', () => {
        renderMap()
        const placeholder = screen.getByTestId('my-schedule-placeholder')
        expect(placeholder).toBeInTheDocument()
        expect(placeholder).toHaveTextContent(/my schedule/i)
      })

      it('renders login entry visible and pointing to /login', () => {
        renderMap()
        const loginLink = screen.getByTestId('login-link')
        expect(loginLink).toBeInTheDocument()
        expect(loginLink).toHaveAttribute('href', '/login')
      })

      it('resets the selected room and search from the map controls', async () => {
        const user = userEvent.setup()
        renderMap('/map?room=LC3-F1-R105&q=CS102')

        expect(screen.getByRole('textbox')).toHaveValue('CS102')
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('105')

        await user.click(screen.getByRole('button', { name: 'รีเซ็ตแผนที่' }))

        expect(screen.getByRole('textbox')).toHaveValue('')
        expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
        expect(document.querySelectorAll('[role="button"][aria-pressed="true"]')).toHaveLength(0)
      })

      it('search bar clear (X) button empties query and dismisses search results', async () => {
        const user = userEvent.setup()
        renderMap()

        const input = screen.getByRole('textbox')
        await user.type(input, 'CS102')
        expect(input).toHaveValue('CS102')

        const clearBtn = screen.getByRole('button', { name: 'ล้างการค้นหา' })
        expect(clearBtn).toBeInTheDocument()

        await user.click(clearBtn)
        expect(input).toHaveValue('')
        expect(screen.queryByRole('button', { name: 'ล้างการค้นหา' })).not.toBeInTheDocument()
      })

      it('clearing search query via (X) does not change or lose the pinned room', async () => {
        const user = userEvent.setup()
        renderMap('/map?room=LC3-F1-R105')

        if (!isDesktop) {
          await user.click(screen.getByRole('button', { name: 'ปิดรายละเอียดห้อง' }))
        }

        const input = screen.getByRole('textbox')
        await user.type(input, 'CS102')

        const clearBtn = screen.getByRole('button', { name: 'ล้างการค้นหา' })
        await user.click(clearBtn)

        expect(input).toHaveValue('')
        const pinned = document.querySelectorAll('[role="button"][aria-pressed="true"]')
        expect(pinned).toHaveLength(1)
        expect(pinned[0]).toHaveTextContent('105')
      })
    })

    it('mobile results panel can be dismissed via close button without losing selected room', async () => {
      mockViewport(false)
      const user = userEvent.setup()
      renderMap('/map?room=LC3-F1-R105')

      // Close the bottom detail sheet so results panel can be opened
      await user.click(screen.getByRole('button', { name: 'ปิดรายละเอียดห้อง' }))

      // Search for CS102
      await user.type(screen.getByRole('textbox'), 'CS102')
      expect(screen.getByTestId('mobile-search-results')).toBeInTheDocument()

      // Click "ปิด" button in search results panel
      const closeResultsBtn = within(screen.getByTestId('mobile-search-results')).getByRole('button', {
        name: 'ปิด',
      })
      await user.click(closeResultsBtn)

      // Search results dropdown is dismissed
      expect(screen.queryByTestId('mobile-search-results')).not.toBeInTheDocument()

      // The selected room remains pinned
      const pinned = document.querySelectorAll('[role="button"][aria-pressed="true"]')
      expect(pinned).toHaveLength(1)
      expect(pinned[0]).toHaveTextContent('105')
    })

    it('mobile results panel can be dismissed via backdrop click without losing selected room', async () => {
      mockViewport(false)
      const user = userEvent.setup()
      renderMap('/map?room=LC3-F1-R105')

      await user.click(screen.getByRole('button', { name: 'ปิดรายละเอียดห้อง' }))

      await user.type(screen.getByRole('textbox'), 'CS102')
      const backdrop = screen.getByTestId('mobile-search-backdrop')
      expect(backdrop).toBeInTheDocument()

      await user.click(backdrop)

      expect(screen.queryByTestId('mobile-search-results')).not.toBeInTheDocument()

      const pinned = document.querySelectorAll('[role="button"][aria-pressed="true"]')
      expect(pinned).toHaveLength(1)
      expect(pinned[0]).toHaveTextContent('105')
    })
  })
})
