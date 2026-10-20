import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PlaceholdersAndVanishInput } from '../PlaceholdersAndVanishInput'

describe('PlaceholdersAndVanishInput', () => {
  const placeholders = [
    'พิมพ์เลขห้อง เช่น LC3-101',
    'ค้นหาห้องบรรยาย เช่น บรรยาย 1',
    'ค้นหาห้องน้ำชาย / หญิง',
  ]

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders input, search icon and submit button without a decorative aura', () => {
    const { container } = render(
      <PlaceholdersAndVanishInput
        placeholders={placeholders}
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    // Input element
    const input = screen.getByRole('textbox', { name: /ค้นหา/i })
    expect(input).toBeInTheDocument()

    // Submit button
    const submitBtn = screen.getByRole('button', { name: /ค้นหา/i })
    expect(submitBtn).toBeInTheDocument()

    // No decorative aura or gradient: the field is a flat grey box (DesignMD search input)
    expect(container.querySelector('.animate-cloud-aura')).toBeNull()
    expect(container.querySelector('[class*="bg-gradient"]')).toBeNull()

    // Search icon turns to the accent colour on focus
    const searchIcon = container.querySelector('svg.group-focus-within\\:text-accent')
    expect(searchIcon).toBeInTheDocument()

    // No animated border wrapper
    const borderWrapper = container.querySelector('[class*="animate-border-fast"]')
    expect(borderWrapper).toBeNull()

    // Initial placeholder
    expect(screen.getByText('พิมพ์เลขห้อง เช่น LC3-101')).toBeInTheDocument()
  })

  it('cycles through placeholder prompts over time', () => {
    render(
      <PlaceholdersAndVanishInput
        placeholders={placeholders}
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholderInterval={3000}
      />,
    )

    expect(screen.getByText('พิมพ์เลขห้อง เช่น LC3-101')).toBeInTheDocument()

    // Advance to next placeholder
    act(() => {
      vi.advanceTimersByTime(3300)
    })
    expect(screen.getByText('ค้นหาห้องบรรยาย เช่น บรรยาย 1')).toBeInTheDocument()

    // Advance to third placeholder
    act(() => {
      vi.advanceTimersByTime(3300)
    })
    expect(screen.getByText('ค้นหาห้องน้ำชาย / หญิง')).toBeInTheDocument()
  })

  it('calls onChange when user types into the input', () => {
    const handleChange = vi.fn()
    render(
      <PlaceholdersAndVanishInput
        placeholders={placeholders}
        value=""
        onChange={handleChange}
        onSubmit={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox', { name: /ค้นหา/i })
    fireEvent.change(input, { target: { value: '101' } })
    expect(handleChange).toHaveBeenCalled()
  })

  it('renders clear button when value is present and calls onClear on click', () => {
    const handleClear = vi.fn()
    render(
      <PlaceholdersAndVanishInput
        placeholders={placeholders}
        value="LC3-101"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onClear={handleClear}
      />,
    )

    const clearBtn = screen.getByRole('button', { name: /ล้างข้อความ/i })
    expect(clearBtn).toBeInTheDocument()

    fireEvent.click(clearBtn)
    expect(handleClear).toHaveBeenCalledTimes(1)
  })

  it('submits form on submit button click and handles keyboard Enter', () => {
    const handleSubmit = vi.fn()
    render(
      <PlaceholdersAndVanishInput
        placeholders={placeholders}
        value="101"
        onChange={vi.fn()}
        onSubmit={handleSubmit}
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /ค้นหา/i })
    fireEvent.click(submitBtn)
    expect(handleSubmit).toHaveBeenCalled()
  })
})

