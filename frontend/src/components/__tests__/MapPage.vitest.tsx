import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PinsContext, defaultContextValue } from '../../hooks/usePins'
import { MODAL_OVERLAY_Z, rootZIndex } from '../../test/stacking'
import type { Room } from '../../types/room'
import type { ScheduleSlot } from '../../types/schedule'
import type { UseRouteResult } from '../../hooks/useRoute'
import type { FoundRoute } from '../../types/route'
import type { Graph } from '../../types/graph'

const room = (id: string, code: string, x: number, y: number, category = 'lecture_room'): Room => ({
  id,
  code,
  roomNumber: code.slice(code.indexOf('-') + 1),
  nameThai: 'ห้องบรรยายเรียนรวม',
  building: 'LC3',
  floor: 1,
  category,
  coordinates: { x, y },
  aliases: [code],
  landmarks: [],
})

const ROOMS: Room[] = [
  room('LC3-F1-R105', 'LC3-105', 318, 148),
  room('LC3-F1-R103', 'LC3-103', 320, 180),
  room('LC3-F1-R121', 'LC3-121', 408, 531),
  room('LC3-F1-R122', 'LC3-122', 408, 458),
  room('LC3-F1-R201', 'LC3-201', 440, 400, 'laboratory'),
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
let schedulesForTest = SCHEDULES

vi.mock('../../hooks/useRooms', () => ({
  useRooms: () => ({ rooms: ROOMS, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('../../hooks/useSchedules', () => ({
  useSchedules: () => ({ schedules: schedulesForTest, loading: false, error: null, reload: vi.fn() }),
}))
vi.mock('../../hooks/useRoomSchedules', () => ({
  useRoomSchedules: (roomCode: string | undefined) => ({
    schedules: roomCode ? schedulesForTest.filter((schedule) => schedule.roomCode === roomCode) : [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))
const graphState = vi.hoisted(() => ({
  graph: null as Graph | null,
  error: null as Error | null,
  reload: vi.fn(async () => {}),
}))
vi.mock('../../hooks/useGraph', () => ({
  useGraph: () => ({ graph: graphState.graph, loading: false, error: graphState.error, reload: graphState.reload }),
}))
vi.mock('../../hooks/usePreloadImages', () => ({
  usePreloadImages: () => true,
}))

const IDLE_ROUTE: UseRouteResult = { status: 'idle', route: null, reason: null, error: null, retry: () => {} }
// What useRoute returns once both points are set; each test sets it. `routeCalls` records
// the (from, to) MapPage asks for.
let routeForTest: UseRouteResult = IDLE_ROUTE
const routeCalls: [string | null, string | null][] = []
vi.mock('../../hooks/useRoute', () => ({
  useRoute: (from: string | null, to: string | null) => {
    routeCalls.push([from, to])
    return from && to ? routeForTest : IDLE_ROUTE
  },
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
    schedulesForTest = SCHEDULES
  })

  it('shows only the selected room timetable, with pin and Google Calendar actions', async () => {
    schedulesForTest = [
      { ...slot('LC3-121', 'MON'), eventCode: 'ROOM-121' },
      { ...slot('LC3-122', 'TUE'), eventCode: 'ROOM-122' },
    ]
    mockViewport(true)
    renderMap('/map?room=LC3-F1-R121&q=ROOM')

    expect(screen.getByTestId('timetable-day')).toBeInTheDocument()
    expect(screen.getByText('ROOM-121')).toBeInTheDocument()
    expect(screen.queryByText('ROOM-122')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'บันทึกในตารางของฉัน' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'เพิ่ม ROOM-121 ลง Google Calendar' })    ).toHaveAttribute(
      'href',
      expect.stringContaining('calendar.google.com/calendar/render'),
    )
    expect(screen.getByRole('textbox')).toHaveValue('ROOM')
  })

  it('filters search results by room category', async () => {
    mockViewport(true)
    const user = userEvent.setup()
    renderMap()

    await user.click(screen.getByRole('button', { name: 'แสดงตัวกรอง' }))
    await user.click(screen.getByRole('button', { name: 'ห้องปฏิบัติการ' }))

    const results = screen.getAllByRole('button', { name: /ดูห้อง/ })
    expect(results.map((button) => within(button).getByText(/^LC3-/).textContent)).toEqual([
      'LC3-201',
    ])
    expect(screen.getByRole('button', { name: 'ห้องปฏิบัติการ' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('on mobile, choosing a result collapses the category filter so the map is visible', async () => {
    mockViewport(false)
    const user = userEvent.setup()
    renderMap()

    await user.click(screen.getByRole('button', { name: 'แสดงตัวกรอง' }))
    await user.click(screen.getByRole('button', { name: 'ห้องปฏิบัติการ' }))
    await user.click(screen.getAllByRole('button', { name: /ดูห้อง/ })[0])

    expect(screen.getByRole('button', { name: 'แสดงตัวกรอง' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ซ่อนตัวกรอง' })).not.toBeInTheDocument()
  })

  it('on desktop, choosing a result keeps the sidebar filter open', async () => {
    mockViewport(true)
    const user = userEvent.setup()
    renderMap()

    await user.click(screen.getByRole('button', { name: 'แสดงตัวกรอง' }))
    await user.click(screen.getByRole('button', { name: 'ห้องปฏิบัติการ' }))
    await user.click(screen.getAllByRole('button', { name: /ดูห้อง/ })[0])

    expect(screen.queryByRole('button', { name: 'แสดงตัวกรอง' })).not.toBeInTheDocument()
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

  it('shows exam dates once and renders announcement fallback only when eventDate is absent', async () => {
    schedulesForTest = [
      {
        ...slot('LC3-103', 'MON'),
        eventCode: 'EXAM-A',
        eventName: 'Exam A',
        eventType: 'exam',
        eventDate: '2026-05-18',
      },
      {
        ...slot('LC3-103', 'MON'),
        eventCode: 'EXAM-B',
        eventName: 'Exam B',
        eventType: 'exam',
      },
    ]
    const user = userEvent.setup()
    renderMap('/map?room=LC3-F1-R103')

    await user.click(screen.getByRole('button', { name: /ตารางสอบ/ }))

    // Dated exam should display date once (not duplicate)
    expect(screen.getByText('วันสอบ: 2026-05-18')).toBeInTheDocument()
    expect(screen.queryAllByText(/2026-05-18/)).toHaveLength(1)

    // Undated exam should display fallback
    expect(screen.getByText('date to be announced')).toBeInTheDocument()
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

        const input = screen.getByRole('textbox')
        await user.type(input, 'CS102')

        const clearBtn = screen.getByRole('button', { name: 'ล้างการค้นหา' })
        await user.click(clearBtn)

        expect(input).toHaveValue('')
        const pinned = document.querySelectorAll('[role="button"][aria-pressed="true"]')
        expect(pinned).toHaveLength(1)
        expect(pinned[0]).toHaveTextContent('105')
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('105')
      })

      it('clicking (X) on the room detail card immediately unpins the room without a secondary pinned banner', async () => {
        const user = userEvent.setup()
        renderMap('/map?room=LC3-F1-R105')

        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('105')
        expect(document.querySelectorAll('[role="button"][aria-pressed="true"]')).toHaveLength(1)

        await user.click(screen.getByRole('button', { name: 'ปิดรายละเอียดห้อง' }))

        expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
        expect(screen.queryByText('ปักหมุดอยู่')).not.toBeInTheDocument()
        expect(document.querySelectorAll('[role="button"][aria-pressed="true"]')).toHaveLength(0)
      })

      it('clicking the same room node on the map unpins it, and clicking another room switches the pin', async () => {
        const user = userEvent.setup()
        renderMap('/map?room=LC3-F1-R105')

        const pinned105 = document.querySelector('[role="button"][aria-pressed="true"]') as HTMLElement
        expect(pinned105).toBeTruthy()
        expect(pinned105).toHaveTextContent('105')

        // Clicking the same room node unpins it
        await user.click(pinned105)
        expect(document.querySelectorAll('[role="button"][aria-pressed="true"]')).toHaveLength(0)
        expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()

        // Clicking another room node pins that room
        const marker121 = Array.from(document.querySelectorAll('svg [role="button"]')).find((el) =>
          el.textContent?.includes('121'),
        ) as HTMLElement
        await user.click(marker121)

        const pinnedAfter = document.querySelectorAll('[role="button"][aria-pressed="true"]')
        expect(pinnedAfter).toHaveLength(1)
        expect(pinnedAfter[0]).toHaveTextContent('121')
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('121')
      })

      it('clicking the map background keeps the room pinned and its detail card open', async () => {
        const user = userEvent.setup()
        renderMap('/map?room=LC3-F1-R105')

        await user.click(screen.getByTestId('map-background'))

        expect(document.querySelectorAll('[role="button"][aria-pressed="true"]')).toHaveLength(1)
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('105')
      })
    })

    it('mobile results panel can be dismissed via close button without losing selected room', async () => {
      mockViewport(false)
      const user = userEvent.setup()
      renderMap('/map?room=LC3-F1-R105')

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

      // The selected room remains pinned and its detail card returns
      const pinned = document.querySelectorAll('[role="button"][aria-pressed="true"]')
      expect(pinned).toHaveLength(1)
      expect(pinned[0]).toHaveTextContent('105')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('105')
    })

    it('mobile results panel can be dismissed via backdrop click without losing selected room', async () => {
      mockViewport(false)
      const user = userEvent.setup()
      renderMap('/map?room=LC3-F1-R105')

      await user.type(screen.getByRole('textbox'), 'CS102')
      const backdrop = screen.getByTestId('mobile-search-backdrop')
      expect(backdrop).toBeInTheDocument()

      await user.click(backdrop)

      expect(screen.queryByTestId('mobile-search-results')).not.toBeInTheDocument()

      const pinned = document.querySelectorAll('[role="button"][aria-pressed="true"]')
      expect(pinned).toHaveLength(1)
      expect(pinned[0]).toHaveTextContent('105')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('105')
    })
  })
})

describe('MapPage layering with My Schedule open (issue #139)', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  function renderMapWithDrawerOpen(path = '/map') {
    return render(
      <PinsContext.Provider value={{ ...defaultContextValue, isDrawerOpen: true }}>
        <MemoryRouter initialEntries={[path]}>
          <MapPage />
        </MemoryRouter>
      </PinsContext.Provider>
    )
  }

  it('on mobile, stacks map chrome < drawer < top bar < modals', async () => {
    mockViewport(false)
    const user = userEvent.setup()
    renderMapWithDrawerOpen('/map?room=LC3-F1-R105')
    const drawerZ = rootZIndex(screen.getByTestId('drawer-backdrop'))
    const topBarZ = rootZIndex(screen.getByTestId('map-top-bar'))

    // The room sheet unmounts once search results open, so check it first.
    const roomSheet = document.querySelector('[data-sheet-handle="true"]')
    expect(roomSheet).not.toBeNull()
    expect(rootZIndex(roomSheet!)).toBeLessThan(drawerZ)

    await user.type(screen.getByRole('textbox'), 'CS102')
    const mapChrome = [
      screen.getByRole('textbox'),
      ...screen.getAllByRole('button', { name: 'รีเซ็ตแผนที่' }),
      screen.getByTestId('mobile-search-results'),
    ]

    for (const el of mapChrome) expect(rootZIndex(el)).toBeLessThan(drawerZ)
    // The search backdrop spans the whole screen but must not swallow taps on the top bar.
    expect(rootZIndex(screen.getByTestId('mobile-search-backdrop'))).toBeLessThan(topBarZ)
    // Header popovers (AccountMenu) open over the drawer, and modals still cover it.
    expect(drawerZ).toBeLessThan(topBarZ)
    expect(drawerZ).toBeLessThan(MODAL_OVERLAY_Z)
  })

  it('on desktop, hides the bottom dock so it cannot draw over the drawer', () => {
    mockViewport(true)
    renderMapWithDrawerOpen()

    expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'แถบควบคุมแผนที่' })).not.toBeInTheDocument()
  })
})

describe('MapPage navigation (issue #145)', () => {
  const FOUND: FoundRoute = {
    found: true,
    distance: 420,
    floors: [1, 2],
    path: [
      { nodeId: 'LC3_Junction_SM', floor: 1, x: 632, y: 484 },
      { nodeId: 'LC3_stair-2', floor: 1, x: 622, y: 270 },
      { nodeId: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228 },
      { nodeId: 'LC3_121', floor: 2, x: 408, y: 531, locationId: 'LC3-F1-R121' },
    ],
    closuresAvoided: [],
  }
  const lastRouteCall = () => routeCalls[routeCalls.length - 1]

  beforeEach(() => {
    routeCalls.length = 0
    routeForTest = { ...IDLE_ROUTE, status: 'found', route: FOUND }
  })
  afterEach(() => {
    window.matchMedia = originalMatchMedia
    routeForTest = IDLE_ROUTE
  })

  async function startNavigation(path = '/map?room=LC3-F1-R121') {
    const user = userEvent.setup()
    renderMap(path)
    await user.click(screen.getByRole('button', { name: 'นำทางมาที่นี่' }))
    return user
  }

  it('asks for nothing until "นำทางมาที่นี่" is pressed', () => {
    mockViewport(true)
    renderMap('/map?room=LC3-F1-R121')
    expect(routeCalls.every(([, to]) => to === null)).toBe(true)
  })

  it('"นำทางมาที่นี่" routes from the building entrance and swaps the search for the navigation panel', async () => {
    mockViewport(true)
    await startNavigation()

    expect(lastRouteCall()).toEqual(['LC3_Junction_SM', 'LC3-F1-R121'])
    const panel = screen.getByRole('region', { name: 'นำทาง' })
    expect(within(panel).getByRole('textbox', { name: 'จุดเริ่มต้น' })).toHaveValue('ทางเข้าอาคาร')
    expect(within(panel).getByText('ห้อง 121')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'ค้นหาห้อง' })).not.toBeInTheDocument()
  })

  it('starts navigation from a destination supplied by the public search link', () => {
    mockViewport(true)
    renderMap('/map?q=BAS350&navigate=LC3-F1-R103')

    expect(lastRouteCall()).toEqual(['LC3_Junction_SM', 'LC3-F1-R103'])
    expect(screen.getByRole('region', { name: 'นำทาง' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'ค้นหาห้อง' })).not.toBeInTheDocument()
  })

  it('lists the floor legs with the stairs step, and a leg switches the map floor', async () => {
    mockViewport(true)
    const user = await startNavigation()

    const steps = within(screen.getByRole('list', { name: 'ขั้นตอนเส้นทาง' })).getAllByRole('button')
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('เดินจากทางเข้าอาคาร ไปที่บันได'),
      expect.stringContaining('เดินต่อไปยังห้อง 121'),
    ])
    expect(within(screen.getByRole('region', { name: 'นำทาง' })).getByText('ขึ้นบันไดไปชั้น 2')).toBeInTheDocument()
    expect(steps[0]).toHaveAttribute('aria-pressed', 'true')

    await user.click(steps[1])
    expect(steps[1]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '2nd Floor' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says when the route goes around a closure', async () => {
    mockViewport(true)
    routeForTest = {
      ...routeForTest,
      route: { ...FOUND, closuresAvoided: [{ elementId: 'EDGE#A|B', reason: 'ปิดซ่อมทางเดิน' }] },
    }
    await startNavigation()
    expect(screen.getByText('เส้นทางนี้เลี่ยงจุดที่ปิดชั่วคราว')).toBeInTheDocument()
    expect(screen.getByText('ปิดซ่อมทางเดิน')).toBeInTheDocument()
  })

  it.each([
    ['NO_PATH', 'ไม่มีทางเดินไปยังปลายทางในขณะนี้'],
    ['DESTINATION_CLOSED', 'ปลายทางปิดชั่วคราว'],
    ['ORIGIN_CLOSED', 'จุดเริ่มต้นปิดชั่วคราว'],
    ['UNKNOWN_LOCATION', 'ไม่พบสถานที่นี้ในข้อมูลเส้นทาง'],
  ] as const)('explains %s instead of showing an empty map', async (reason, message) => {
    mockViewport(true)
    routeForTest = { ...IDLE_ROUTE, status: 'not-found', reason }
    await startNavigation()
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })

  it('shows a request error with a retry button', async () => {
    mockViewport(true)
    const retry = vi.fn()
    routeForTest = { ...IDLE_ROUTE, status: 'error', error: new Error('คำนวณเส้นทางไม่สำเร็จ (500)'), retry }
    const user = await startNavigation()
    expect(screen.getByRole('alert')).toHaveTextContent('คำนวณเส้นทางไม่สำเร็จ (500)')
    await user.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('picks another start with the room search', async () => {
    mockViewport(true)
    const user = await startNavigation()

    await user.click(screen.getByRole('textbox', { name: 'จุดเริ่มต้น' }))
    await user.type(screen.getByRole('textbox', { name: 'จุดเริ่มต้น' }), '105')
    const options = within(screen.getByRole('list', { name: 'ตัวเลือกจุดเริ่มต้น' })).getAllByRole('button')
    // The entrance is always offered; the destination itself never is.
    expect(options[0]).toHaveTextContent('ทางเข้าอาคาร')
    expect(options.some((option) => option.textContent?.includes('ห้อง 121'))).toBe(false)

    await user.click(options.find((option) => option.textContent?.includes('ห้อง 105'))!)
    expect(lastRouteCall()).toEqual(['LC3-F1-R105', 'LC3-F1-R121'])
    expect(screen.getByRole('textbox', { name: 'จุดเริ่มต้น' })).toHaveValue('ห้อง 105')
    expect(screen.queryByRole('list', { name: 'ตัวเลือกจุดเริ่มต้น' })).not.toBeInTheDocument()
  })

  it('tapping a room on the map while navigating makes it the destination', async () => {
    mockViewport(true)
    const user = await startNavigation()
    // jsdom has no WebGL, so the map is the 2D fallback; R105 sits at (318, 148).
    const room105 = screen
      .getAllByRole('button', { name: 'ห้องบรรยายเรียนรวม' })
      .find((marker) => marker.getAttribute('transform')?.startsWith('translate(318, 148)'))
    await user.click(room105!)
    expect(lastRouteCall()?.[1]).toBe('LC3-F1-R105')
  })

  it('"ล้างเส้นทาง" stops navigating and returns to the room details', async () => {
    mockViewport(true)
    const user = await startNavigation()
    await user.click(screen.getByRole('button', { name: 'ล้างเส้นทาง' }))

    expect(screen.queryByRole('region', { name: 'นำทาง' })).not.toBeInTheDocument()
    expect(lastRouteCall()).toEqual([null, null])
    expect(screen.getByRole('button', { name: 'นำทางมาที่นี่' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'ค้นหาห้อง' })).toBeInTheDocument()
  })

  it('on mobile, the navigation card replaces the search panel and room sheet, below the top bar', async () => {
    mockViewport(false)
    await startNavigation()

    const card = screen.getByTestId('mobile-navigation')
    expect(within(card).getByRole('region', { name: 'นำทาง' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'ค้นหาห้อง' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-sheet-handle="true"]')).toBeNull()
    expect(effectivePointerEvents(card)).toBe('auto')
    expect(rootZIndex(card)).toBeLessThan(rootZIndex(screen.getByTestId('map-top-bar')))
  })
})

describe('MapPage room closures (issue #147)', () => {
  const HOUR = 60 * 60 * 1000
  const roomNode = (locationId: string, closure: Partial<Graph['nodes'][number]>) => ({
    elementId: `NODE#${locationId}`,
    nodeId: locationId,
    floor: 1,
    x: 0,
    y: 0,
    nodeType: 'room',
    locationId,
    closed: false,
    ...closure,
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    graphState.graph = null
    graphState.error = null
    graphState.reload.mockClear()
    vi.useRealTimers()
  })

  it('says the closure status is unavailable when the graph fails to load, and retries', async () => {
    graphState.error = new Error('network')
    mockViewport(true)
    const user = userEvent.setup()
    renderMap('/map?room=LC3-F1-R121')

    expect(screen.getByText('ตรวจสอบสถานะปิดชั่วคราวไม่ได้ในขณะนี้')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }))
    expect(graphState.reload).toHaveBeenCalledTimes(1)
  })

  it('shows no unavailable notice once closures have loaded', () => {
    graphState.graph = { graphId: 'LC3', nodes: [], edges: [] }
    mockViewport(true)
    renderMap('/map?room=LC3-F1-R121')
    expect(screen.queryByText('ตรวจสอบสถานะปิดชั่วคราวไม่ได้ในขณะนี้')).not.toBeInTheDocument()
  })

  it('refetches closures every minute so changes made by staff show without a reload', () => {
    vi.useFakeTimers()
    mockViewport(true)
    renderMap()
    expect(graphState.reload).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(graphState.reload).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(graphState.reload).toHaveBeenCalledTimes(2)
  })

  it('shows "ปิดชั่วคราว" with the window and reason in the room panel while the room is closed', () => {
    graphState.graph = {
      graphId: 'LC3',
      nodes: [
        roomNode('LC3-F1-R121', {
          closed: true,
          closedFrom: new Date(Date.now() - HOUR).toISOString(),
          closedUntil: new Date(Date.now() + HOUR).toISOString(),
          closedReason: 'ซ่อมเครื่องปรับอากาศ',
        }),
      ],
      edges: [],
    }
    mockViewport(true)
    renderMap('/map?room=LC3-F1-R121')

    const notice = screen.getByText('ปิดชั่วคราว', { selector: 'p' }).closest('[role="status"]')
    expect(notice).not.toBeNull()
    expect(notice).toHaveTextContent(/ช่วงเวลา: .+ – .+/)
    expect(notice).toHaveTextContent('เหตุผล: ซ่อมเครื่องปรับอากาศ')
  })

  it('shows no notice for an open room, or for a closure that has not started yet', () => {
    graphState.graph = {
      graphId: 'LC3',
      nodes: [
        roomNode('LC3-F1-R121', { closed: true, closedFrom: new Date(Date.now() + HOUR).toISOString() }),
      ],
      edges: [],
    }
    mockViewport(true)
    renderMap('/map?room=LC3-F1-R121')

    expect(screen.queryByText('ปิดชั่วคราว')).not.toBeInTheDocument()
  })
})
