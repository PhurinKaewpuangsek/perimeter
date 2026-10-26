import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MapContainer from '../MapContainer2D'
import type { Room } from '../../../types/room'
import type { FoundRoute } from '../../../types/route'

const rooms: Room[] = [
  {
    id: 'LC3-F1-R101',
    code: 'LC3-101',
    nameThai: 'ห้อง 101',
    building: 'LC3',
    floor: 1,
    roomNumber: '101',
    category: 'lecture_room',
    coordinates: { x: 100, y: 200 },
    landmarks: [],
    aliases: [],
  },
  {
    id: 'LC3-F2-R201',
    code: 'LC3-201',
    nameThai: 'ห้อง 201',
    building: 'LC3',
    floor: 2,
    roomNumber: '201',
    category: 'lecture_room',
    coordinates: { x: 300, y: 400 },
    landmarks: [],
    aliases: [],
  },
]

describe('MapContainer2D fallback', () => {
  it('renders floor switcher buttons and marks the current floor as pressed', () => {
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId={null}
        onSelectRoom={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '1st Floor' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: '2nd Floor' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('calls onFloorChange with the target floor when a floor button is clicked', async () => {
    const user = userEvent.setup()
    const onFloorChange = vi.fn()

    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={onFloorChange}
        selectedRoomId={null}
        onSelectRoom={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '2nd Floor' }))

    expect(onFloorChange).toHaveBeenCalledTimes(1)
    expect(onFloorChange).toHaveBeenCalledWith(2)
  })

  it('only shows markers belonging to the currently selected floor', () => {
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={2}
        onFloorChange={vi.fn()}
        selectedRoomId={null}
        onSelectRoom={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'ห้อง 201' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ห้อง 101' })).not.toBeInTheDocument()
  })

  it('propagates marker clicks to onSelectRoom with the correct roomId', async () => {
    const user = userEvent.setup()
    const onSelectRoom = vi.fn()

    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId={null}
        onSelectRoom={onSelectRoom}
      />
    )

    await user.click(screen.getByRole('button', { name: 'ห้อง 101' }))

    expect(onSelectRoom).toHaveBeenCalledWith('LC3-F1-R101')
  })

  it('renders selected marker with aria-pressed="true" when selectedRoomId matches', () => {
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId="LC3-F1-R101"
        onSelectRoom={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'ห้อง 101' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('renders re-center button and allows clicking to reset map position', async () => {
    const user = userEvent.setup()
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId={null}
        onSelectRoom={vi.fn()}
      />
    )

    const recenterButton = screen.getByRole('button', { name: /จัดกึ่งกลางแผนที่/i })
    expect(recenterButton).toBeInTheDocument()

    await user.click(recenterButton)
  })

  it('renders zoom in and zoom out buttons and handles clicks', async () => {
    const user = userEvent.setup()
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId={null}
        onSelectRoom={vi.fn()}
      />
    )

    const zoomInButton = screen.getByRole('button', { name: /ขยายแผนที่/i })
    const zoomOutButton = screen.getByRole('button', { name: /ย่อแผนที่/i })

    expect(zoomInButton).toBeInTheDocument()
    expect(zoomOutButton).toBeInTheDocument()

    await user.click(zoomInButton)
    await user.click(zoomOutButton)
  })

  it('calls onClearSelection when clicking empty map background area', async () => {
    const user = userEvent.setup()
    const onClearSelection = vi.fn()

    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId="BR3-F1-R101"
        onSelectRoom={vi.fn()}
        onClearSelection={onClearSelection}
      />
    )

    const mapBackground = screen.getByTestId('map-background')
    await user.click(mapBackground)

    expect(onClearSelection).toHaveBeenCalledTimes(1)
  })

  it('positions floating controls at standard bottom when room is pinned but detail sheet is closed', () => {
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId="LC3-F1-R101"
        isDetailOpen={false}
        onSelectRoom={vi.fn()}
      />
    )

    const floorSwitcher = screen.getByRole('group', { name: 'Floor switcher' })
    const zoomControls = screen.getByRole('group', { name: 'Zoom controls' })
    const recenterBtn = screen.getByRole('button', { name: /จัดกึ่งกลางแผนที่/i })

    expect(floorSwitcher.className).toContain('bottom-5')
    expect(floorSwitcher.className).not.toContain('bottom-[calc(55dvh+1rem)]')
    expect(zoomControls.closest('.map2d > div')?.className).toContain('bottom-20')
    expect(zoomControls.closest('.map2d > div')?.className).not.toContain('bottom-[calc(55dvh+5rem)]')
    expect(recenterBtn.closest('.map2d > div')?.className).toContain('bottom-20')
  })

  it('offsets floating controls upwards when room is pinned and detail sheet is open', () => {
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId="LC3-F1-R101"
        isDetailOpen={true}
        onSelectRoom={vi.fn()}
      />
    )

    const floorSwitcher = screen.getByRole('group', { name: 'Floor switcher' })
    const zoomControls = screen.getByRole('group', { name: 'Zoom controls' })
    const recenterBtn = screen.getByRole('button', { name: /จัดกึ่งกลางแผนที่/i })

    expect(floorSwitcher.className).toContain('bottom-[calc(55dvh+1rem)]')
    expect(zoomControls.closest('.map2d > div')?.className).toContain('bottom-[calc(55dvh+5rem)]')
    expect(recenterBtn.closest('.map2d > div')?.className).toContain('bottom-[calc(55dvh+5rem)]')
  })
})

