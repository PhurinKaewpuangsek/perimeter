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

/**
 * Search field for the map workspace (DesignMD "Text Input (Search/Secondary)"):
 * grey box, square corners, 44px tall, turns white with a blue border on focus.
 */
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
    <div className="group flex h-11 w-full items-center gap-2 rounded-none border border-transparent bg-search px-3 transition-colors focus-within:border-accent focus-within:bg-white">
      <MagnifyingGlass
        size={18}
        weight="bold"
        className="shrink-0 text-ink-3 transition-colors group-focus-within:text-accent"
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
        className="h-full w-full min-w-0 border-none bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="ล้างการค้นหา"
          title="ล้างการค้นหา"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-tertiary hover:text-ink"
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
          className={`relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
            isFilterOpen
              ? 'bg-ink text-white'
              : hasActiveFilter
                ? 'bg-tertiary text-ink hover:bg-tertiary-hover'
                : 'text-ink-3 hover:bg-tertiary hover:text-ink'
          }`}
        >
          <List size={17} weight={hasActiveFilter ? 'bold' : 'regular'} />
          {hasActiveFilter && !isFilterOpen && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent" />
          )}
        </button>
      )}
    </div>
  )
}
