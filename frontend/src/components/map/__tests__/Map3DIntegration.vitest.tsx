import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MapContainer from '../MapContainer'
import type { MapContainerProps } from '../MapContainer'
import type { FoundRoute } from '../../../types/route'

const mock = vi.hoisted(() => ({
  update: vi.fn(),
  reset: vi.fn(),
  zoom: vi.fn(),
  dispose: vi.fn(),
  unavailable: () => {},
}))
vi.mock('../createMapScene', () => ({
  createMapScene: (_host: unknown, fail: () => void) => {
    mock.unavailable = fail
    return {
      ready: Promise.resolve(),
      update: mock.update,
      reset: mock.reset,
      zoom: mock.zoom,
      dispose: mock.dispose,
    }
  },
}))
const props: MapContainerProps = {
  rooms: [
    {
      id: 'LC3-F2-R201',
      code: 'LC3-201',
      nameThai: 'ห้อง 201',
      floor: 2,
      building: 'LC3',
      roomNumber: '201',
      category: 'lecture_room',
      coordinates: { x: 424, y: 280 },
      landmarks: [],
      aliases: [],
    },
  ],
  currentFloor: 2,
  selectedRoomId: 'LC3-F2-R201',
  onFloorChange: vi.fn(),
  onSelectRoom: vi.fn(),
  mode: 'admin',
}
beforeEach(() => {
  vi.clearAllMocks()
})
describe('3D map integration', () => {
  it('passes selected room, active floor and admin callbacks to the loaded model', async () => {
    render(<MapContainer {...props} />)
    await waitFor(() =>
      expect(mock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          currentFloor: 2,
          selectedRoomId: props.selectedRoomId,
          mode: 'admin',
        }),
      ),
    )
    // The scene copies each room's 2D category icon into its 3D marker.
    const icons: HTMLElement = mock.update.mock.lastCall![0].icons
    expect(icons.querySelector('[data-room-id="LC3-F2-R201"] svg')).not.toBeNull()
    mock.update.mock.lastCall![0].onSelectRoom('LC3-F2-R201')
    expect(props.onSelectRoom).toHaveBeenCalledWith('LC3-F2-R201')
    await userEvent.click(screen.getByRole('button', { name: '1st Floor' }))
    expect(props.onFloorChange).toHaveBeenCalledWith(1)
  })
  it('passes the rooms closed right now to the 3D markers (#147)', async () => {
    const closed = new Set(['LC3-F2-R201'])
    render(<MapContainer {...props} closedRoomIds={closed} />)
    await waitFor(() =>
      expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ closedRoomIds: closed })),
    )
  })
  it('updates the loaded scene when search switches floors', async () => {
    const { rerender } = render(<MapContainer {...props} currentFloor={1} selectedRoomId={null} />)
    await waitFor(() => expect(mock.update).toHaveBeenCalled())
    rerender(<MapContainer {...props} />)
    await waitFor(() =>
      expect(mock.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ currentFloor: 2, selectedRoomId: props.selectedRoomId }),
      ),
    )
  })
  it('falls back to selectable 2D rooms after model/context failure, preserving selection', async () => {
    render(<MapContainer {...props} />)
    await waitFor(() => expect(mock.update).toHaveBeenCalled())
    act(() => mock.unavailable())
    expect(await screen.findByText(/เปิดแผนที่ 3D ไม่สำเร็จ/)).toBeInTheDocument()
    const room = screen.getByRole('button', { name: 'ห้อง 201' })
    expect(room).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(room)
    expect(props.onSelectRoom).toHaveBeenCalledWith('LC3-F2-R201')
    expect(mock.dispose).toHaveBeenCalled()
    // 2D is already showing, so the toggle offers 3D and one tap retries it.
    await userEvent.click(screen.getByRole('button', { name: 'แผนที่ 3D' }))
    expect(await screen.findByRole('region', { name: /แบบ 3D/ })).toBeInTheDocument()
  })
  it('hands the route to the scene and lets its stairs label switch floors', async () => {
    const route: FoundRoute = {
      found: true,
      distance: 300,
      floors: [1, 2],
      path: [
        { nodeId: 'LC3_Junction_SM', floor: 1, x: 632, y: 484 },
        { nodeId: 'LC3_stair-2', floor: 1, x: 622, y: 270 },
        { nodeId: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228 },
        { nodeId: 'LC3_F2_201', floor: 2, x: 424, y: 280 },
      ],
      closuresAvoided: [],
    }
    const { rerender } = render(<MapContainer {...props} currentFloor={1} route={route} />)
    await waitFor(() =>
      expect(mock.update).toHaveBeenLastCalledWith(expect.objectContaining({ currentFloor: 1, route })),
    )
    mock.update.mock.lastCall![0].onFloorChange(2)
    expect(props.onFloorChange).toHaveBeenCalledWith(2)

    // Clearing the route tells the scene to drop its geometry.
    rerender(<MapContainer {...props} currentFloor={1} route={null} />)
    await waitFor(() =>
      expect(mock.update).toHaveBeenLastCalledWith(expect.objectContaining({ route: null })),
    )
  })
  it('allows manual 2D fallback and releases the WebGL scene', async () => {
    render(<MapContainer {...props} />)
    await waitFor(() => expect(mock.update).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: 'แผนที่ 2D' }))
    expect(screen.getByRole('button', { name: 'ห้อง 201' })).toBeInTheDocument()
    expect(mock.dispose).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'แผนที่ 3D' }))
    expect(await screen.findByRole('region', { name: /แบบ 3D/ })).toBeInTheDocument()
  })
})
