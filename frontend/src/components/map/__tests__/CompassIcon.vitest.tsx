import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import CompassIcon from '../CompassIcon'

describe('CompassIcon', () => {
  it('renders Google Maps street view compass widget with default -41.4 deg heading', () => {
    const { container } = render(<CompassIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()

    // Outer and inner circles
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2)
    expect(circles[0]).toHaveAttribute('fill', '#202124')
    expect(circles[1]).toHaveAttribute('fill', '#35373a')

    // Rotation arrows (2 paths + 2 arrowhead polygons)
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBe(2)

    // Center needle group rotates with heading
    const needleGroup = container.querySelector('g')
    expect(needleGroup).toBeInTheDocument()
    expect(needleGroup).toHaveStyle({ transform: 'rotate(-41.4deg)' })

    // Total 6 polygons (2 arrowheads + 4 needle facets)
    const polygons = container.querySelectorAll('polygon')
    expect(polygons.length).toBe(6)

    // North pointer facets (Red)
    expect(polygons[2]).toHaveAttribute('fill', '#ea4335')
    expect(polygons[3]).toHaveAttribute('fill', '#d93025')
    // South pointer facets (White / Silver)
    expect(polygons[4]).toHaveAttribute('fill', '#ffffff')
    expect(polygons[5]).toHaveAttribute('fill', '#dadce0')
  })

  it('applies custom heading and custom size', () => {
    const { container } = render(<CompassIcon heading={90} size={28} className="custom-compass" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '28')
    expect(svg).toHaveAttribute('height', '28')
    expect(svg).toHaveClass('custom-compass')
    const needleGroup = container.querySelector('g')
    expect(needleGroup).toHaveStyle({ transform: 'rotate(90deg)' })
  })
})
