import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  SignIn,
  MapTrifold,
  MapPin,
  Calendar,
  X,
  Users,
} from '@phosphor-icons/react'
import { useRooms } from '../hooks/useRooms'
import { useSchedules } from '../hooks/useSchedules'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { usePreloadImages } from '../hooks/usePreloadImages'
import MapContainer from './map/MapContainer'
import { FLOOR_CONFIGS } from './map/floorConfig'
import SearchResultList from './SearchResultList'
import { PlaceholdersAndVanishInput } from './ui/PlaceholdersAndVanishInput'
import {
  filterRooms,
  DEFAULT_CATEGORY_KEY,
} from '../services/filterRooms'
import { useExamSearch } from '../hooks/useExamSearch'
import {
  getBuildingLabel,
  getCategoryLabel,
  getLandmarkText,
  getCategoryColor,
} from '../services/roomDisplay'
import { getCategoryIcon } from './categoryIcon'
import perimeterLogoNoBg from '../assets/perimeter_logo_negative_nobg.png'

const FLOOR_PLAN_ASSETS = FLOOR_CONFIGS.map((config) => config.asset)

const SEARCH_PLACEHOLDERS = [
  'รหัสวิชาหรือห้อง เช่น BAS350, LC3-101',
  'ค้นหาการสอบ เช่น BAS350 13:00',
  'ค้นหาห้องบรรยาย เช่น บรรยาย 1',
  'ค้นหาห้องน้ำชาย / หญิง',
  'ค้นหาห้อง 108/1, 102...',
  'ค้นหาห้องปฏิบัติการ หรือ Lab...',
  'ค้นหาห้องพักอาจารย์',
]

/**
 * LandingPage — Split Portal with Guest Preview Card & Mobile Regular Login
 *
 * Route: /
 * Features:
 * 1. Desktop: Split portal with instant search, interactive map preview, and guest preview card.
 * 2. Mobile: Clean branded screen with Regular User Login (Admin edit is desktop-only).
 * 3. Smooth slide-out transitions into /map.
 */
