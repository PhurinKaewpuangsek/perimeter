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
 * PlaceholdersAndVanishInput
 *
 * Features:
 * 1. Gentle stationary cloud-like aura in Perimeter colors (red, pink, yellow) that drifts subtly without spinning.
 * 2. Smoothly cycling sliding placeholder prompts.
 * 3. Instant, snappy submission with zero lag or artificial vanishing delay.
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
    <div className={`relative w-full group ${className}`}>
      {/* 1. Fastwork-style Stationary Cloud-like Fog Aura (Perimeter Red / Pink / Yellow) - Subtle & Soft */}
      <div
        className="absolute -inset-x-3 sm:-inset-x-4 -inset-y-0.5 rounded-full pointer-events-none filter blur-lg sm:blur-xl opacity-30 group-hover:opacity-45 group-focus-within:opacity-50 transition-opacity duration-500 overflow-visible"
        aria-hidden="true"
      >
        <div className="w-full h-full rounded-full animate-cloud-aura bg-gradient-to-r from-rose-500/35 via-pink-500/30 via-amber-400/35 to-rose-500/30" />
      </div>

      {/* 2. Main Search Pill Form (Clean subtle border; no animated border colors) */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex items-center w-full h-12 sm:h-13 rounded-full bg-white border border-slate-200/90 px-3.5 sm:px-4 gap-2 transition-all shadow-sm group-focus-within:border-slate-300 group-focus-within:shadow-md"
      >
        {/* Left Magnifying Icon - Turns to Perimeter brand color on click / focus */}
        <MagnifyingGlass
          size={19}
          weight="bold"
          className="text-slate-400 group-focus-within:text-[#FF3366] transition-colors shrink-0"
        />

          {/* Input & Placeholders Area */}
          <div className="relative flex-1 flex items-center min-w-0 h-full">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={onChange}
              onFocus={onFocus}
              onKeyDown={handleKeyDown}
              aria-label={ariaLabel}
              className="w-full bg-transparent py-2 text-sm text-slate-800 placeholder-transparent focus:outline-none z-10"
            />

            {/* Sliding Animated Placeholders */}
            {!value && placeholders.length > 0 && (
              <span
                className={`pointer-events-none absolute left-0 text-sm text-slate-400 select-none transition-all duration-200 truncate max-w-full ${
                  placeholderFade
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 -translate-y-2'
                }`}
              >
                {placeholders[currentPlaceholder]}
              </span>
            )}
          </div>

          {/* Clear Button (X) */}
          {value && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 z-10"
              title="ล้างข้อความ"
              aria-label="ล้างข้อความ"
            >
              <X size={15} weight="bold" />
            </button>
          )}

          {/* Submit Arrow Button */}
          <button
            type="submit"
            aria-label="ค้นหา"
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 active:scale-95 transition-all cursor-pointer shadow-xs shrink-0 z-10"
          >
            <ArrowRight size={15} weight="bold" />
          </button>
        </form>
    </div>
  )
}
