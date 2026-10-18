import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MapContainer from '../MapContainer'
import type { MapContainerProps } from '../MapContainer'

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
