import type { RefObject, KeyboardEvent } from 'react'
import { MagnifyingGlass, List, X } from '@phosphor-icons/react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  onFocus?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  inputRef?: RefObject<HTMLInputElement | null>
  placeholder?: string
  isFilterOpen?: boolean
  hasActiveFilter?: boolean
  onToggleFilter?: () => void
}

export default function SearchBar({
  value,
  onChange,
  onClear,
  onFocus,
  onKeyDown,
  inputRef,
  placeholder = 'ค้นหาห้องหรือรหัสวิชา เช่น 109, CS361',
  isFilterOpen,
  hasActiveFilter,
  onToggleFilter,
}: SearchBarProps) {
  function handleClear() {
    onChange('')
    onClear?.()
    inputRef?.current?.focus()
  }

  return (
    <div className="relative w-full group">
      {/* Fastwork-style Stationary Cloud-like Fog Aura (Subtle & Soft) */}
      <div
        className="absolute -inset-x-2 -inset-y-0.5 rounded-full pointer-events-none filter blur-md opacity-25 group-hover:opacity-35 group-focus-within:opacity-45 transition-opacity duration-300 overflow-visible"
        aria-hidden="true"
      >
        <div className="w-full h-full rounded-full animate-cloud-aura bg-gradient-to-r from-rose-500/35 via-pink-500/30 via-amber-400/35 to-rose-500/30" />
      </div>

      {/* Main Search Pill Container */}
      <div className="relative z-10 flex items-center w-full h-11 rounded-full bg-white border border-slate-200/90 px-3.5 gap-2 transition-all shadow-xs group-focus-within:border-slate-300 group-focus-within:shadow-md">
        <MagnifyingGlass
          size={18}
          weight="bold"
          className="shrink-0 text-slate-400 group-focus-within:text-[#FF3366] transition-colors"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="ค้นหาห้อง"
          className="w-full border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 z-10"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="ล้างการค้นหา"
            title="ล้างการค้นหา"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer z-10"
          >
            <X size={14} weight="bold" />
          </button>
        )}
        {onToggleFilter && (
          <button
            type="button"
            onClick={onToggleFilter}
            aria-label={isFilterOpen ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรอง'}
            aria-expanded={isFilterOpen}
            title={isFilterOpen ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรอง'}
            className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-200 cursor-pointer z-10 ${
              isFilterOpen
                ? 'bg-slate-100 text-slate-800'
                : hasActiveFilter
                  ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`}
          >
            <List size={17} weight={hasActiveFilter ? 'bold' : 'regular'} />
            {hasActiveFilter && !isFilterOpen && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}


