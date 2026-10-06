import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MapContainer from '../MapContainer'
import type { Room } from '../../../types/room'

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

describe('MapContainer', () => {
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

    expect(floorSwitcher.className).toContain('bottom-6')
    expect(floorSwitcher.className).not.toContain('bottom-[calc(55dvh+1rem)]')
    expect(zoomControls.className).toContain('bottom-20')
    expect(zoomControls.className).not.toContain('bottom-[calc(55dvh+4.5rem)]')
    expect(recenterBtn.className).toContain('bottom-[11.25rem]')
    expect(recenterBtn.className).not.toContain('bottom-[calc(55dvh+10.75rem)]')
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
    expect(zoomControls.className).toContain('bottom-[calc(55dvh+4.5rem)]')
    expect(recenterBtn.className).toContain('bottom-[calc(55dvh+10.75rem)]')
  })
})