describe('MapContainer2D route (#145)', () => {
  // Entrance on floor 1 → stairs → room 201 on floor 2.
  const route: FoundRoute = {
    found: true,
    distance: 400,
    floors: [1, 2],
    path: [
      { nodeId: 'LC3_Junction_SM', floor: 1, x: 632, y: 484 },
      { nodeId: 'LC3_Junction_MStair', floor: 1, x: 620, y: 300 },
      { nodeId: 'LC3_stair-2', floor: 1, x: 622, y: 270 },
      { nodeId: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228 },
      { nodeId: 'LC3_F2_201', floor: 2, x: 300, y: 400, locationId: 'LC3-F2-R201' },
    ],
    closuresAvoided: [],
  }

  function renderRoute(currentFloor: number, onFloorChange = vi.fn()) {
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={currentFloor}
        onFloorChange={onFloorChange}
        selectedRoomId="LC3-F2-R201"
        onSelectRoom={vi.fn()}
        route={route}
      />
    )
    return onFloorChange
  }

  it('draws only the part on the shown floor, with the start marker and a stairs button', async () => {
    const user = userEvent.setup()
    const onFloorChange = renderRoute(1)

    const lines = screen.getAllByTestId('route-line')
    expect(lines).toHaveLength(1)
    expect(lines[0].querySelector('polyline')?.getAttribute('points')).toBe('632,484 620,300 622,270')
    expect(screen.getByTestId('route-start')).toBeInTheDocument()
    expect(screen.queryByTestId('route-end')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ขึ้นบันไดไปชั้น 2' }))
    expect(onFloorChange).toHaveBeenCalledWith(2)
  })

  it('shows the end marker on the destination floor and no stairs button there', () => {
    renderRoute(2)

    expect(screen.getAllByTestId('route-line')[0].querySelector('polyline')?.getAttribute('points')).toBe(
      '529,228 300,400'
    )
    expect(screen.getByTestId('route-end')).toBeInTheDocument()
    expect(screen.queryByTestId('route-start')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /บันไดไปชั้น/ })).not.toBeInTheDocument()
  })

  it('draws the line in once, then keeps it at a fixed screen width', () => {
    renderRoute(2)
    const line = () => screen.getAllByTestId('route-line')[0].querySelectorAll('polyline')[1]

    expect(line()).toHaveClass('animate-route-draw')
    expect(line()).toHaveAttribute('pathLength', '1')
    expect(screen.getByTestId('route-end')).toHaveClass('animate-route-reveal')

    // jsdom has no AnimationEvent, so React listens for the prefixed name there.
    fireEvent.animationEnd(line())
    fireEvent(line(), new Event('webkitAnimationEnd', { bubbles: true }))
    expect(line()).not.toHaveClass('animate-route-draw')
    expect(line()).toHaveAttribute('vector-effect', 'non-scaling-stroke')
    expect(screen.getByTestId('route-end')).not.toHaveClass('animate-route-reveal')
  })

  it('shows the whole line at once when motion is reduced', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener() {},
      removeEventListener() {},
    }))
    try {
      renderRoute(1)
      const line = screen.getAllByTestId('route-line')[0].querySelectorAll('polyline')[1]
      expect(line).not.toHaveClass('animate-route-draw')
      expect(line).toHaveAttribute('vector-effect', 'non-scaling-stroke')
      expect(screen.getByRole('button', { name: 'ขึ้นบันไดไปชั้น 2' })).not.toHaveClass('animate-route-reveal')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('draws nothing without a route', () => {
    render(
      <MapContainer rooms={rooms} currentFloor={1} onFloorChange={vi.fn()} selectedRoomId={null} onSelectRoom={vi.fn()} />
    )
    expect(screen.queryByTestId('route-overlay')).not.toBeInTheDocument()
  })
})

describe('MapContainer2D overlay segments (#147)', () => {
  const segments = [
    { id: 'EDGE#A|B', floor: 1, x1: 10, y1: 20, x2: 30, y2: 40, tone: 'selected' as const },
    { id: 'EDGE#C|D', floor: 1, x1: 50, y1: 60, x2: 70, y2: 80, tone: 'closed' as const },
    { id: 'EDGE#S1|S2', floor: 1, x1: 90, y1: 90, x2: 90, y2: 90, tone: 'closed' as const },
    { id: 'EDGE#E|F', floor: 2, x1: 1, y1: 1, x2: 2, y2: 2, tone: 'closed' as const },
  ]

  it('draws only the current floor: lines for walkways, a dot for a stairwell', () => {
    render(
      <MapContainer
        rooms={rooms}
        currentFloor={1}
        onFloorChange={vi.fn()}
        selectedRoomId={null}
        onSelectRoom={vi.fn()}
        overlaySegments={segments}
      />
    )
    const svg = screen.getByTestId('map-overlay-segments')
    expect(svg.querySelectorAll('line')).toHaveLength(2)
    expect(svg.querySelectorAll('circle')).toHaveLength(1)
    expect(svg.querySelector('line[data-tone="closed"]')?.getAttribute('stroke-dasharray')).toBe('6 4')
    expect(svg.querySelector('line[data-tone="selected"]')?.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('draws nothing without segments', () => {
    render(
      <MapContainer rooms={rooms} currentFloor={1} onFloorChange={vi.fn()} selectedRoomId={null} onSelectRoom={vi.fn()} />
    )
    expect(screen.queryByTestId('map-overlay-segments')).not.toBeInTheDocument()
  })
})
