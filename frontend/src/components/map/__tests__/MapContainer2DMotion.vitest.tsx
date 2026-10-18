import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const wrapperProps = vi.hoisted(() => ({ last: {} as Record<string, unknown> }))
// Wrap the real TransformWrapper so its props can be read; markers still need its context.
vi.mock('react-zoom-pan-pinch', async (importOriginal) => {
  const lib = await importOriginal<typeof import('react-zoom-pan-pinch')>()
  return {
    ...lib,
    TransformWrapper: (props: Parameters<typeof lib.TransformWrapper>[0]) => {
      wrapperProps.last = props as Record<string, unknown>
      return <lib.TransformWrapper {...props} />
    },
  }
})

import MapContainer2D from '../MapContainer2D'

const originalMatchMedia = window.matchMedia
function prefersReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

function renderMap() {
  render(
    <MapContainer2D
      rooms={[]}
      currentFloor={1}
      onFloorChange={vi.fn()}
      selectedRoomId={null}
      onSelectRoom={vi.fn()}
    />,
  )
  return wrapperProps.last as {
    zoomAnimation: { animationTime: number }
    autoAlignment: { animationTime: number; velocityAlignmentTime: number }
    doubleClick: { animationTime: number }
    velocityAnimation: { disabled: boolean }
  }
}

describe('MapContainer2D motion', () => {
  it('animates pan and zoom by default', () => {
    prefersReducedMotion(false)
    const props = renderMap()
    expect(props.zoomAnimation.animationTime).toBe(200)
    expect(props.doubleClick.animationTime).toBe(650)
    expect(props.velocityAnimation.disabled).toBe(false)
  })

  it('jumps instantly when the user prefers reduced motion', () => {
    prefersReducedMotion(true)
    const props = renderMap()
    expect(props.zoomAnimation.animationTime).toBe(0)
    expect(props.autoAlignment).toMatchObject({ animationTime: 0, velocityAlignmentTime: 0 })
    expect(props.doubleClick.animationTime).toBe(0)
    expect(props.velocityAnimation.disabled).toBe(true)
  })
})
