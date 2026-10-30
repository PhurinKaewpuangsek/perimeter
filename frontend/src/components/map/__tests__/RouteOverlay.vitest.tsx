import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RouteOverlay from '../RouteOverlay'
import { getFloorConfig } from '../floorConfig'
import type { FoundRoute } from '../../../types/route'

describe('RouteOverlay', () => {
  const multiFloorRoute: FoundRoute = {
    found: true,
    distance: 250,
    floors: [1, 2],
    path: [
      { nodeId: 'LC3_Junction_QR1-1', floor: 1, x: 632, y: 434 },
      { nodeId: 'LC3_Junction_MidBridge', floor: 1, x: 631, y: 291 },
      { nodeId: 'LC3_Junction_MStair', floor: 1, x: 622, y: 291 },
      { nodeId: 'LC3_stair-2', floor: 1, x: 622, y: 270 },
      { nodeId: 'LC3_F2_stair-2', floor: 2, x: 529, y: 228 },
      { nodeId: 'LC3_F2_hallway-5', floor: 2, x: 529, y: 198 },
      { nodeId: 'LC3_F2_203', floor: 2, x: 419, y: 168 },
    ],
    closuresAvoided: [],
  }

  it('renders forward floor transition button at the stairs on floor 1', async () => {
    const user = userEvent.setup()
    const onFloorChange = vi.fn()

    render(
      <RouteOverlay
        route={multiFloorRoute}
        currentFloor={1}
        floorConfig={getFloorConfig(1)}
        onFloorChange={onFloorChange}
      />,
    )

    const button = screen.getByRole('button', { name: /ขึ้นบันไดไปชั้น 2/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveStyle({ left: '622px', top: '270px' })

    await user.click(button)
    expect(onFloorChange).toHaveBeenCalledWith(2)
  })

  it('renders backward return floor transition button on floor 2 to switch down to floor 1', async () => {
    const user = userEvent.setup()
    const onFloorChange = vi.fn()

    render(
      <RouteOverlay
        route={multiFloorRoute}
        currentFloor={2}
        floorConfig={getFloorConfig(2)}
        onFloorChange={onFloorChange}
      />,
    )

    const returnButton = screen.getByRole('button', { name: /ลงบันไดไปชั้น 1/i })
    expect(returnButton).toBeInTheDocument()
    expect(returnButton).toHaveStyle({ left: '521px', top: '228px' })

    await user.click(returnButton)
    expect(onFloorChange).toHaveBeenCalledWith(1)
  })
})

