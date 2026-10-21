import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MagnifyingGlass, ArrowRight, X } from '@phosphor-icons/react'

export interface PlaceholdersAndVanishInputProps {
  placeholders: string[]
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onFocus?: () => void
  onClear?: () => void
  placeholderInterval?: number
  className?: string
  ariaLabel?: string
}

/**
 * PlaceholdersAndVanishInput — the landing-page search field.
 *
 * DesignMD "Text Input (Search/Secondary)": grey box, square corners, blue border on
 * focus, with a black circular submit button. Placeholder prompts cycle with a short
 * slide; submission is instant.
 */
export function PlaceholdersAndVanishInput({
  placeholders,
  value,
  onChange,
  onSubmit,
  onFocus,
  onClear,
  placeholderInterval = 3000,
  className = '',
  ariaLabel = 'ค้นหาห้องหรือสถานที่',
}: PlaceholdersAndVanishInputProps) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0)
  const [placeholderFade, setPlaceholderFade] = useState(true)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Rotate placeholder text smoothly
  const startPlaceholderTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!placeholders || placeholders.length === 0) return

    intervalRef.current = setInterval(() => {
      setPlaceholderFade(false)
      setTimeout(() => {
        setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length)
        setPlaceholderFade(true)
      }, 220)
    }, placeholderInterval)
  }, [placeholders, placeholderInterval])

  useEffect(() => {
    startPlaceholderTimer()

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      } else if (document.visibilityState === 'visible') {
        startPlaceholderTimer()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [startPlaceholderTimer])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const form = e.currentTarget.form
      if (form) {
        form.requestSubmit()
      }
    }
  }

  return (
    <div className={`relative w-full ${className}`}>
      <form
        onSubmit={handleSubmit}
        className="group flex h-13 w-full items-center gap-2 rounded-none border border-transparent bg-search pr-1.5 pl-4 transition-colors focus-within:border-accent focus-within:bg-white"
      >
        <MagnifyingGlass
          size={20}
          weight="bold"
          className="shrink-0 text-ink-3 transition-colors group-focus-within:text-accent"
          aria-hidden="true"
        />

        {/* Input & cycling placeholders */}
        <div className="relative flex h-full min-w-0 flex-1 items-center">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={onChange}
            onFocus={onFocus}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
            className="w-full bg-transparent py-2 text-body text-ink placeholder-transparent focus:outline-none"
          />

          {!value && placeholders.length > 0 && (
            <span
              className={`pointer-events-none absolute left-0 max-w-full truncate text-body text-ink-3 transition-all duration-200 select-none ${
                placeholderFade ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
              }`}
            >
              {placeholders[currentPlaceholder]}
            </span>
          )}
        </div>

        {value && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-tertiary hover:text-ink"
            title="ล้างข้อความ"
            aria-label="ล้างข้อความ"
          >
            <X size={15} weight="bold" />
          </button>
        )}

        <button type="submit" aria-label="ค้นหา" className="btn btn-primary btn-icon">
          <ArrowRight size={16} weight="bold" />
        </button>
      </form>
    </div>
  )
}
