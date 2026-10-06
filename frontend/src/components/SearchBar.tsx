import type { RefObject, KeyboardEvent } from 'react'
import { MagnifyingGlass, List } from '@phosphor-icons/react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
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
  onFocus,
  onKeyDown,
  inputRef,
  placeholder = 'ค้นหาห้องหรือรหัสวิชา เช่น 109, CS361',
  isFilterOpen,
  hasActiveFilter,
  onToggleFilter,
}: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-slate-100/70 px-3.5 py-2.5">
      <MagnifyingGlass size={20} className="shrink-0 text-slate-400" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="ค้นหาห้อง"
        className="w-full border-none bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
      />
      {onToggleFilter && (
        <button
          type="button"
          onClick={onToggleFilter}
          aria-label={isFilterOpen ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรอง'}
          aria-expanded={isFilterOpen}
          title={isFilterOpen ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรอง'}
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200 cursor-pointer ${
            isFilterOpen
              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              : hasActiveFilter
                ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          }`}
        >
          <List size={18} weight={hasActiveFilter ? 'bold' : 'regular'} />
          {hasActiveFilter && !isFilterOpen && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500" />
          )}
        </button>
      )}
    </div>
  )
}


