import { useMemo, useState, useRef, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import {
  filterRooms,
  getExpandedSearchTerms,
  scheduleMatchesQuery,
  DEFAULT_CATEGORY_KEY,
} from '../services/filterRooms.ts'
import torchLogo from '../assets/torchv1.PNG'
import SearchBar from './SearchBar.tsx'
import CategoryFilter from './CategoryFilter.tsx'
import SearchResultList from './SearchResultList.tsx'
import type { Room } from '../types/room.ts'
import type { ScheduleSlot } from '../types/schedule.ts'

export interface RoomSearchPanelProps {
  rooms: Room[]
  schedules?: ScheduleSlot[]
  schedulesLoading?: boolean
  schedulesError?: Error | null
  loading?: boolean
  error?: Error | null
  /** ยิง event ออกไปเมื่อผู้ใช้กดเลือกห้องจากผลลัพธ์ ให้ parent ไปปักหมุด SVG / เปิด Room Detail Modal ต่อ */
  onSelectRoom: (roomId: string) => void
}

/**
 * Search & Filter Component — floating overlay บนแผนที่
 * รับข้อมูล rooms, loading, error จาก App.tsx
 * ควบคุมการเปิด/ปิด dropdown ผลลัพธ์ และซ่อน dropdown อัตโนมัติเมื่อเลือกห้อง
 */
export default function RoomSearchPanel({
  rooms,
  schedules = [],
  schedulesLoading = false,
  schedulesError = null,
  loading = false,
  error = null,
  onSelectRoom,
}: RoomSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [categoryKey, setCategoryKey] = useState(DEFAULT_CATEGORY_KEY)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isFilterExpanded, setIsFilterExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 640
    }
    return true
  })

  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasActiveFilter = categoryKey !== DEFAULT_CATEGORY_KEY
  const hasActiveQueryOrFilter = query.trim() !== '' || hasActiveFilter

  const results = useMemo(
    () => (hasActiveQueryOrFilter ? filterRooms(rooms, query, categoryKey, schedules) : []),
    [rooms, query, categoryKey, schedules, hasActiveQueryOrFilter]
  )

  const matchedSchedules = useMemo(() => {
    const searchTerms = getExpandedSearchTerms(query)
    return schedules.filter((schedule) => scheduleMatchesQuery(schedule, searchTerms))
  }, [query, schedules])

  const showDropdown = isDropdownOpen && hasActiveQueryOrFilter

  function handleQueryChange(newQuery: string) {
    setQuery(newQuery)
    setIsDropdownOpen(true)
  }

  function handleCategoryChange(newCategoryKey: string) {
    setCategoryKey(newCategoryKey)
    setIsDropdownOpen(true)
  }

  function handleSelect(roomId: string) {
    // 1. Immediately hide the search results dropdown
    setIsDropdownOpen(false)
    // 2. Dismiss mobile virtual keyboard
    inputRef.current?.blur()
    // 3. Automatically collapse filter bar on mobile to show more map area
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsFilterExpanded(false)
    }
    // 4. Trigger room selection
    onSelectRoom(roomId)
  }

  function handleInputFocus() {
    setIsDropdownOpen(true)
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setIsDropdownOpen(false)
      inputRef.current?.blur()
    }
  }

  useEffect(() => {
    function handlePointerDownOutside(event: MouseEvent | TouchEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
        inputRef.current?.blur()
      }
    }

    document.addEventListener('mousedown', handlePointerDownOutside)
    document.addEventListener('touchstart', handlePointerDownOutside)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside)
      document.removeEventListener('touchstart', handlePointerDownOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div
      ref={panelRef}
      className="w-full max-w-sm space-y-2.5 sm:space-y-3 rounded-3xl bg-white/95 px-4 py-3 sm:py-4 shadow-2xl backdrop-blur-md border border-slate-100/80 transition-all duration-200"
    >
      <div className="flex items-center justify-start mb-2 sm:mb-4">
        <img
          src={torchLogo}
          alt="TORCH Faculty Nav System"
          className="h-7 sm:h-10 w-auto object-contain"
        />
      </div>

      <SearchBar
        inputRef={inputRef}
        value={query}
        onChange={handleQueryChange}
        onFocus={handleInputFocus}
        onKeyDown={handleInputKeyDown}
        isFilterOpen={isFilterExpanded}
        hasActiveFilter={hasActiveFilter}
        onToggleFilter={() => setIsFilterExpanded((prev) => !prev)}
      />
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          isFilterExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <CategoryFilter value={categoryKey} onChange={handleCategoryChange} />
        </div>
      </div>
      {showDropdown && (
        <SearchResultList
          rooms={results}
          schedules={matchedSchedules}
          schedulesLoading={schedulesLoading}
          schedulesError={schedulesError}
          loading={loading}
          error={error}
          onSelectRoom={handleSelect}
          variant="legacy"
        />
      )}
    </div>
  )
}