export default function LandingPage() {
  const navigate = useNavigate()
  const { rooms, loading, error } = useRooms()
  const {
    schedules,
    loading: schedulesLoading,
    error: schedulesError,
  } = useSchedules()
  usePreloadImages(FLOOR_PLAN_ASSETS)

  const isDesktop = useIsDesktop()
  const [currentFloor, setCurrentFloor] = useState(1)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [demoInterrupted, setDemoInterrupted] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSlidingOut, setIsSlidingOut] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId),
    [rooms, selectedRoomId]
  )

  const searchResults = useMemo(() => {
    if (!quickQuery.trim()) return []
    return filterRooms(rooms, quickQuery, DEFAULT_CATEGORY_KEY, schedules)
  }, [rooms, quickQuery, schedules])

  const {
    examResults,
    examSearchActive,
    pastExamsAvailable,
    showPastExams,
    toggleShowPastExams,
  } = useExamSearch(quickQuery, rooms, schedules)

  function handleRoomSelect(roomId: string) {
    setDemoInterrupted(true)
    setSelectedRoomId(roomId)
    setIsDropdownOpen(false)
    const targetRoom = rooms.find((r) => r.id === roomId)
    if (targetRoom && targetRoom.floor !== currentFloor) {
      setCurrentFloor(targetRoom.floor)
    }
  }

  function handleEnterFullMap(
    targetRoomId?: string | null,
    query?: string,
    navigationDestinationId?: string | null
  ) {
    setIsSlidingOut(true)
    setTimeout(() => {
      let targetUrl = '/map'
      const params = new URLSearchParams()
      if (targetRoomId) params.set('room', targetRoomId)
      if (query && query.trim()) params.set('q', query.trim())
      if (navigationDestinationId) params.set('navigate', navigationDestinationId)
      const paramStr = params.toString()
      if (paramStr) targetUrl += `?${paramStr}`
      navigate(targetUrl)
    }, 450)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!quickQuery.trim()) return

    if (examSearchActive) {
      setIsDropdownOpen(true)
      return
    }

    const matches = filterRooms(rooms, quickQuery, DEFAULT_CATEGORY_KEY, schedules)
    if (matches.length > 0) {
      handleRoomSelect(matches[0].id)
    } else {
      setIsDropdownOpen(true)
    }
  }

  function handleSignIn() {
    setIsSlidingOut(true)
    setTimeout(() => {
      navigate('/login')
    }, 400)
  }

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-surface-2 select-none">
      {/* Background Layer: Native MapContainer (Desktop only: hidden sm:block) */}
      <div
        className="absolute inset-0 z-0 hidden sm:block"
        style={{
          transform: isSlidingOut ? 'scale(1.05)' : 'scale(1)',
          transition: 'transform 500ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* display:none still mounts children; skip the 3D model download on phones */}
        {isDesktop && (
          <MapContainer
            rooms={rooms}
            currentFloor={currentFloor}
            onFloorChange={(floor) => {
              setCurrentFloor(floor)
            }}
            selectedRoomId={selectedRoomId}
            onSelectRoom={handleRoomSelect}
            onClearSelection={() => {
              setSelectedRoomId(null)
            }}
            initialScale={1.35}
            sidebarWidth={460}
            idleOrbit
            demoInterrupted={demoInterrupted}
          />
        )}
      </div>

      {/* Main Split Portal Overlay */}
      <div className="pointer-events-none relative z-2 flex h-full w-full">
        {/* Left panel on desktop / full-screen branded view on phones */}
        <aside
          style={{
            transform: isSlidingOut ? 'translateX(-100%)' : 'translateX(0)',
            opacity: isSlidingOut ? 0 : 1,
            transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease',
          }}
          className="pointer-events-auto flex h-full w-full flex-col justify-between border-r border-line-soft bg-white p-5 sm:w-[460px] sm:p-8"
        >
          <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
            {/* Top Branding (Prominent Logo) */}
            <div className="mb-6 flex w-full items-center justify-between sm:mb-8">
              <img
                src={perimeterLogoNoBg}
                alt="Perimeter"
                className="h-14 w-auto cursor-pointer object-contain sm:h-16"
                onClick={() => handleEnterFullMap()}
                title="Perimeter"
              />
            </div>

            {/* Hero: H1 36px in the 460px panel, 28px on phones (DesignMD collapsing steps) */}
            <h1 className="font-display text-[28px] leading-9 font-bold text-ink sm:text-h2">
              <span className="sm:hidden">Perimeter</span>
              <span className="hidden sm:inline">ค้นหาห้องเรียนและสถานที่ได้ทันที</span>
            </h1>
            <p className="mt-3 max-w-xs text-button text-ink-2 sm:max-w-none sm:text-body">
              <span className="sm:hidden">
                ผังอาคารเรียนรวม 3 (LC3) · ระบบแผนที่และสืบค้นห้องเรียน
              </span>
              <span className="hidden sm:inline">
                ผังอาคารเรียนรวม 3 (LC3) ค้นหาตามเลขห้องหรือชื่อสถานที่ (ตารางเรียนดูได้ในโหมดแผนที่เต็ม)
              </span>
            </p>

            {/* Desktop Only: Instant Command-Bar Search & Live Dropdown */}
            <div ref={searchContainerRef} className="relative mt-8 hidden w-full sm:block">
              {/* Search Box Input */}
              <div className="relative z-2">
                <PlaceholdersAndVanishInput
                  placeholders={SEARCH_PLACEHOLDERS}
                  value={quickQuery}
                  onChange={(e) => {
                    setQuickQuery(e.target.value)
                    setIsDropdownOpen(true)
                  }}
                  onFocus={() => {
                    setIsDropdownOpen(true)
                  }}
                  onClear={() => {
                    setQuickQuery('')
                    setIsDropdownOpen(false)
                  }}
                  onSubmit={handleSearchSubmit}
                />
              </div>

              {/* Quick Suggestion Chips */}
              <div className="relative z-1 mt-3 flex w-full flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-ink-3">แนะนำ:</span>
                {['LC3-101', 'ห้องบรรยาย', 'ห้องน้ำ'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setQuickQuery(chip)
                      setIsDropdownOpen(true)
                      const matches = filterRooms(rooms, chip, DEFAULT_CATEGORY_KEY, [])
                      if (matches.length > 0) {
                        handleRoomSelect(matches[0].id)
                      }
                    }}
                    className="btn btn-tertiary btn-sm"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Primary action: Sign in (black pill) below the search box */}
              <button
                type="button"
                onClick={handleSignIn}
                className="btn btn-primary btn-lg relative z-0 mt-6 hidden w-full sm:flex"
              >
                <SignIn size={20} weight="bold" />
                <span>เข้าสู่ระบบ (Sign in)</span>
              </button>

              {/* Live Search Results Dropdown (over the chips & Sign In button) */}
              {isDropdownOpen && quickQuery.trim() !== '' && (
                <div className="dropdown absolute inset-x-0 top-15 max-h-72 overflow-y-auto p-2 animate-fade-in">
                  <SearchResultList
                    rooms={searchResults}
                    allRooms={rooms}
                    schedules={schedules}
                    examResults={examResults}
                    examSearchActive={examSearchActive}
                    pastExamsAvailable={pastExamsAvailable}
                    showPastExams={showPastExams}
                    onToggleShowPastExams={toggleShowPastExams}
                    schedulesLoading={schedulesLoading}
                    schedulesError={schedulesError}
                    loading={loading}
                    error={error}
                    onSelectRoom={(roomId) => handleRoomSelect(roomId)}
                    onNavigateToRoom={(roomId) =>
                      handleEnterFullMap(null, quickQuery, roomId)
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mobile Only: Sign in + public map (button group stacks full-width) */}
          <div className="mx-auto my-auto w-full max-w-xs py-8 sm:hidden">
            <button type="button" onClick={handleSignIn} className="btn btn-primary btn-lg w-full">
              <SignIn size={20} weight="bold" />
              <span>เข้าสู่ระบบ (Sign in)</span>
            </button>
            {/* /map is public; without this a phone user has no way to reach it (the footer link is desktop-only). */}
            <button
              type="button"
              onClick={() => handleEnterFullMap()}
              className="btn btn-secondary btn-lg mt-3 w-full"
            >
              <MapTrifold size={20} weight="bold" />
              <span>ดูแผนที่ (ไม่ต้องเข้าสู่ระบบ)</span>
            </button>
          </div>

          {/* Footer */}
          <div className="border-t border-line-soft pt-4 pb-1">
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-3 select-none">
              <span>©</span>
              <span>Perimeter Navigation System · Faculty Map (Public Access)</span>
            </p>
          </div>
        </aside>

        {/* Right Area: Interactive Map Canvas */}
        <div className="pointer-events-none hidden flex-1 sm:block" />
      </div>

      {/* =========================================================================
          RIGHT GUEST PREVIEW CARD: Desktop only, appears when clicking a room
          ========================================================================= */}
      {selectedRoom && (
        <aside
          style={{
            transform: isSlidingOut ? 'translateX(120%)' : 'translateX(0)',
            opacity: isSlidingOut ? 0 : 1,
            transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease',
          }}
          className="card fixed top-6 right-6 z-2 hidden w-80 p-5 shadow-floating select-none animate-fade-in sm:block sm:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line-soft pb-2">
            <span className="text-xs font-bold text-ink-3 uppercase">
              {getBuildingLabel(selectedRoom.building)} · ชั้น {selectedRoom.floor}
            </span>
            <button
              type="button"
              onClick={() => setSelectedRoomId(null)}
              aria-label="ปิดพรีวิวห้อง"
              className="btn btn-ghost btn-icon-sm"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          {/* Room Title */}
          <div className="mt-3">
            <h2 className="font-display text-h3-sm font-bold text-ink">
              {selectedRoom.nameThai || 'ไม่ระบุชื่อห้อง'}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
              <span className="font-medium text-ink-2">
                ห้อง {selectedRoom.roomNumber || selectedRoom.code || '-'}
              </span>
              {selectedRoom.code && <span>({selectedRoom.code})</span>}
              {selectedRoom.capacity !== undefined && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} />
                    {selectedRoom.capacity} คน
                  </span>
                </>
              )}
            </div>

            {/* Category Pill (data colour, paired with icon + label) */}
            {(() => {
              const color = getCategoryColor(selectedRoom.category)
              const Icon = getCategoryIcon(selectedRoom.category, selectedRoom.nameThai)
              return (
                <span
                  className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full border ${color.border} ${color.bg} px-3 py-1 text-xs font-medium ${color.text}`}
                >
                  <Icon size={14} weight="duotone" />
                  <span>{getCategoryLabel(selectedRoom.category)}</span>
                </span>
              )
            })()}
          </div>

          {/* Nearby Landmarks */}
          {selectedRoom.landmarks && selectedRoom.landmarks.length > 0 && (
            <div className="surface mt-4 p-3">
              <p className="flex items-center gap-1.5 text-button font-medium text-ink">
                <MapPin size={14} weight="fill" className="text-ink" />
                <span>จุดสังเกตใกล้เคียง</span>
              </p>
              <ul className="mt-1.5 space-y-1">
                {selectedRoom.landmarks.map((landmark, idx) => (
                  <li key={idx} className="flex items-start gap-1 text-xs text-ink-2">
                    <span className="text-ink-3">·</span>
                    <span>{getLandmarkText(landmark)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Schedule Teaser Box (Guest mode: No full schedule, encourages entering full mode) */}
          <div className="surface mt-4 p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <Calendar size={16} weight="bold" />
              </div>
              <div>
                <p className="text-button font-bold text-ink">ตารางการใช้ห้องเรียนและสอบ</p>
                <p className="text-xs text-ink-2">ตารางเรียนและตารางสอบดูได้ในโหมดแผนที่เต็ม</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleEnterFullMap(selectedRoom.id)}
              className="btn btn-primary mt-3 w-full"
            >
              <span>เปิดดูตารางในโหมดแผนที่เต็ม</span>
              <ArrowRight size={14} weight="bold" />
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}
