import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MapLegend from '../MapLegend'
import { getFloorConfig } from '../floorConfig'

/** jsdom has no matchMedia; MapLegend falls back to open, which is what these assert. */
describe('MapLegend', () => {
  it('shows category colors across floors', () => {
    for (const floor of [1, 2]) {
      const { unmount } = render(<MapLegend entries={getFloorConfig(floor).legend} />)
      expect(screen.getByText('ห้องพักอาจารย์ / สำนักงาน')).toBeInTheDocument()
      expect(screen.getByTestId('legend-swatch-#FEF3C7')).toHaveStyle({ backgroundColor: '#FEF3C7' })
      unmount()
    }
  })

  it('lists only the colours a floor uses — floor 2 has meeting room, floor 1 has research room', () => {
    render(<MapLegend entries={getFloorConfig(2).legend} />)

    expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(6)
    expect(screen.getByText('ห้องประชุม')).toBeInTheDocument()
    expect(screen.queryByText('ห้องวิจัย')).not.toBeInTheDocument()
  })

  it('collapses and expands when the header is clicked', async () => {
    const user = userEvent.setup()
    render(<MapLegend entries={getFloorConfig(1).legend} />)

    const toggle = screen.getByRole('button', { name: /ประเภทพื้นที่/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('list', { hidden: true })).toHaveAttribute('hidden')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('list')).not.toHaveAttribute('hidden')
  })
})
